from __future__ import annotations

import math
import os
import random
import time
from typing import Any, Dict, Generic, Mapping, Optional, Type, TypeVar, Union

import httpx

from ._errors import (
    APIConnectionError,
    APIError,
    APITimeoutError,
)
from ._types import ClientOptions, RequestOptions
from ._version import PACKAGE_NAME, VERSION

DEFAULT_MAX_RETRIES = 2
DEFAULT_TIMEOUT = 60.0

T = TypeVar("T")


def _merge_query(
    base: Dict[str, object],
    extra: Dict[str, object] | None,
) -> Dict[str, object]:
    if not extra:
        return base
    return {**base, **extra}


def _build_headers(
    *layers: Mapping[str, str | None] | None,
) -> Dict[str, str]:
    merged: Dict[str, str] = {}
    for layer in layers:
        if not layer:
            continue
        for key, value in layer.items():
            lower = key.lower()
            if value is None:
                merged.pop(lower, None)
            else:
                merged[lower] = value
    result: Dict[str, str] = {}
    for key, value in merged.items():
        result[key] = value
    return result


def _retry_delay(attempt: int) -> float:
    base = min(0.5 * (2**attempt), 8.0)
    jitter = 1.0 + (random.random() - 0.5) * 0.2
    return base * jitter


def _should_retry_status(status_code: int) -> bool:
    return status_code == 429 or status_code >= 500


def _should_retry_error(exc: Exception) -> bool:
    return isinstance(exc, (APITimeoutError, APIConnectionError))


