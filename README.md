# RTSP Player

A small local web player for home CCTV cameras. FFmpeg converts an RTSP stream
to MJPEG, which can be displayed directly in a browser.

## Requirements

- Python 3.8 or newer
- FFmpeg installed and available on `PATH`

## Run

```sh
python3 app.py
```

Open <http://127.0.0.1:8000> and enter the camera's `rtsp://` or `rtsps://`
URL. Camera credentials can be included in the URL if required. Use **Stop** to
close the stream. The server listens only on the local machine.

Set `PORT` to change the HTTP port, or `RTSP_PLAYER_FFMPEG` to select a
different FFmpeg executable.

## Tests

```sh
python3 -m unittest discover -s tests
```