#!/usr/bin/env python3
"""Validation-only static server for the compiled standalone deployment."""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import shutil
from pathlib import Path


class StaticStudioHandler(http.server.SimpleHTTPRequestHandler):
    """Serve immutable assets with conservative browser security headers."""

    def end_headers(self) -> None:
        self.send_header("Content-Security-Policy", "default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        if "/assets/" in self.path:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, message_format: str, *arguments: object) -> None:
        return


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=0, type=int)
    parser.add_argument("--assert-zero-node", action="store_true")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    root = arguments.root.resolve(strict=True)
    if arguments.assert_zero_node:
        forbidden = [name for name in ("node", "npm", "npx", "vite") if shutil.which(name)]
        if forbidden:
            raise RuntimeError(f"Forbidden production executables are visible: {', '.join(forbidden)}")
    handler = functools.partial(StaticStudioHandler, directory=str(root))
    with http.server.ThreadingHTTPServer((arguments.host, arguments.port), handler) as server:
        address, port = server.server_address
        print(json.dumps({"ready": True, "url": f"http://{address}:{port}"}), flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
