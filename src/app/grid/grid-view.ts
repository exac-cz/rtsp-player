import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Camera } from '../../../electron/api-types';
import { CameraStore } from '../core/camera-store';
import { CameraPlayer } from '../player/camera-player';

type Layout = 'auto' | '1' | '2' | '3' | '4';

const LAYOUT_SETTING = 'grid.layout';
const AUTO_MAX_TILES = 16;

@Component({
  selector: 'app-grid-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CameraPlayer, RouterLink],
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Grid layout">
        @for (option of layouts; track option.value) {
          <button type="button" [class.active]="layout() === option.value" (click)="setLayout(option.value)">
            {{ option.label }}
          </button>
        }
      </div>

      @if (pageCount() > 1) {
        <div class="pager">
          <button type="button" class="btn icon" (click)="goToPage(currentPage() - 1)" [disabled]="currentPage() === 0" aria-label="Previous page">‹</button>
          <span>Page {{ currentPage() + 1 }} / {{ pageCount() }}</span>
          <button type="button" class="btn icon" (click)="goToPage(currentPage() + 1)" [disabled]="currentPage() >= pageCount() - 1" aria-label="Next page">›</button>
        </div>
      }

      <span class="spacer"></span>
      <span class="muted">Click a camera to open it</span>
      <button type="button" class="btn" (click)="fullscreen()" [disabled]="!cameras().length">⛶ Fullscreen</button>
    </div>

    @if (store.loaded() && !cameras().length) {
      <div class="empty-state">
        <h2>No cameras yet</h2>
        <p>Add the RTSP URLs of your CCTV cameras to start watching.</p>
        <a class="btn primary" routerLink="/cameras">Add a camera</a>
      </div>
    } @else {
      <div
        #grid
        class="camera-grid"
        [style.grid-template-columns]="'repeat(' + columns() + ', minmax(0, 1fr))'"
        [style.grid-template-rows]="'repeat(' + rows() + ', minmax(0, 1fr))'"
      >
        @for (camera of visibleCameras(); track camera.id) {
          <app-camera-player
            class="tile"
            [camera]="camera"
            quality="lq"
            [maxWidth]="streamWidth()"
            [fps]="12"
            (click)="open(camera)"
            [title]="'Open ' + camera.name"
          />
        }
      </div>
    }
  `,
})
export class GridView {
  protected readonly store = inject(CameraStore);
  private readonly router = inject(Router);
  private readonly gridEl = viewChild<ElementRef<HTMLElement>>('grid');

  protected readonly layouts: { value: Layout; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: '1', label: '1×1' },
    { value: '2', label: '2×2' },
    { value: '3', label: '3×3' },
    { value: '4', label: '4×4' },
  ];

  protected readonly layout = signal<Layout>('auto');
  private readonly page = signal(0);

  protected readonly cameras = this.store.cameras;

  private readonly pageSize = computed(() => {
    const layout = this.layout();
    return layout === 'auto' ? AUTO_MAX_TILES : Number(layout) ** 2;
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.cameras().length / this.pageSize())));
  protected readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));

  protected readonly visibleCameras = computed(() => {
    const size = this.pageSize();
    const start = this.currentPage() * size;
    return this.cameras().slice(start, start + size);
  });

  protected readonly columns = computed(() => {
    const layout = this.layout();
    if (layout !== 'auto') return Number(layout);
    return Math.max(1, Math.ceil(Math.sqrt(this.visibleCameras().length)));
  });

  protected readonly rows = computed(() => {
    const layout = this.layout();
    if (layout !== 'auto') return Number(layout);
    return Math.max(1, Math.ceil(this.visibleCameras().length / this.columns()));
  });

  /** Smaller tiles get smaller streams to save CPU. */
  protected readonly streamWidth = computed(() => {
    const cols = this.columns();
    if (cols <= 1) return 1920;
    if (cols === 2) return 960;
    if (cols === 3) return 640;
    return 480;
  });

  constructor() {
    void this.store.getSetting(LAYOUT_SETTING).then((saved) => {
      if (saved && this.layouts.some((l) => l.value === saved)) this.layout.set(saved as Layout);
    });
  }

  protected setLayout(layout: Layout): void {
    this.layout.set(layout);
    this.page.set(0);
    void this.store.setSetting(LAYOUT_SETTING, layout);
  }

  protected goToPage(page: number): void {
    this.page.set(Math.max(0, Math.min(page, this.pageCount() - 1)));
  }

  protected open(camera: Camera): void {
    void this.router.navigate(['/camera', camera.id]);
  }

  protected fullscreen(): void {
    void this.gridEl()?.nativeElement.requestFullscreen();
  }
}
