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
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  openStream(
    cameraId: number,
    options: StreamOptions,
    onFrame: FrameListener,
    onStatus: StatusListener,
  ): StreamHandle;
}
