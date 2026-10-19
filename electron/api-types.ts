// Types shared between the Electron main/preload process and the Angular renderer.
// Keep this file free of runtime code: it is imported with `import type` only.

export type Transport = 'tcp' | 'udp';

/** Which of the camera's streams to play. Falls back to the other one when it has no URL. */
export type StreamQuality = 'hq' | 'lq';

export interface Camera {
  id: number;
  name: string;
  /** High-quality (main) stream, used in single view. Empty string when not set. */
  hqUrl: string;
  /** Low-quality (sub) stream, used in grid view. Empty string when not set. */
  lqUrl: string;
  transport: Transport;
  sortOrder: number;
}

/** At least one of hqUrl / lqUrl must be filled in. */
export interface CameraInput {
  name: string;
  hqUrl: string;
  lqUrl: string;
  transport: Transport;
}

export interface StreamOptions {
  quality?: StreamQuality;
  /** Downscale frames to at most this width (keeps CPU/IPC low in grid view). */
  maxWidth?: number;
  /** Maximum frames per second delivered to the renderer. */
  fps?: number;
}

export type StreamStatus = 'connecting' | 'playing' | 'error' | 'ended';

export type TestResult = { ok: true; snapshot: string } | { ok: false; error: string };

/** merge: add cameras that are not in the list yet; replace: swap the whole list for the file's. */
export type ImportMode = 'merge' | 'replace';

export interface ImportPreview {
  fileName: string;
  total: number;
  /** Cameras in the file whose stream URLs already exist in the list (skipped when merging). */
  duplicates: number;
  hasCustomGrid: boolean;
}

export interface ImportResult {
  added: number;
  skipped: number;
}

export type ExportResult = { saved: false } | { saved: true; path: string; count: number };

export interface AppInfo {
  /** True when running from source (npm start / npm run electron), not the installed app. */
  isDev: boolean;
  /** Folder holding the database and settings. */
  dataPath: string;
}

export type FrameListener = (frame: Uint8Array<ArrayBuffer>) => void;
export type StatusListener = (status: StreamStatus, message?: string) => void;

export interface StreamHandle {
  close(): void;
}

export interface RtspApi {
  listCameras(): Promise<Camera[]>;
  createCamera(input: CameraInput): Promise<Camera>;
  updateCamera(id: number, input: CameraInput): Promise<Camera>;
  deleteCamera(id: number): Promise<void>;
  reorderCameras(ids: number[]): Promise<Camera[]>;
  testStream(url: string, transport: Transport): Promise<TestResult>;
  /** Ask for a file name and write all cameras (and the Custom grid) to it. */
  exportCameras(): Promise<ExportResult>;
  /** Ask for a file and check it; null if the user cancelled. Throws if the file is invalid. */
  pickImportFile(): Promise<ImportPreview | null>;
  /** Apply the file picked by the last pickImportFile(). */
  applyImport(mode: ImportMode): Promise<ImportResult>;
  getAppInfo(): Promise<AppInfo>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  openStream(
    cameraId: number,
    options: StreamOptions,
    onFrame: FrameListener,
    onStatus: StatusListener,
  ): StreamHandle;

  // Window controls for the custom (frameless) title bar.
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  isWindowMaximized(): Promise<boolean>;
  /** Returns a function that removes the listener. */
  onWindowMaximizedChange(listener: (maximized: boolean) => void): () => void;
  /**
   * Keep the window above other windows, or stop doing so. Resolves to the window's actual
   * state afterwards; remembered across restarts.
   */
  toggleAlwaysOnTop(): Promise<boolean>;
  isAlwaysOnTop(): Promise<boolean>;
  /** Returns a function that removes the listener. */
  onAlwaysOnTopChange(listener: (alwaysOnTop: boolean) => void): () => void;
}
