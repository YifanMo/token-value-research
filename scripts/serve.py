#!/usr/bin/env python3
"""Serve this research workspace on loopback only."""
import argparse
import functools
import http.server
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8765)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
class ResearchHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

handler = functools.partial(ResearchHandler, directory=str(root))
server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
print(f"研究框架 · http://127.0.0.1:{args.port}/web/", flush=True)
server.serve_forever()
