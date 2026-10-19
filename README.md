# RTSP Player

Desktop app (Angular 21 + Electron 44 + SQLite) for watching home CCTV cameras over RTSP,
either one camera at a time or several in a grid.

## Usage

```bash
npm install
npm start        # dev: ng serve + Electron with live reload of the UI
npm run electron # production build, run in Electron
npm run dist     # build a Windows installer into ./release
```

- **Cameras** tab: add/edit/delete/reorder cameras, with a *Test connection* button that grabs a snapshot.
  Each camera has an **HQ URL** (main stream, used in single view) and an **LQ URL** (sub-stream, used in grid
  view). Only one is required; if just one is set, it is used in both views.
- **Grid view**: Auto / 1×1 / 2×2 / 3×3 / 4×4 layouts (remembered), paging when there are more cameras than tiles.
  Click a tile to open it.
- **Single view**: full-resolution stream, ← / → to switch cameras, `F` for fullscreen, snapshot to JPEG.

## How it works

Browsers cannot play RTSP, so the Electron main process runs one bundled `ffmpeg`
(`ffmpeg-static`) per visible player. ffmpeg decodes the camera stream (H.264/H.265) and re-encodes it to
MJPEG (downscaled in grid view). The JPEG frames go to the renderer over IPC and are drawn on a `<canvas>`.
IPC instead of a local HTTP MJPEG server avoids Chromium's 6-connections-per-host limit, so grids with more
than six cameras still work.

```
electron/
  main.ts       window, IPC handlers, input validation
  preload.ts    contextBridge API exposed as window.rtspApi
  db.ts         SQLite (built-in node:sqlite) – cameras + settings tables, versioned migrations
  streams.ts    ffmpeg process management, MJPEG frame parsing, snapshots
  api-types.ts  types shared with the Angular app
src/app/
  core/camera-store.ts      signal-based store over window.rtspApi
  player/camera-player.ts   canvas player with status overlay + auto-reconnect
  grid/  single/  cameras/  the three screens
```

## Notes

- Data is stored in `%APPDATA%\rtsp-player\rtsp-player.db`. Camera URLs (which contain passwords) are
  encrypted with Electron `safeStorage` (Windows DPAPI). Passwords are masked in the UI and in error messages.
- SQLite uses Node's built-in `node:sqlite`, so there is no native module to compile.
- If a camera drops out, the player reconnects automatically every 5 seconds.
- Re-encoding to MJPEG costs CPU. Set the LQ URL to your camera's sub-stream (for example Dahua
  `subtype=1`, Hikvision `/Streaming/Channels/102`) to keep many cameras smooth in the grid.
