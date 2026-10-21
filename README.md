# RTSP Player

Desktop app (Angular 22 + Electron 44 + SQLite) for watching home CCTV cameras over RTSP,
either one camera at a time or several in a grid.

## Usage

```bash
npm install
npm start        # dev: ng serve + Electron with live reload of the UI
npm run electron # production build, run in Electron
npm run dist     # build a Windows installer into ./release
npm run lint     # ESLint for src/ and electron/ (npm run lint:fix to auto-fix)
npm run format   # Prettier (npm run format:check to verify only)
```

- **Cameras** tab: add/edit/delete/reorder cameras, with a *Test connection* button that grabs a snapshot.
  Each camera has an **HQ URL** (main stream, used in single view) and an **LQ URL** (sub-stream, used in grid
  view). Only one is required; if just one is set, it is used in both views.
- **Custom grid** (default page): your own choice of cameras in your own order, set with ✎ Edit and saved.
- **Grid view**: all cameras in Auto / 1×1 / 2×2 / 3×3 / 4×4 layouts, paging when there are more cameras than
  tiles.
- Both grids have an LQ/HQ stream toggle (LQ by default), Reload and Fullscreen. Click a tile to open it.
- **Single view**: full-resolution stream, ← / → to switch cameras, `F` for fullscreen, snapshot to JPEG.

## Automatic builds (GitHub Actions)

Every push to `master` runs [`.github/workflows/build.yml`](.github/workflows/build.yml) (it can also be
started by hand from the Actions tab):

1. **Lint and format check** on Linux; installers are only built when it passes.
2. **Installers**, built in parallel, each on its own platform:
   - Windows x64 (`windows-latest`): `RTSP Player Setup <version>.exe`
   - macOS Apple Silicon (`macos-26`): `RTSP Player-<version>-mac-arm64.dmg`
   - macOS Intel (`macos-26-intel`): `RTSP Player-<version>-mac-x64.dmg`

Download them from the run's **Artifacts** section (kept for 30 days).

The builds are not code-signed with a paid certificate. Windows SmartScreen asks for confirmation
(*More info → Run anyway*). On a Mac, the app is ad-hoc signed; because it was downloaded from the internet,
macOS blocks it the first time — right-click the app and choose **Open**, or run
`xattr -cr "/Applications/RTSP Player.app"`. On first camera connection macOS asks for permission to access
devices on the local network; allow it.

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
  app.*                     shell: title bar with window buttons, navigation, router outlet
  pages/                    routed screens
    grid-view/              Custom grid and Grid view pages (one component, mode from the route),
                            LQ/HQ toggle (+ custom-grid-editor/ side panel)
    single-view/            one camera at full resolution
    camera-manager/         camera list, add/edit form, import/export
  components/
    camera-player/          canvas player with status overlay + auto-reconnect
  services/
    camera-store.ts         signal-based store over window.rtspApi (database via IPC)
  utils/                    small helpers (IPC error messages, password masking)
```

The renderer imports the shared types as `@shared/api-types` and `@shared/settings-keys` (tsconfig path
aliases for the two files in `electron/` that both sides use).

## Notes

- Data is stored in `%APPDATA%\rtsp-player\rtsp-player.db` for the installed app and in
  `%APPDATA%\rtsp-player-dev\` when running from source (`npm start` / `npm run electron`, marked with a DEV
  badge). The two never share cameras or settings and can run side by side; use Export/Import on the Cameras
  page to copy cameras between them.
- Camera URLs (which contain passwords) are encrypted with Electron `safeStorage` (Windows DPAPI), with a key
  tied to that data folder. Passwords are masked in the UI and in error messages; exported JSON files contain
  them in plain text.
- SQLite uses Node's built-in `node:sqlite`, so there is no native module to compile.
- If a camera drops out, the player reconnects automatically every 5 seconds.
- Re-encoding to MJPEG costs CPU. Set the LQ URL to your camera's sub-stream (for example Dahua
  `subtype=1`, Hikvision `/Streaming/Channels/102`) to keep many cameras smooth in the grid.
