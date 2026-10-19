import { app, BrowserWindow, dialog, ipcMain, type WebContents } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AppInfo,
  Camera,
  ExportResult,
  ImportPreview,
  ImportResult,
  StreamOptions,
  TestResult,
} from './api-types';
import { CameraRepository } from './db';
import { CUSTOM_GRID_SETTING } from './settings-keys';
import { captureSnapshot, StreamManager } from './streams';
import { parseImport, sameStreams, serializeExport, type ParsedImport } from './transfer';
import { toCameraInput, toId, toTransport, toUrl } from './validation';

const devServerUrl = process.env['ELECTRON_START_URL'];

// Development builds keep their own data folder (database, settings, encryption key), so they
// never touch the installed app's cameras or upgrade its database, and both can run side by side
// (the single-instance lock is per data folder). An explicit --user-data-dir still wins.
if (!app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', path.join(app.getPath('appData'), 'rtsp-player-dev'));
}

const streams = new StreamManager();
let repo: CameraRepository;
let mainWindow: BrowserWindow | null = null;
/** File picked by `cameras:import-pick`, waiting for the user to choose how to apply it. */
const pendingImports = new Map<number, ParsedImport>();
const JSON_FILTERS = [{ name: 'Camera export (JSON)', extensions: ['json'] }];

function savedCustomGrid(): number[] | null {
  try {
    const ids = JSON.parse(repo.getSetting(CUSTOM_GRID_SETTING) ?? 'null') as unknown;
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : null;
  } catch {
    return null;
  }
}

async function exportCameras(sender: WebContents): Promise<ExportResult> {
  const cameras = repo.list();
  if (!cameras.length) throw new Error('There are no cameras to export');
  const win = BrowserWindow.fromWebContents(sender);
  const options = {
    title: 'Export cameras',
    defaultPath: path.join(app.getPath('documents'), 'rtsp-cameras.json'),
    filters: JSON_FILTERS,
  };
  const { canceled, filePath } = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (canceled || !filePath) return { saved: false };
  await writeFile(filePath, serializeExport(cameras, savedCustomGrid()), 'utf8');
  return { saved: true, path: filePath, count: cameras.length };
}

async function pickImportFile(sender: WebContents): Promise<ImportPreview | null> {
  const win = BrowserWindow.fromWebContents(sender);
  const options = {
    title: 'Import cameras',
    defaultPath: app.getPath('documents'),
    filters: JSON_FILTERS,
    properties: ['openFile' as const],
  };
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (canceled || !filePaths[0]) return null;

  const parsed = parseImport(await readFile(filePaths[0], 'utf8'));
  pendingImports.set(sender.id, parsed);
  const existing = repo.list();
  return {
    fileName: path.basename(filePaths[0]),
    total: parsed.cameras.length,
    duplicates: parsed.cameras.filter((c) => existing.some((e) => sameStreams(c, e))).length,
    hasCustomGrid: parsed.customGrid !== null,
  };
}

function applyImport(sender: WebContents, mode: unknown): ImportResult {
  const parsed = pendingImports.get(sender.id);
  if (!parsed) throw new Error('Pick a file to import first');
  pendingImports.delete(sender.id);

  if (mode === 'replace') {
    const ids = repo.importCameras(parsed.cameras, true);
    // Restore the Custom grid from the file; without one, Custom shows every camera.
    if (parsed.customGrid)
      repo.setSetting(CUSTOM_GRID_SETTING, JSON.stringify(parsed.customGrid.map((i) => ids[i])));
    else repo.deleteSetting(CUSTOM_GRID_SETTING);
    return { added: ids.length, skipped: 0 };
  }

  // Merge: skip cameras already in the list (or repeated within the file).
  const known: { hqUrl: string; lqUrl: string }[] = repo.list();
  const fresh = parsed.cameras.filter((c) => {
    if (known.some((k) => sameStreams(c, k))) return false;
    known.push(c);
    return true;
  });
  repo.importCameras(fresh, false);
  return { added: fresh.length, skipped: parsed.cameras.length - fresh.length };
}

/** Pick the requested stream, falling back to the other one when only one URL is set. */
function streamUrl(camera: Camera, quality: StreamOptions['quality']): string {
  return quality === 'lq' ? camera.lqUrl || camera.hqUrl : camera.hqUrl || camera.lqUrl;
}

function toStreamOptions(value: unknown): StreamOptions {
  const opts = (value ?? {}) as Partial<Record<keyof StreamOptions, unknown>>;
  const clamp = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(max, Math.max(min, Math.round(v)))
      : undefined;
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

  ipcMain.handle('cameras:export', (e) => exportCameras(e.sender));
  ipcMain.handle('cameras:import-pick', (e) => pickImportFile(e.sender));
  ipcMain.handle('cameras:import-apply', (e, mode) => applyImport(e.sender, mode));

  ipcMain.handle('app:info', (): AppInfo => ({
    isDev: !app.isPackaged,
    dataPath: app.getPath('userData'),
  }));

  ipcMain.handle('settings:get', (_e, key) => repo.getSetting(String(key)));
  ipcMain.handle('settings:set', (_e, key, value) => repo.setSetting(String(key), String(value)));

  ipcMain.on('stream:start', (e, streamId, cameraId, options) => {
    const camera = repo.get(toId(cameraId));
    if (!camera) {
      e.sender.send('stream:status', streamId, 'error', 'Camera not found');
      return;
    }
    const opts = toStreamOptions(options);
    streams.start(
      e.sender,
      toId(streamId),
      { url: streamUrl(camera, opts.quality), transport: camera.transport },
      opts,
    );
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
  ipcMain.handle(
    'window:is-maximized',
    (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false,
  );
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
