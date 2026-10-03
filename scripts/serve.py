#!/usr/bin/env python3
"""Serve this research workspace on loopback with revalidation and gzip."""
import argparse
from collections import OrderedDict
import datetime as dt
import email.utils
import functools
import gzip
import http.server
import io
import os
from pathlib import Path
import re
import threading

ROOT = Path(__file__).resolve().parents[1]
CONTENT_HASH = re.compile(r"(?:^|-)[0-9a-f]{64}\.[a-z0-9]+$", re.I)


def file_signature(info):
    return info.st_mtime_ns, info.st_ctime_ns, info.st_size, info.st_ino


class CompressedFileCache:
    """Bound compressed bytes and entries; unchanged files compress only once."""

    def __init__(self, max_bytes=16 * 1024 * 1024, max_entries=64):
        self.max_bytes = max_bytes
        self.max_entries = max_entries
        self.entries = OrderedDict()
        self.bytes_used = 0
        self.lock = threading.Lock()

    def get(self, path, info, source):
        key = (str(path), file_signature(info))
        with self.lock:
            if key in self.entries:
                self.entries.move_to_end(key)
                return self.entries[key]
            payload = gzip.compress(source.read(), compresslevel=5, mtime=0)
            # Retain only the current version of a mutable file.
            for previous in list(self.entries):
                if previous[0] == key[0]:
                    self.bytes_used -= len(self.entries.pop(previous))
            if len(payload) <= self.max_bytes and self.max_entries > 0:
                while self.entries and (len(self.entries) >= self.max_entries or
                                        self.bytes_used + len(payload) > self.max_bytes):
                    _, removed = self.entries.popitem(last=False)
                    self.bytes_used -= len(removed)
                self.entries[key] = payload
                self.bytes_used += len(payload)
            return payload


def accepts_gzip(header):
    qualities = {}
    for item in header.split(","):
        coding, *parameters = item.strip().lower().split(";")
        if not coding:
            continue
        quality = 1.0
        for parameter in parameters:
            name, separator, value = parameter.strip().partition("=")
            if separator and name == "q":
                try:
                    quality = float(value)
                except ValueError:
                    quality = 0.0
        qualities[coding] = quality if 0 <= quality <= 1 else 0.0
    return qualities.get("gzip", qualities.get("*", 0.0)) > 0


def compressible(content_type):
    return content_type.startswith("text/") or content_type in {
        "application/json", "application/javascript", "application/x-javascript",
        "application/xml", "application/xhtml+xml", "image/svg+xml",
    }


class ResearchHandler(http.server.SimpleHTTPRequestHandler):
    compressed_cache = CompressedFileCache()

    def cache_control(self, path):
        try:
            relative = Path(path).relative_to(Path(self.directory))
        except ValueError:
            return "no-cache"
        if (relative.parts[:2] in {("data", "web"), ("data", "responses")} and
                CONTENT_HASH.search(relative.name)):
            return "public, max-age=31536000, immutable"
        return "no-cache"

    def end_headers(self):
        # Redirects, errors and directory listings also remain revalidatable.
        self.send_header("Cache-Control", getattr(self, "_cache_control", "no-cache"))
        super().end_headers()

    def not_modified(self, info, etag):
        candidates = self.headers.get("If-None-Match")
        if candidates is not None:
            return any(candidate.strip().removeprefix("W/") in {etag, "*"}
                       for candidate in candidates.split(","))
        modified_since = self.headers.get("If-Modified-Since")
        if modified_since:
            try:
                since = email.utils.parsedate_to_datetime(modified_since)
                if since.tzinfo is None:
                    since = since.replace(tzinfo=dt.timezone.utc)
                return int(info.st_mtime) <= since.timestamp()
            except (TypeError, ValueError, OverflowError):
                pass
        return False

    def representation_headers(self, info, etag, varies, zipped):
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", self.date_time_string(info.st_mtime))
        if varies:
            self.send_header("Vary", "Accept-Encoding")
        if zipped:
            self.send_header("Content-Encoding", "gzip")

    def send_head(self):
        self._cache_control = "no-cache"
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            # Keep the standard redirect and directory-listing behavior.
            if not self.path.split("?", 1)[0].endswith("/"):
                return super().send_head()
            for index in ("index.html", "index.htm"):
                candidate = os.path.join(path, index)
                if os.path.isfile(candidate):
                    path = candidate
                    break
            else:
                return super().send_head()
        elif path.endswith("/"):
            self.send_error(404, "File not found")
            return None
        try:
            source = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None
        try:
            info = os.fstat(source.fileno())
            content_type = self.guess_type(path)
            varies = compressible(content_type)
            zipped = varies and accepts_gzip(self.headers.get("Accept-Encoding", ""))
            fingerprint = "-".join(f"{value:x}" for value in file_signature(info))
            etag = f'"{fingerprint}-{"gzip" if zipped else "identity"}"'
            self._cache_control = self.cache_control(path)
            if self.not_modified(info, etag):
                self.send_response(304)
                self.representation_headers(info, etag, varies, zipped)
                self.end_headers()
                source.close()
                return None
            if zipped:
                payload = self.compressed_cache.get(path, info, source)
                source.close()
                source = io.BytesIO(payload)
                length = len(payload)
            else:
                length = info.st_size
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.representation_headers(info, etag, varies, zipped)
            self.end_headers()
            return source
        except Exception:
            source.close()
            raise


def create_server(port=8765, directory=ROOT):
    handler = functools.partial(ResearchHandler, directory=str(directory))
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    with create_server(args.port) as server:
        print(f"研究框架 · http://127.0.0.1:{server.server_port}/web/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
