import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import type { Camera, CameraInput, StreamOptions, TestResult, Transport } from './api-types';
import { CameraRepository } from './db';
import { captureSnapshot, StreamManager } from './streams';

const devServerUrl = process.env['ELECTRON_START_URL'];
const streams = new StreamManager();
let repo: CameraRepository;
let mainWindow: BrowserWindow | null = null;

function toId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid id: ${String(value)}`);
  return id;
}

function toUrl(value: unknown, label: string): string {
  const url = typeof value === 'string' ? value.trim() : '';
  if (url && !/^rtsps?:\/\/\S+$/i.test(url)) throw new Error(`${label} must start with rtsp:// or rtsps://`);
  return url;
}

function toTransport(value: unknown): Transport {
  return value === 'udp' ? 'udp' : 'tcp';
}

function toCameraInput(value: unknown): CameraInput {
  const input = (value ?? {}) as Partial<Record<keyof CameraInput, unknown>>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) throw new Error('Camera name is required');
  const hqUrl = toUrl(input.hqUrl, 'HQ URL');
  const lqUrl = toUrl(input.lqUrl, 'LQ URL');
  if (!hqUrl && !lqUrl) throw new Error('Enter at least one stream URL');
  return { name, hqUrl, lqUrl, transport: toTransport(input.transport) };
}

/** Pick the requested stream, falling back to the other one when only one URL is set. */
function streamUrl(camera: Camera, quality: StreamOptions['quality']): string {
  return quality === 'lq' ? camera.lqUrl || camera.hqUrl : camera.hqUrl || camera.lqUrl;
}

function toStreamOptions(value: unknown): StreamOptions {
  const opts = (value ?? {}) as Partial<Record<keyof StreamOptions, unknown>>;
  const clamp = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined;
  return {
    quality: opts.quality === 'lq' ? 'lq' : 'hq',
    maxWidth: clamp(opts.maxWidth, 160, 3840),
    fps: clamp(opts.fps, 1, 30),
  };
}

function registerIpc(): void {
  ipcMain.handle('cameras:list', () => repo.list());
  ipcMain.handle('cameras:create', (_e, input) => repo.create(toCameraInput(input)));
  ipcMain.handle('cameras:update', (_e, id, input) => repo.update(toId(id), toCameraInput(input)));
  ipcMain.handle('cameras:delete', (_e, id) => repo.remove(toId(id)));
  ipcMain.handle('cameras:reorder', (_e, ids) => repo.reorder((ids as unknown[]).map(toId)));
  ipcMain.handle('cameras:test', async (_e, url, transport): Promise<TestResult> => {
    try {
      const source = toUrl(url, 'URL');
      if (!source) throw new Error('URL is required');
      return await captureSnapshot({ url: source, transport: toTransport(transport) });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('settings:get', (_e, key) => repo.getSetting(String(key)));
  ipcMain.handle('settings:set', (_e, key, value) => repo.setSetting(String(key), String(value)));

  ipcMain.on('stream:start', (e, streamId, cameraId, options) => {
    const camera = repo.get(toId(cameraId));
    if (!camera) {
      e.sender.send('stream:status', streamId, 'error', 'Camera not found');
      return;
    }
    const opts = toStreamOptions(options);
    streams.start(e.sender, toId(streamId), { url: streamUrl(camera, opts.quality), transport: camera.transport }, opts);
  });
  ipcMain.on('stream:stop', (e, streamId) => streams.stop(e.sender, toId(streamId)));

  // Custom title bar buttons (the window is frameless).
  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('window:toggle-maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  ipcMain.handle('window:is-maximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'RTSP Player',
    backgroundColor: '#0e1014',
    // The app header acts as the title bar, with its own window buttons.
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => (mainWindow = null));
  // Keep the maximize/restore icon in the custom title bar in sync (also covers double-click and Win+Up).
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized', false));

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/rtsp-player/browser/index.html'));
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    repo = new CameraRepository(path.join(app.getPath('userData'), 'rtsp-player.db'));
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    streams.stopAll();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    streams.stopAll();
    repo?.close();
  });
}
