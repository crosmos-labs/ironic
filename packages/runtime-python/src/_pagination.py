from __future__ import annotations

from typing import Any, Dict, Generic, List, Optional, Type, TypeVar

import httpx

T = TypeVar("T")


class SyncCursorPage(Generic[T]):
    data: List[T]
    has_more: bool

    def __init__(
        self,
        *,
        client: Any,
        data: List[T],
        has_more: bool = False,
        options: Dict[str, Any],
        items_key: str = "data",
        has_more_key: str = "has_more",
        cursor_param: str = "after",
        cursor_field: str = "id",
    ) -> None:
        self._client = client
        self.data = data
        self.has_more = has_more
        self._options = options
        self._items_key = items_key
        self._has_more_key = has_more_key
        self._cursor_param = cursor_param
        self._cursor_field = cursor_field

    def __iter__(self):  # type: ignore[override]
        yield from self.data

    def has_next_page(self) -> bool:
        return self.has_more and len(self.data) > 0

    def next_page(self) -> SyncCursorPage[T]:
        last = self.data[-1]
        cursor = last[self._cursor_field] if isinstance(last, dict) else getattr(last, self._cursor_field, None)
        query = {**self._options.get("query", {}), self._cursor_param: cursor}
        options = {**self._options, "query": query}
        return self._client._get_page(self.__class__, options)

    def iter_pages(self):  # type: ignore[override]
        page = self
        yield page
        while page.has_next_page():
            page = page.next_page()
            yield page

    def __iter_items(self):  # type: ignore[override]
        for page in self.iter_pages():
            yield from page.data

    @classmethod
    def _from_response(
        cls,
        response_body: Dict[str, Any],
        *,
        client: Any,
        options: Dict[str, Any],
        items_key: str = "data",
        has_more_key: str = "has_more",
        cursor_param: str = "after",
        cursor_field: str = "id",
    ) -> SyncCursorPage[T]:
        return cls(
            client=client,
            data=response_body.get(items_key, []),
            has_more=response_body.get(has_more_key, False),
            options=options,
            items_key=items_key,
            has_more_key=has_more_key,
            cursor_param=cursor_param,
            cursor_field=cursor_field,
        )


class AsyncCursorPage(Generic[T]):
    data: List[T]
    has_more: bool

    def __init__(
        self,
        *,
        client: Any,
        data: List[T],
        has_more: bool = False,
        options: Dict[str, Any],
        items_key: str = "data",
        has_more_key: str = "has_more",
        cursor_param: str = "after",
        cursor_field: str = "id",
    ) -> None:
        self._client = client
        self.data = data
        self.has_more = has_more
        self._options = options
        self._items_key = items_key
        self._has_more_key = has_more_key
        self._cursor_param = cursor_param
        self._cursor_field = cursor_field

    def __iter__(self):  # type: ignore[override]
        yield from self.data

    def has_next_page(self) -> bool:
        return self.has_more and len(self.data) > 0

    async def next_page(self) -> AsyncCursorPage[T]:
        last = self.data[-1]
        cursor = last[self._cursor_field] if isinstance(last, dict) else getattr(last, self._cursor_field, None)
        query = {**self._options.get("query", {}), self._cursor_param: cursor}
        options = {**self._options, "query": query}
        return await self._client._get_page(self.__class__, options)

    async def iter_pages(self):  # type: ignore[override]
        page = self
        yield page
        while page.has_next_page():
            page = await page.next_page()
            yield page

    @classmethod
    def _from_response(
        cls,
        response_body: Dict[str, Any],
        *,
        client: Any,
        options: Dict[str, Any],
        items_key: str = "data",
        has_more_key: str = "has_more",
        cursor_param: str = "after",
        cursor_field: str = "id",
    ) -> AsyncCursorPage[T]:
        return cls(
            client=client,
            data=response_body.get(items_key, []),
            has_more=response_body.get(has_more_key, False),
            options=options,
            items_key=items_key,
            has_more_key=has_more_key,
            cursor_param=cursor_param,
            cursor_field=cursor_field,
        )


class SyncOffsetPage(Generic[T]):
    data: List[T]
    total: int

    def __init__(
        self,
        *,
        client: Any,
        data: List[T],
        total: int = 0,
        options: Dict[str, Any],
        items_key: str = "data",
        total_key: str = "total",
        page_param: str = "page",
        per_page_param: str = "per_page",
    ) -> None:
        self._client = client
        self.data = data
        self.total = total
        self._options = options
        self._items_key = items_key
        self._total_key = total_key
        self._page_param = page_param
        self._per_page_param = per_page_param

    def __iter__(self):  # type: ignore[override]
        yield from self.data

    def has_next_page(self) -> bool:
        current_page = self._options.get("query", {}).get(self._page_param, 1)
        per_page = self._options.get("query", {}).get(self._per_page_param, len(self.data))
        return (current_page * per_page) < self.total

    def next_page(self) -> SyncOffsetPage[T]:
        current_page = self._options.get("query", {}).get(self._page_param, 1)
        query = {**self._options.get("query", {}), self._page_param: current_page + 1}
        options = {**self._options, "query": query}
        return self._client._get_page(self.__class__, options)

    @classmethod
    def _from_response(
        cls,
        response_body: Dict[str, Any],
        *,
        client: Any,
        options: Dict[str, Any],
        items_key: str = "data",
        total_key: str = "total",
        page_param: str = "page",
        per_page_param: str = "per_page",
    ) -> SyncOffsetPage[T]:
        return cls(
            client=client,
            data=response_body.get(items_key, []),
            total=response_body.get(total_key, 0),
            options=options,
            items_key=items_key,
            total_key=total_key,
            page_param=page_param,
            per_page_param=per_page_param,
        )


class AsyncOffsetPage(Generic[T]):
    data: List[T]
    total: int

    def __init__(
        self,
        *,
        client: Any,
        data: List[T],
        total: int = 0,
        options: Dict[str, Any],
        items_key: str = "data",
        total_key: str = "total",
        page_param: str = "page",
        per_page_param: str = "per_page",
    ) -> None:
        self._client = client
        self.data = data
        self.total = total
        self._options = options
        self._items_key = items_key
        self._total_key = total_key
        self._page_param = page_param
        self._per_page_param = per_page_param

    def __iter__(self):  # type: ignore[override]
        yield from self.data

    def has_next_page(self) -> bool:
        current_page = self._options.get("query", {}).get(self._page_param, 1)
        per_page = self._options.get("query", {}).get(self._per_page_param, len(self.data))
        return (current_page * per_page) < self.total

    async def next_page(self) -> AsyncOffsetPage[T]:
        current_page = self._options.get("query", {}).get(self._page_param, 1)
        query = {**self._options.get("query", {}), self._page_param: current_page + 1}
        options = {**self._options, "query": query}
        return await self._client._get_page(self.__class__, options)

    @classmethod
    def _from_response(
        cls,
        response_body: Dict[str, Any],
        *,
        client: Any,
        options: Dict[str, Any],
        items_key: str = "data",
        total_key: str = "total",
        page_param: str = "page",
        per_page_param: str = "per_page",
    ) -> AsyncOffsetPage[T]:
        return cls(
            client=client,
            data=response_body.get(items_key, []),
            total=response_body.get(total_key, 0),
            options=options,
            items_key=items_key,
            total_key=total_key,
            page_param=page_param,
            per_page_param=per_page_param,
        )
