import { spawn, type ChildProcess } from 'node:child_process';
import type { WebContents } from 'electron';
import ffmpegStatic from 'ffmpeg-static';
import type { StreamOptions, StreamStatus, TestResult, Transport } from './api-types';

/** A single RTSP stream to open: one of the camera's URLs plus its transport. */
export interface StreamSource {
  url: string;
  transport: Transport;
}

const CONNECT_TIMEOUT_US = '10000000'; // 10 s, ffmpeg expects microseconds
const SNAPSHOT_TIMEOUT_MS = 15000;

function ffmpegPath(): string {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin) throw new Error('No bundled ffmpeg binary for this platform');
  // Executables cannot run from inside the asar archive; electron-builder unpacks it next to it.
  return bin.replace('app.asar', 'app.asar.unpacked');
}

/** Hide the password in `rtsp://user:pass@host` so it never reaches logs or the UI. */
export function maskCredentials(text: string): string {
  return text.replace(/(rtsps?:\/\/[^:/@\s]+):[^@/\s]+@/gi, '$1:***@');
}

function inputArgs(source: StreamSource): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-rtsp_transport', source.transport,
    '-timeout', CONNECT_TIMEOUT_US,
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-i', source.url,
    '-an', '-sn', '-dn',
  ];
}

function scaleFilter(maxWidth?: number): string {
  // MJPEG needs full-range YUV; scaling keeps the original aspect ratio.
  return maxWidth ? `scale='min(iw,${maxWidth})':-2,format=yuvj420p` : 'format=yuvj420p';
}

/** The first error ffmpeg reports is the root cause; later lines are generic follow-ups. */
function firstError(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  return line.replace(/^\[[^\]]*@ [0-9a-fx]+\]\s*/i, '').trim();
}

/**
 * Splits ffmpeg's `mpjpeg` output (multipart JPEG with Content-length headers)
 * into individual JPEG frames.
 */
class MjpegParser {
  private buffer: Buffer = Buffer.alloc(0);
  private frameLength = 0;

  constructor(private readonly onFrame: (frame: Buffer) => void) {}

  push(chunk: Buffer): void {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    for (;;) {
      if (this.frameLength === 0) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = this.buffer.toString('latin1', 0, headerEnd);
        this.buffer = this.buffer.subarray(headerEnd + 4);
        const match = /content-length:\s*(\d+)/i.exec(header);
        if (!match) continue;
        this.frameLength = Number(match[1]);
      }
      if (this.buffer.length < this.frameLength) return;
      const frame = this.buffer.subarray(0, this.frameLength);
      this.buffer = this.buffer.subarray(this.frameLength);
      this.frameLength = 0;
      this.onFrame(frame);
    }
  }
}

interface ActiveStream {
  proc: ChildProcess;
  stopped: boolean;
}

/**
 * Runs one ffmpeg process per open player and pushes decoded JPEG frames to the
 * renderer over IPC. Using IPC instead of a local HTTP MJPEG server avoids
 * Chromium's 6-connections-per-host limit, which would stall larger grids.
 */
export class StreamManager {
  private readonly active = new Map<string, ActiveStream>();
  private readonly tracked = new WeakSet<WebContents>();

  start(owner: WebContents, streamId: number, source: StreamSource, options: StreamOptions): void {
    const key = `${owner.id}:${streamId}`;
    this.stopKey(key);
    this.track(owner);

    const send = (channel: string, ...args: unknown[]) => {
      if (!owner.isDestroyed()) owner.send(channel, streamId, ...args);
    };
    const sendStatus = (status: StreamStatus, message?: string) => send('stream:status', status, message);

    const fps = options.fps ?? 15;
    const args = [
      ...inputArgs(source),
      '-vf', scaleFilter(options.maxWidth),
      // Caps the rate without duplicating frames from slower cameras.
      '-fpsmax', String(fps),
      '-c:v', 'mjpeg',
      '-q:v', '5',
      '-f', 'mpjpeg',
      '-',
    ];

    let proc: ChildProcess;
    try {
      proc = spawn(ffmpegPath(), args, { windowsHide: true });
    } catch (err) {
      sendStatus('error', (err as Error).message);
      return;
    }

    const stream: ActiveStream = { proc, stopped: false };
    this.active.set(key, stream);
    sendStatus('connecting');

    let playing = false;
    const parser = new MjpegParser((frame) => {
      if (!playing) {
        playing = true;
        sendStatus('playing');
      }
      send('stream:frame', frame);
    });

    let stderr = '';
    let finished = false;
    const finish = (code: number | null, spawnError?: Error) => {
      if (finished) return;
      finished = true;
      if (this.active.get(key) === stream) this.active.delete(key);
      if (stream.stopped) return;
      const message = maskCredentials(spawnError?.message || firstError(stderr));
      if (message || code) sendStatus('error', message || `ffmpeg exited with code ${code}`);
      else sendStatus('ended');
    };

    proc.stdout!.on('data', (chunk: Buffer) => parser.push(chunk));
    proc.stderr!.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-4000)));
    proc.on('error', (err) => finish(null, err));
    proc.on('close', (code) => finish(code));
  }

  stop(owner: WebContents, streamId: number): void {
    this.stopKey(`${owner.id}:${streamId}`);
  }

  stopAllFor(owner: WebContents): void {
    const prefix = `${owner.id}:`;
    for (const key of [...this.active.keys()]) if (key.startsWith(prefix)) this.stopKey(key);
  }

  stopAll(): void {
    for (const key of [...this.active.keys()]) this.stopKey(key);
  }

  private stopKey(key: string): void {
    const stream = this.active.get(key);
    if (!stream) return;
    stream.stopped = true;
    this.active.delete(key);
    stream.proc.kill();
  }

  /** Kill a window's streams when it reloads or closes, so no ffmpeg is left orphaned. */
  private track(owner: WebContents): void {
    if (this.tracked.has(owner)) return;
    this.tracked.add(owner);
    const ownerId = owner.id;
    owner.on('destroyed', () => {
      const prefix = `${ownerId}:`;
      for (const key of [...this.active.keys()]) if (key.startsWith(prefix)) this.stopKey(key);
    });
    owner.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.stopAllFor(owner);
    });
  }
}

/** Grab a single frame to verify that a camera URL works. */
export function captureSnapshot(source: StreamSource): Promise<TestResult> {
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(
        ffmpegPath(),
        [...inputArgs(source), '-vf', scaleFilter(640), '-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2', '-'],
        { windowsHide: true },
      );
    } catch (err) {
      resolve({ ok: false, error: (err as Error).message });
      return;
    }

    const chunks: Buffer[] = [];
    let stderr = '';
    let settled = false;
    const done = (result: TestResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      proc.kill();
      done({ ok: false, error: 'Timed out waiting for the first frame' });
    }, SNAPSHOT_TIMEOUT_MS);

    proc.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr!.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-4000)));
    proc.on('error', (err) => done({ ok: false, error: err.message }));
    proc.on('close', (code) => {
      const image = Buffer.concat(chunks);
      if (code === 0 && image.length > 0) {
        done({ ok: true, snapshot: `data:image/jpeg;base64,${image.toString('base64')}` });
      } else {
        done({ ok: false, error: maskCredentials(firstError(stderr)) || `ffmpeg exited with code ${code}` });
      }
    });
  });
}
