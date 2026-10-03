"""Check actual HTTP representations, validators and bounded compression reuse."""
import functools
import gzip
import hashlib
import http.client
import http.server
import importlib.util
import pathlib
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("research_serve", ROOT / "scripts/serve.py")
serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.folder.name)
        self.payloads = {
            "web/index.html": "<!doctype html><p>代币研究</p>".encode(),
            "web/app.js": "const title = '代币研究';\n".encode(),
            "web/styles.css": b"body { color: #123; }\n",
            "data/dashboard-lite.json": '{"ticker":"HYPE","note":"真实数据"}\n'.encode(),
            "web/logo.png": b"\x89PNG\r\n\x1a\n" + bytes(range(256)),
        }
        for name, body in self.payloads.items():
            self.write(name, body)
        handler = type("QuietResearchHandler", (serve.ResearchHandler,), {
            "log_message": lambda *args: None,
            "compressed_cache": serve.CompressedFileCache(max_bytes=2048, max_entries=2),
        })
        self.cache = handler.compressed_cache
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0),
            functools.partial(handler, directory=str(self.root)))
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=2)
        self.folder.cleanup()

    def write(self, name, body):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)

    def request(self, path, method="GET", headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            connection.request(method, "/" + path, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_gzip_round_trip_for_mutable_text_and_index_directory(self):
        for name, original in self.payloads.items():
            if name.endswith(".png"):
                continue
            with self.subTest(name=name):
                status, headers, body = self.request(name, headers={"Accept-Encoding": "gzip"})
                self.assertEqual(status, 200)
                self.assertEqual(headers["Cache-Control"], "no-cache")
                self.assertEqual(headers["Content-Encoding"], "gzip")
                self.assertEqual(headers["Vary"], "Accept-Encoding")
                self.assertEqual(int(headers["Content-Length"]), len(body))
                self.assertEqual(gzip.decompress(body), original)
        status, headers, body = self.request("web/", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        self.assertEqual(gzip.decompress(body), self.payloads["web/index.html"])

    def test_only_content_addressed_evidence_gets_immutable_cache(self):
        body = b'{"days":[1,2,3]}\n'
        digest = hashlib.sha256(body).hexdigest()
        for name in [f"data/web/history-HYPE-2025-{digest}.json", f"data/responses/{digest}.json"]:
            self.write(name, body)
            status, headers, encoded = self.request(name, headers={"Accept-Encoding": "gzip"})
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "public, max-age=31536000, immutable")
            self.assertEqual(gzip.decompress(encoded), body)
        self.write("data/web/latest.json", body)
        self.assertEqual(self.request("data/web/latest.json")[1]["Cache-Control"], "no-cache")
        status, headers, _ = self.request(f"data/responses/{'f' * 64}.json")
        self.assertEqual(status, 404)
        self.assertEqual(headers["Cache-Control"], "no-cache")

    def test_head_and_conditional_gzip_have_no_body(self):
        name = "data/dashboard-lite.json"
        _, original_headers, encoded = self.request(name, headers={"Accept-Encoding": "gzip"})
        status, headers, body = self.request(name, method="HEAD", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        for field in ["ETag", "Content-Length", "Content-Encoding", "Vary", "Cache-Control"]:
            self.assertEqual(headers[field], original_headers[field])
        self.assertEqual(int(headers["Content-Length"]), len(encoded))
        for validator in [original_headers["ETag"], "W/" + original_headers["ETag"], "*"]:
            status, headers, body = self.request(name, headers={
                "Accept-Encoding": "gzip", "If-None-Match": validator})
            self.assertEqual(status, 304)
            self.assertEqual(body, b"")
            self.assertEqual(headers["ETag"], original_headers["ETag"])
            self.assertEqual(headers["Cache-Control"], "no-cache")
            self.assertEqual(headers["Vary"], "Accept-Encoding")
            self.assertNotIn("Content-Length", headers)
        status, _, body = self.request(name, method="HEAD", headers={
            "Accept-Encoding": "gzip", "If-None-Match": original_headers["ETag"]})
        self.assertEqual((status, body), (304, b""))

    def test_mtime_validator_and_etag_precedence(self):
        name = "web/app.js"
        _, headers, original = self.request(name)
        status, _, body = self.request(name, headers={"If-Modified-Since": headers["Last-Modified"]})
        self.assertEqual((status, body), (304, b""))
        status, _, body = self.request(name, headers={
            "If-Modified-Since": headers["Last-Modified"], "If-None-Match": '"stale"'})
        self.assertEqual((status, body), (200, original))
        self.assertEqual(self.request(name, headers={"If-Modified-Since": "invalid"})[0], 200)

    def test_encoding_negotiation_and_binary_identity(self):
        name = "web/app.js"
        _, zipped_headers, _ = self.request(name, headers={"Accept-Encoding": "gzip"})
        for accept in ["gzip;q=0, *;q=1", "gzip;q=invalid", "br", ""]:
            status, headers, body = self.request(name, headers={
                "Accept-Encoding": accept, "If-None-Match": zipped_headers["ETag"]})
            self.assertEqual(status, 200)
            self.assertNotIn("Content-Encoding", headers)
            self.assertEqual(body, self.payloads[name])
            self.assertNotEqual(headers["ETag"], zipped_headers["ETag"])
            self.assertEqual(headers["Vary"], "Accept-Encoding")
        status, headers, body = self.request("web/logo.png", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        self.assertNotIn("Content-Encoding", headers)
        self.assertNotIn("Vary", headers)
        self.assertEqual(body, self.payloads["web/logo.png"])

    def test_unchanged_files_reuse_compression_and_changes_invalidate_it(self):
        name = "web/app.js"
        with patch.object(serve.gzip, "compress", wraps=gzip.compress) as compress:
            _, first_headers, first = self.request(name, headers={"Accept-Encoding": "gzip"})
            self.assertEqual(self.request(name, headers={"Accept-Encoding": "gzip"})[2], first)
            self.assertEqual(compress.call_count, 1)
            changed = b"const changed = true;\n"
            self.write(name, changed)
            status, headers, body = self.request(name, headers={
                "Accept-Encoding": "gzip", "If-None-Match": first_headers["ETag"]})
            self.assertEqual(status, 200)
            self.assertEqual(gzip.decompress(body), changed)
            self.assertNotEqual(headers["ETag"], first_headers["ETag"])
            self.assertEqual(compress.call_count, 2)
            for extra in ["web/styles.css", "data/dashboard-lite.json"]:
                self.request(extra, headers={"Accept-Encoding": "gzip"})
            self.assertLessEqual(len(self.cache.entries), self.cache.max_entries)
            self.assertLessEqual(self.cache.bytes_used, self.cache.max_bytes)

    def test_compressed_byte_budget_evicts_and_skips_oversized_entries(self):
        cache = serve.CompressedFileCache(max_bytes=100, max_entries=64)
        self.server.RequestHandlerClass.func.compressed_cache = cache
        for name in ["web/app.js", "web/styles.css", "data/dashboard-lite.json"]:
            self.request(name, headers={"Accept-Encoding": "gzip"})
        self.assertLess(len(cache.entries), 3)
        self.assertLessEqual(cache.bytes_used, 100)
        original = b'{"text":"' + b"".join(hashlib.sha256(str(i).encode()).hexdigest().encode()
                                          for i in range(16)) + b'"}\n'
        self.write("data/large.json", original)
        status, headers, encoded = self.request("data/large.json", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Encoding"], "gzip")
        self.assertEqual(gzip.decompress(encoded), original)
        self.assertGreater(len(encoded), 100)
        self.assertFalse(any(key[0].endswith("/data/large.json") for key in cache.entries))
        self.assertLessEqual(cache.bytes_used, 100)


if __name__ == "__main__":
    unittest.main()
