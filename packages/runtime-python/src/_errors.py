from __future__ import annotations

import httpx


class APIError(Exception):
    message: str
    status_code: int
    body: object | None
    headers: httpx.Headers

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        body: object | None = None,
        headers: httpx.Headers | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.body = body
        self.headers = headers or httpx.Headers()

    @staticmethod
    def _from_response(response: httpx.Response) -> APIError:
        body: object | None = None
        message: str | None = None
        try:
            data = response.json()
            body = data
            if isinstance(data, dict):
                message = data.get("message")
                if not message:
                    err = data.get("error")
                    if isinstance(err, dict):
                        message = err.get("message")
        except Exception:
            pass

        if not message:
            message = f"Request failed with status {response.status_code}"

        cls = _STATUS_MAP.get(response.status_code, APIError)
        return cls(
            message,
            status_code=response.status_code,
            body=body,
            headers=response.headers,
        )


class BadRequestError(APIError):
    def __init__(self, message: str, **kwargs: object) -> None:
        super().__init__(message, status_code=400, **kwargs)  # type: ignore[arg-type]


class AuthenticationError(APIError):
    def __init__(self, message: str, **kwargs: object) -> None:
        super().__init__(message, status_code=401, **kwargs)  # type: ignore[arg-type]


class PermissionDeniedError(APIError):
    def __init__(self, message: str, **kwargs: object) -> None:
        super().__init__(message, status_code=403, **kwargs)  # type: ignore[arg-type]


class NotFoundError(APIError):
    def __init__(self, message: str, **kwargs: object) -> None:
        super().__init__(message, status_code=404, **kwargs)  # type: ignore[arg-type]


class ConflictError(APIError):
    def __init__(self, message: str, **kwargs: object) -> None:
        super().__init__(message, status_code=409, **kwargs)  # type: ignore[arg-type]


class UnprocessableEntityError(APIError):
    def __init__(self, message: str, **kwargs: object) -> None:
        super().__init__(message, status_code=422, **kwargs)  # type: ignore[arg-type]


class RateLimitError(APIError):
    def __init__(self, message: str, **kwargs: object) -> None:
        super().__init__(message, status_code=429, **kwargs)  # type: ignore[arg-type]


class InternalServerError(APIError):
    def __init__(self, message: str, **kwargs: object) -> None:
        super().__init__(message, status_code=500, **kwargs)  # type: ignore[arg-type]


class APIConnectionError(Exception):
    message: str

    def __init__(self, message: str = "Connection error", *, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.__cause__ = cause


class APITimeoutError(APIConnectionError):
    def __init__(self) -> None:
        super().__init__("Request timed out")


_STATUS_MAP: dict[int, type[APIError]] = {
    400: BadRequestError,
    401: AuthenticationError,
    403: PermissionDeniedError,
    404: NotFoundError,
    409: ConflictError,
    422: UnprocessableEntityError,
    429: RateLimitError,
    500: InternalServerError,
}
