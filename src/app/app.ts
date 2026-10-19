import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { AppInfo } from '../../electron/api-types';
import { CameraStore } from './core/camera-store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(CameraStore);
  protected readonly api = this.store.api;
  protected readonly maximized = signal(false);
  protected readonly appInfo = signal<AppInfo | null>(null);

  constructor() {
    void this.store.load();

    if (this.api) {
      void this.api.getAppInfo().then((info) => this.appInfo.set(info));
      void this.api.isWindowMaximized().then((m) => this.maximized.set(m));
      const unsubscribe = this.api.onWindowMaximizedChange((m) => this.maximized.set(m));
      inject(DestroyRef).onDestroy(unsubscribe);
    }
  }
}
