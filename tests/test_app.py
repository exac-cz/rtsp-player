from io import BytesIO
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

from app import RequestHandler, STREAM_TOKEN, valid_rtsp_url


class RtspUrlTests(unittest.TestCase):
    def test_accepts_rtsp_schemes(self):
        self.assertTrue(valid_rtsp_url("rtsp://camera.local/live"))
        self.assertTrue(valid_rtsp_url("rtsps://camera.local/live"))

    def test_rejects_non_rtsp_and_malformed_urls(self):
        for value in ("", "http://camera/live", "rtsp:///live", "rtsp://camera:bad/live"):
            with self.subTest(value=value):
                self.assertFalse(valid_rtsp_url(value))


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), RequestHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_homepage_serves_player_controls(self):
        with urlopen(self.base_url) as response:
            page = response.read().decode()
        self.assertIn("RTSP Player", page)
        self.assertIn('id="url"', page)
        self.assertIn('id="stop"', page)
        self.assertIn(STREAM_TOKEN, page)

    def test_stream_rejects_missing_token_without_starting_ffmpeg(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(f"{self.base_url}/stream?url=rtsp%3A%2F%2Fcamera%2Flive")
        self.assertEqual(error.exception.code, 403)

    def test_stream_rejects_invalid_url_without_starting_ffmpeg(self):
        query = urlencode({"url": "http://camera/live", "token": STREAM_TOKEN})
        with self.assertRaises(HTTPError) as error:
            urlopen(f"{self.base_url}/stream?{query}")
        self.assertEqual(error.exception.code, 400)

    def test_stream_passes_camera_url_to_ffmpeg_and_returns_output(self):
        camera_url = "rtsp://camera.local/live"
        process = Mock()
        process.stdout = BytesIO(b"mjpeg frame")
        query = urlencode({"url": camera_url, "token": STREAM_TOKEN})
        with patch("app.subprocess.Popen", return_value=process) as popen:
            with urlopen(f"{self.base_url}/stream?{query}") as response:
                self.assertEqual(response.headers["Content-Type"], "multipart/x-mixed-replace; boundary=ffmpeg")
                self.assertEqual(response.read(), b"mjpeg frame")

        command = popen.call_args.args[0]
        self.assertEqual(command[command.index("-i") + 1], camera_url)
        self.assertFalse(popen.call_args.kwargs["shell"])
        process.terminate.assert_called_once()


if __name__ == "__main__":
    unittest.main()
