import { Injectable, signal } from '@angular/core';
import type { Camera, CameraInput, RtspApi } from '@shared/api-types';
import { errorMessage } from '../utils/error-message';

declare global {
  interface Window {
    rtspApi?: RtspApi;
  }
}

@Injectable({ providedIn: 'root' })
export class CameraStore {
  /** Null when the app is opened in a plain browser instead of Electron. */
  readonly api: RtspApi | null = window.rtspApi ?? null;

  private readonly _cameras = signal<Camera[]>([]);
  readonly cameras = this._cameras.asReadonly();
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    if (!this.api) {
      this.error.set(
        'The camera database is only available inside the Electron app. Start it with "npm start".',
      );
      this.loaded.set(true);
      return;
    }
    try {
      this._cameras.set(await this.api.listCameras());
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loaded.set(true);
    }
  }

  byId(id: number): Camera | undefined {
    return this._cameras().find((c) => c.id === id);
  }

  async add(input: CameraInput): Promise<Camera> {
    const camera = await this.requireApi().createCamera(input);
    this._cameras.update((list) => [...list, camera]);
    return camera;
  }

  async update(id: number, input: CameraInput): Promise<Camera> {
    const camera = await this.requireApi().updateCamera(id, input);
    this._cameras.update((list) => list.map((c) => (c.id === id ? camera : c)));
    return camera;
  }

  async remove(id: number): Promise<void> {
    await this.requireApi().deleteCamera(id);
    this._cameras.update((list) => list.filter((c) => c.id !== id));
  }

  /** Move a camera up (-1) or down (+1) in the display order. */
  async move(id: number, delta: -1 | 1): Promise<void> {
    const ids = this._cameras().map((c) => c.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    this._cameras.set(await this.requireApi().reorderCameras(ids));
  }

  async getSetting(key: string): Promise<string | null> {
    return this.api ? this.api.getSetting(key) : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.api?.setSetting(key, value);
  }

  private requireApi(): RtspApi {
    if (!this.api) throw new Error('Not running inside Electron');
    return this.api;
  }
}