class _BaseClient:
    base_url: str
    api_key: str
    max_retries: int
    timeout: float
    _default_headers: Dict[str, str]
    _default_query: Dict[str, object]

    def __init__(
        self,
        *,
        base_url: str = "",
        api_key: str = "",
        max_retries: int = DEFAULT_MAX_RETRIES,
        timeout: float = DEFAULT_TIMEOUT,
        default_headers: Dict[str, str] | None = None,
        default_query: Dict[str, object] | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.max_retries = max_retries
        self.timeout = timeout
        self._default_headers = default_headers or {}
        self._default_query = default_query or {}

    def _build_url(self, path: str, query: Dict[str, object] | None = None) -> str:
        merged = _merge_query(self._default_query, query)
        url = f"{self.base_url}{path}" if path.startswith("/") else path
        if merged:
            params = httpx.QueryParams(
                {k: v for k, v in merged.items() if v is not None}
            )
            url = f"{url}?{params}" if str(params) else url
        return url

    def _build_request_headers(
        self,
        extra: Dict[str, str] | None = None,
    ) -> Dict[str, str]:
        auth: Dict[str, str | None] = {}
        if self.api_key:
            auth["authorization"] = f"Bearer {self.api_key}"

        runtime: Dict[str, str | None] = {
            "accept": "application/json",
            "user-agent": f"{PACKAGE_NAME}/{VERSION} (ironic)",
            "content-type": "application/json",
        }

        return _build_headers(runtime, self._default_headers, auth, extra)


class SyncAPIClient(_BaseClient):
    _client: httpx.Client

    def __init__(self, **kwargs: Any) -> None:
        http_client = kwargs.pop("http_client", None)
        super().__init__(**kwargs)
        if http_client is not None and isinstance(http_client, httpx.Client):
            self._client = http_client
        else:
            self._client = httpx.Client()

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> SyncAPIClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: object | None = None,
        query: Dict[str, object] | None = None,
        headers: Dict[str, str] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> httpx.Response:
        from ._uploads import has_uploadable, build_multipart_files

        url = self._build_url(path, query)
        req_headers = self._build_request_headers(headers)
        content: bytes | None = None
        files = None
        data = None

        if body is not None:
            if isinstance(body, dict) and has_uploadable(body):
                files, data = build_multipart_files(body)
                req_headers.pop("content-type", None)
            else:
                import json as _json
                content = _json.dumps(body).encode("utf-8")

        retries_remaining = max_retries if max_retries is not None else self.max_retries
        req_timeout = timeout if timeout is not None else self.timeout

        return self._request_with_retry(
            method, url, req_headers, content, retries_remaining, req_timeout,
            files=files, data=data,
        )

    def _request_with_retry(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        content: bytes | None,
        retries_remaining: int,
        timeout: float,
        *,
        files: Any = None,
        data: Any = None,
    ) -> httpx.Response:
        try:
            kwargs: Dict[str, Any] = {
                "method": method,
                "url": url,
                "headers": headers,
                "timeout": timeout,
            }
            if files is not None:
                kwargs["files"] = files
                if data:
                    kwargs["data"] = data
            else:
                kwargs["content"] = content
            response = self._client.request(**kwargs)
        except httpx.TimeoutException:
            if retries_remaining > 0:
                time.sleep(_retry_delay(self.max_retries - retries_remaining))
                return self._request_with_retry(
                    method, url, headers, content, retries_remaining - 1, timeout,
                    files=files, data=data,
                )
            raise APITimeoutError()
        except httpx.ConnectError as exc:
            if retries_remaining > 0:
                time.sleep(_retry_delay(self.max_retries - retries_remaining))
                return self._request_with_retry(
                    method, url, headers, content, retries_remaining - 1, timeout,
                    files=files, data=data,
                )
            raise APIConnectionError(str(exc), cause=exc)

        if _should_retry_status(response.status_code) and retries_remaining > 0:
            retry_after = response.headers.get("retry-after")
            if retry_after:
                delay = float(retry_after)
            else:
                delay = _retry_delay(self.max_retries - retries_remaining)
            time.sleep(delay)
            return self._request_with_retry(
                method, url, headers, content, retries_remaining - 1, timeout,
                files=files, data=data,
            )

        if not response.is_success:
            raise APIError._from_response(response)

        return response

    def get(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._request("POST", path, **kwargs)

    def put(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._request("PUT", path, **kwargs)

    def patch(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._request("PATCH", path, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> httpx.Response:
        return self._request("DELETE", path, **kwargs)

    def _stream(self, method: str, path: str, **kwargs: Any) -> Any:
        from ._streaming import Stream

        response = self._request(method, path, headers={"accept": "text/event-stream"}, **kwargs)
        return Stream(response)

    def _get_page(self, page_cls: type, path: str, **kwargs: Any) -> Any:
        response = self._request("GET", path, **kwargs)
        body = response.json()
        return page_cls._from_response(body, client=self, options={"path": path, **kwargs})


class AsyncAPIClient(_BaseClient):
    _client: httpx.AsyncClient

    def __init__(self, **kwargs: Any) -> None:
        http_client = kwargs.pop("http_client", None)
        super().__init__(**kwargs)
        if http_client is not None and isinstance(http_client, httpx.AsyncClient):
            self._client = http_client
        else:
            self._client = httpx.AsyncClient()

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> AsyncAPIClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        body: object | None = None,
        query: Dict[str, object] | None = None,
        headers: Dict[str, str] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> httpx.Response:
        from ._uploads import has_uploadable, build_multipart_files

        url = self._build_url(path, query)
        req_headers = self._build_request_headers(headers)
        content: bytes | None = None
        files = None
        data = None

        if body is not None:
            if isinstance(body, dict) and has_uploadable(body):
                files, data = build_multipart_files(body)
                req_headers.pop("content-type", None)
            else:
                import json as _json
                content = _json.dumps(body).encode("utf-8")

        retries_remaining = max_retries if max_retries is not None else self.max_retries
        req_timeout = timeout if timeout is not None else self.timeout

        return await self._request_with_retry(
            method, url, req_headers, content, retries_remaining, req_timeout,
            files=files, data=data,
        )

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        content: bytes | None,
        retries_remaining: int,
        timeout: float,
        *,
        files: Any = None,
        data: Any = None,
    ) -> httpx.Response:
        import asyncio

        try:
            kwargs: Dict[str, Any] = {
                "method": method,
                "url": url,
                "headers": headers,
                "timeout": timeout,
            }
            if files is not None:
                kwargs["files"] = files
                if data:
                    kwargs["data"] = data
            else:
                kwargs["content"] = content
            response = await self._client.request(**kwargs)
        except httpx.TimeoutException:
            if retries_remaining > 0:
                await asyncio.sleep(_retry_delay(self.max_retries - retries_remaining))
                return await self._request_with_retry(
                    method, url, headers, content, retries_remaining - 1, timeout,
                    files=files, data=data,
                )
            raise APITimeoutError()
        except httpx.ConnectError as exc:
            if retries_remaining > 0:
                await asyncio.sleep(_retry_delay(self.max_retries - retries_remaining))
                return await self._request_with_retry(
                    method, url, headers, content, retries_remaining - 1, timeout,
                    files=files, data=data,
                )
            raise APIConnectionError(str(exc), cause=exc)

        if _should_retry_status(response.status_code) and retries_remaining > 0:
            retry_after = response.headers.get("retry-after")
            if retry_after:
                delay = float(retry_after)
            else:
                delay = _retry_delay(self.max_retries - retries_remaining)
            await asyncio.sleep(delay)
            return await self._request_with_retry(
                method, url, headers, content, retries_remaining - 1, timeout,
                files=files, data=data,
            )

        if not response.is_success:
            raise APIError._from_response(response)

        return response

    async def get(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self._request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self._request("POST", path, **kwargs)

    async def put(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self._request("PUT", path, **kwargs)

    async def patch(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self._request("PATCH", path, **kwargs)

    async def delete(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self._request("DELETE", path, **kwargs)

    async def _stream(self, method: str, path: str, **kwargs: Any) -> Any:
        from ._streaming import AsyncStream

        response = await self._request(method, path, headers={"accept": "text/event-stream"}, **kwargs)
        return AsyncStream(response)

    async def _get_page(self, page_cls: type, path: str, **kwargs: Any) -> Any:
        response = await self._request("GET", path, **kwargs)
        body = response.json()
        return page_cls._from_response(body, client=self, options={"path": path, **kwargs})


class SyncAPIResource:
    _client: SyncAPIClient

    def __init__(self, client: SyncAPIClient) -> None:
        self._client = client


class AsyncAPIResource:
    _client: AsyncAPIClient

    def __init__(self, client: AsyncAPIClient) -> None:
        self._client = client
