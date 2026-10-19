#!/usr/bin/env python3
import hmac
import os
import secrets
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parent
STREAM_TOKEN = secrets.token_urlsafe(32)


def valid_rtsp_url(value):
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme in ("rtsp", "rtsps")
            and parsed.hostname is not None
            and parsed.port != 0
            and not parsed.fragment
        )
    except ValueError:
        return False


class RequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path == "/":
            content = (ROOT / "index.html").read_bytes().replace(
                b"__STREAM_TOKEN__", STREAM_TOKEN.encode()
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        if not self.path.startswith("/stream?"):
            self.send_error(404)
            return

        parameters = parse_qs(urlsplit(self.path).query)
        token = parameters.get("token", [""])[0]
        if not hmac.compare_digest(token, STREAM_TOKEN):
            self.send_error(403, "Invalid stream token")
            return

        url = parameters.get("url", [""])[0]
        if not valid_rtsp_url(url):
            self.send_error(400, "A valid rtsp:// or rtsps:// URL is required")
            return

        command = [
            os.environ.get("RTSP_PLAYER_FFMPEG", "ffmpeg"),
            "-hide_banner",
            "-loglevel",
            "error",
            "-rtsp_transport",
            "tcp",
            "-i",
            url,
            "-an",
            "-c:v",
            "mjpeg",
            "-q:v",
            "5",
            "-f",
            "mpjpeg",
            "-boundary_tag",
            "ffmpeg",
            "pipe:1",
        ]
        try:
            process = subprocess.Popen(
                command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
            )
        except OSError:
            self.send_error(503, "FFmpeg is not installed or could not be started")
            return

        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=ffmpeg")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            while True:
                chunk = process.stdout.read1(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            process.stdout.close()


def main():
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), RequestHandler)
    print(f"RTSP Player running at http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
