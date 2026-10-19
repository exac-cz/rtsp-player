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

- **Code must pass `npm run lint`** (ESLint: typescript-eslint recommended + stylistic, angular-eslint
  incl. template accessibility; covers `src/` and `electron/`). Fix the cause rather than disabling a rule;
  if a rule really has to be disabled, do it on the line with a comment saying why.
- **Formatting is Prettier's** (`.prettierrc`, 100 columns, single quotes): run `npm run format` before
  committing; `npm run format:check` must pass. Use a bare `// prettier-ignore` line only where manual
  alignment carries meaning (e.g. ffmpeg option/value pairs in `electron/streams.ts`).

- **Component templates live in their own `.html` file** next to the component, referenced with
  `templateUrl` (e.g. `camera-player.ts` + `camera-player.html`). No inline `template:` strings.
- **Component styles live in their own `.scss` file** next to the component, referenced with `styleUrl`.
  Style the component's own element with `:host` (not a host class); routed pages size their own `:host`.
- **`src/styles.scss` is for global styles only**: design tokens (`:root` variables), page base, and UI
  building blocks shared by several components (`.btn`, `.toolbar`, `.segmented`, `.card`, `.empty-state`,
  `.muted`, `.spacer`, `.form-actions`). A class used by one component belongs in that component's `.scss`.
