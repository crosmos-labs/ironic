from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from typing_extensions import TypedDict


class RequestOptions(TypedDict, total=False):
    headers: Dict[str, str]
    timeout: float
    max_retries: int
    extra_query: Dict[str, object]
    extra_body: Dict[str, object]
    extra_headers: Dict[str, str]


class ClientOptions(TypedDict, total=False):
    api_key: Optional[str]
    base_url: str
    timeout: float
    max_retries: int
    default_headers: Dict[str, str]
    default_query: Dict[str, object]
    http_client: object
