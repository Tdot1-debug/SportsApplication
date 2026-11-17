"""Minimal trusted client for Supabase REST RPCs and Storage, authenticated with the service key.

The worker only ever touches storage paths that came from the database row it claimed; it never
fetches arbitrary user-supplied URLs.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import httpx

BUCKET = "videos"
_SAFE_PATH = re.compile(r"^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._/-]+$")


class SupabaseError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status

    @property
    def retryable(self) -> bool:
        return self.status is None or self.status >= 500 or self.status in (408, 429)


def check_object_path(path: str) -> str:
    if not _SAFE_PATH.match(path) or ".." in path:
        raise SupabaseError(f"Refusing unexpected storage path: {path!r}", 400)
    return path


class SupabaseClient:
    def __init__(self, url: str, secret_key: str, timeout: float = 60.0):
        self.url = url.rstrip("/")
        self._headers = {"apikey": secret_key, "Authorization": f"Bearer {secret_key}"}
        self.http = httpx.Client(timeout=httpx.Timeout(timeout, connect=10.0), headers=self._headers)

    def close(self) -> None:
        self.http.close()

    # ---------------------------------------------------------------- RPC
    def rpc(self, fn: str, args: dict[str, Any]) -> Any:
        try:
            r = self.http.post(f"{self.url}/rest/v1/rpc/{fn}", json=args, headers={"Content-Type": "application/json"})
        except httpx.HTTPError as e:
            raise SupabaseError(f"rpc {fn} transport error: {e}") from e
        if r.status_code >= 400:
            raise SupabaseError(f"rpc {fn} failed ({r.status_code}): {r.text[:500]}", r.status_code)
        if not r.content:
            return None
        return r.json()

    # ------------------------------------------------------------ Storage
    def download(self, path: str, dest: Path, max_bytes: int) -> int:
        check_object_path(path)
        written = 0
        with self.http.stream("GET", f"{self.url}/storage/v1/object/authenticated/{BUCKET}/{path}") as r:
            if r.status_code >= 400:
                raise SupabaseError(f"download failed ({r.status_code})", r.status_code)
            with dest.open("wb") as f:
                for chunk in r.iter_bytes(1024 * 1024):
                    written += len(chunk)
                    if written > max_bytes:
                        raise SupabaseError("Stored object exceeds the configured size limit", 413)
                    f.write(chunk)
        return written

    def upload(self, path: str, src: Path, content_type: str) -> None:
        check_object_path(path)
        with src.open("rb") as f:
            r = self.http.post(
                f"{self.url}/storage/v1/object/{BUCKET}/{path}",
                content=f.read(),
                headers={"Content-Type": content_type, "x-upsert": "true", "cache-control": "3600"},
            )
        if r.status_code >= 400:
            raise SupabaseError(f"upload failed ({r.status_code}): {r.text[:300]}", r.status_code)

    def list_prefix(self, prefix: str) -> list[str]:
        if not re.match(r"^[0-9a-f-]{36}/[0-9a-f-]{36}/$", prefix):
            raise SupabaseError(f"Refusing unexpected prefix {prefix!r}", 400)
        names: list[str] = []
        pending = [prefix]
        while pending:
            p = pending.pop()
            r = self.http.post(
                f"{self.url}/storage/v1/object/list/{BUCKET}",
                content=json.dumps({"prefix": p, "limit": 1000, "offset": 0}),
                headers={"Content-Type": "application/json"},
            )
            if r.status_code >= 400:
                raise SupabaseError(f"list failed ({r.status_code})", r.status_code)
            for item in r.json():
                full = f"{p}{item['name']}"
                if item.get("id") is None:  # folder placeholder
                    pending.append(full + "/")
                else:
                    names.append(full)
        return names

    def remove(self, paths: list[str]) -> int:
        if not paths:
            return 0
        for p in paths:
            check_object_path(p)
        r = self.http.request(
            "DELETE",
            f"{self.url}/storage/v1/object/{BUCKET}",
            content=json.dumps({"prefixes": paths}),
            headers={"Content-Type": "application/json"},
        )
        if r.status_code >= 400:
            raise SupabaseError(f"delete failed ({r.status_code})", r.status_code)
        return len(r.json() or [])
