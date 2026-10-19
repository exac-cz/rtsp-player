# RTSP Player

Angular 21 + Electron 44 desktop app for watching RTSP CCTV cameras. See README.md for features,
architecture and commands.

## Code conventions

- **Component templates live in their own `.html` file** next to the component, referenced with
  `templateUrl` (e.g. `camera-player.ts` + `camera-player.html`). No inline `template:` strings.
