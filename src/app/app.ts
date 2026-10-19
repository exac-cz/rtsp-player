import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CameraStore } from './core/camera-store';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="app-header">
      <span class="brand"><span class="brand-dot"></span> RTSP Player</span>
      <nav>
        <a routerLink="/grid" routerLinkActive="active">Grid view</a>
        <a routerLink="/cameras" routerLinkActive="active">Cameras ({{ store.cameras().length }})</a>
      </nav>
    </header>
    <main class="app-main">
      <router-outlet />
    </main>
  `,
})
export class App {
  protected readonly store = inject(CameraStore);

  constructor() {
    void this.store.load();
  }
}
