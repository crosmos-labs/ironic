from __future__ import annotations

import json
from typing import Generic, Iterator, AsyncIterator, TypeVar

import httpx

T = TypeVar("T")


def _parse_sse_line(line: str) -> tuple[str | None, str | None]:
    if not line or line.startswith(":"):
        return None, None
    if ":" in line:
        field, _, value = line.partition(":")
        return field.strip(), value.strip()
    return line.strip(), ""


class Stream(Generic[T]):
    response: httpx.Response

    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self._iterator = self._stream()

    def _stream(self) -> Iterator[T]:
        data_buf: list[str] = []
        for raw_line in self.response.iter_lines():
            line = raw_line.rstrip("\n").rstrip("\r")
            if line == "":
                if data_buf:
                    payload = "\n".join(data_buf)
                    data_buf.clear()
                    if payload == "[DONE]":
                        return
                    yield json.loads(payload)
                continue
            field, value = _parse_sse_line(line)
            if field == "data" and value is not None:
                data_buf.append(value)

    def __iter__(self) -> Iterator[T]:
        return self._iterator

    def __next__(self) -> T:
        return next(self._iterator)

    def close(self) -> None:
        self.response.close()

    def __enter__(self) -> Stream[T]:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


class AsyncStream(Generic[T]):
    response: httpx.Response

    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self._iterator = self._stream()

    async def _stream(self) -> AsyncIterator[T]:
        data_buf: list[str] = []
        async for raw_line in self.response.aiter_lines():
            line = raw_line.rstrip("\n").rstrip("\r")
            if line == "":
                if data_buf:
                    payload = "\n".join(data_buf)
                    data_buf.clear()
                    if payload == "[DONE]":
                        return
                    yield json.loads(payload)
                continue
            field, value = _parse_sse_line(line)
            if field == "data" and value is not None:
                data_buf.append(value)

    def __aiter__(self) -> AsyncIterator[T]:
        return self._iterator

    async def __anext__(self) -> T:
        return await self._iterator.__anext__()

    async def close(self) -> None:
        await self.response.aclose()

    async def __aenter__(self) -> AsyncStream[T]:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()
