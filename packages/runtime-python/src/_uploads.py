from __future__ import annotations

import os
from pathlib import Path
from typing import Any, BinaryIO, Dict, List, Mapping, Sequence, Tuple, Union

Uploadable = Union[BinaryIO, bytes, Tuple[str, BinaryIO], Tuple[str, bytes], Path]


def is_uploadable(value: object) -> bool:
    if isinstance(value, (bytes, Path)):
        return True
    if isinstance(value, tuple) and len(value) == 2:
        return isinstance(value[1], (bytes,)) or hasattr(value[1], "read")
    return hasattr(value, "read")


def has_uploadable(body: object) -> bool:
    if is_uploadable(body):
        return True
    if isinstance(body, dict):
        return any(has_uploadable(v) for v in body.values())
    if isinstance(body, (list, tuple)):
        return any(has_uploadable(v) for v in body)
    return False


def build_multipart_files(
    body: Dict[str, Any],
) -> List[Tuple[str, Any]]:
    files: List[Tuple[str, Any]] = []
    data: Dict[str, Any] = {}

    for key, value in body.items():
        if is_uploadable(value):
            files.append(_to_httpx_file(key, value))
        elif isinstance(value, list) and any(is_uploadable(v) for v in value):
            for item in value:
                if is_uploadable(item):
                    files.append(_to_httpx_file(key, item))
                else:
                    data[key] = item
        else:
            data[key] = value

    return files, data  # type: ignore[return-value]


def _to_httpx_file(key: str, value: Any) -> Tuple[str, Any]:
    if isinstance(value, Path):
        return (key, (value.name, open(value, "rb"), _guess_content_type(value.name)))
    if isinstance(value, bytes):
        return (key, (key, value, "application/octet-stream"))
    if isinstance(value, tuple) and len(value) == 2:
        filename, content = value
        if isinstance(content, bytes):
            return (key, (filename, content, _guess_content_type(filename)))
        return (key, (filename, content, _guess_content_type(filename)))
    if hasattr(value, "read"):
        name = getattr(value, "name", key)
        if isinstance(name, (bytes,)):
            name = name.decode("utf-8", errors="replace")
        return (key, (os.path.basename(name), value, _guess_content_type(name)))
    return (key, value)


def _guess_content_type(filename: str) -> str:
    import mimetypes

    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"
