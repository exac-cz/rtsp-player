import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { AppInfo } from '@shared/api-types';
import { CameraStore } from './services/camera-store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(CameraStore);
  protected readonly api = this.store.api;
  protected readonly maximized = signal(false);
  protected readonly alwaysOnTop = signal(false);
  protected readonly appInfo = signal<AppInfo | null>(null);

  constructor() {
    void this.store.load();

    if (this.api) {
      void this.api.getAppInfo().then((info) => this.appInfo.set(info));
      void this.api.isWindowMaximized().then((m) => this.maximized.set(m));
      void this.api.isAlwaysOnTop().then((on) => this.alwaysOnTop.set(on));
      const unsubscribeMaximized = this.api.onWindowMaximizedChange((m) => this.maximized.set(m));
      const unsubscribeOnTop = this.api.onAlwaysOnTopChange((on) => this.alwaysOnTop.set(on));
      inject(DestroyRef).onDestroy(() => {
        unsubscribeMaximized();
        unsubscribeOnTop();
      });
    }
  }

  protected async toggleAlwaysOnTop(): Promise<void> {
    if (!this.api) return;
    this.alwaysOnTop.set(await this.api.toggleAlwaysOnTop());
  }
}
