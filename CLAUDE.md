# RTSP Player

Angular 21 + Electron 44 desktop app for watching RTSP CCTV cameras. See README.md for features,
architecture and commands.

## Project structure (`src/app/`)

- `pages/` — routed screens, one folder per page (`pages/grid-view/grid-view.ts` + `.html` + `.scss`).
  A sub-component used only by one page lives in a subfolder of that page
  (`pages/grid-view/custom-grid-editor/`).
- `components/` — reusable components used by more than one page, one folder each.
- `services/` — injectable services; data access goes through `CameraStore` (`window.rtspApi` IPC to the
  Electron main process, which owns the SQLite database).
- `utils/` — small pure helper functions, one per file.
- App shell (`app.*`, `app.config.ts`, `app.routes.ts`) stays at the root of `src/app/`.
- Import types/constants shared with Electron via the `@shared/api-types` and `@shared/settings-keys`
  aliases, never with relative `../electron/` paths.

## Code conventions

- **Component templates live in their own `.html` file** next to the component, referenced with
  `templateUrl` (e.g. `camera-player.ts` + `camera-player.html`). No inline `template:` strings.
- **Component styles live in their own `.scss` file** next to the component, referenced with `styleUrl`.
  Style the component's own element with `:host` (not a host class); routed pages size their own `:host`.
- **`src/styles.scss` is for global styles only**: design tokens (`:root` variables), page base, and UI
  building blocks shared by several components (`.btn`, `.toolbar`, `.segmented`, `.card`, `.empty-state`,
  `.muted`, `.spacer`, `.form-actions`). A class used by one component belongs in that component's `.scss`.
