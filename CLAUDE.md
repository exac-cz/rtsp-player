# RTSP Player

Angular 21 + Electron 44 desktop app for watching RTSP CCTV cameras. See README.md for features,
architecture and commands.

## Code conventions

- **Component templates live in their own `.html` file** next to the component, referenced with
  `templateUrl` (e.g. `camera-player.ts` + `camera-player.html`). No inline `template:` strings.
- **Component styles live in their own `.scss` file** next to the component, referenced with `styleUrl`.
  Style the component's own element with `:host` (not a host class); routed pages size their own `:host`.
- **`src/styles.scss` is for global styles only**: design tokens (`:root` variables), page base, and UI
  building blocks shared by several components (`.btn`, `.toolbar`, `.segmented`, `.card`, `.empty-state`,
  `.muted`, `.spacer`, `.form-actions`). A class used by one component belongs in that component's `.scss`.
