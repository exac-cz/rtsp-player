import { contextBridge, ipcRenderer } from 'electron';
import type { FrameListener, RtspApi, StatusListener, StreamStatus } from './api-types';

// Stream ids are allocated here (not in main) so listeners are registered before
// the first status/frame message can arrive.
let nextStreamId = 1;
const frameListeners = new Map<number, FrameListener>();
const statusListeners = new Map<number, StatusListener>();

ipcRenderer.on('stream:frame', (_e, streamId: number, frame: Uint8Array<ArrayBuffer>) => {
  frameListeners.get(streamId)?.(frame);
});
ipcRenderer.on('stream:status', (_e, streamId: number, status: StreamStatus, message?: string) => {
  statusListeners.get(streamId)?.(status, message);
});

const api: RtspApi = {
  listCameras: () => ipcRenderer.invoke('cameras:list'),
  createCamera: (input) => ipcRenderer.invoke('cameras:create', input),
  updateCamera: (id, input) => ipcRenderer.invoke('cameras:update', id, input),
  deleteCamera: (id) => ipcRenderer.invoke('cameras:delete', id),
  reorderCameras: (ids) => ipcRenderer.invoke('cameras:reorder', ids),
  testStream: (url, transport) => ipcRenderer.invoke('cameras:test', url, transport),
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  openStream(cameraId, options, onFrame, onStatus) {
    const streamId = nextStreamId++;
    frameListeners.set(streamId, onFrame);
    statusListeners.set(streamId, onStatus);
    ipcRenderer.send('stream:start', streamId, cameraId, options);
    return {
      close() {
        frameListeners.delete(streamId);
        statusListeners.delete(streamId);
        ipcRenderer.send('stream:stop', streamId);
      },
    };
  },
};

contextBridge.exposeInMainWorld('rtspApi', api);
