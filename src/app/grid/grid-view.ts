import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Camera, StreamQuality } from '../../../electron/api-types';
import { CameraStore } from '../core/camera-store';
import { CameraPlayer } from '../player/camera-player';
import { CustomGridEditor } from './custom-grid-editor';

type Layout = 'custom' | 'auto' | '1' | '2' | '3' | '4';

const CUSTOM_GRID_SETTING = 'grid.custom';
const AUTO_MAX_TILES = 16;

@Component({
  selector: 'app-grid-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CameraPlayer, CustomGridEditor, RouterLink],
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Grid layout">
        @for (option of layouts; track option.value) {
          <button type="button" [class.active]="layout() === option.value" (click)="setLayout(option.value)">
            {{ option.label }}
          </button>
        }
      </div>

      @if (layout() === 'custom') {
        <button type="button" class="btn" [class.active]="editing()" (click)="editing.set(!editing())" [disabled]="!cameras().length">
          ✎ Edit
        </button>
      }

      <div class="segmented" role="group" aria-label="Stream quality">
        <button type="button" [class.active]="quality() === 'lq'" (click)="quality.set('lq')" title="Low-quality sub-streams">LQ</button>
        <button type="button" [class.active]="quality() === 'hq'" (click)="quality.set('hq')" title="High-quality main streams">HQ</button>
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
      <button type="button" class="btn" (click)="reloadAll()" [disabled]="!visibleCameras().length" title="Reconnect all visible streams">⟳ Reload</button>
      <button type="button" class="btn" (click)="fullscreen()" [disabled]="!visibleCameras().length">⛶ Fullscreen</button>
    </div>

    <div class="grid-body">
      @if (store.loaded() && !cameras().length) {
        <div class="empty-state">
          <h2>No cameras yet</h2>
          <p>Add the RTSP URLs of your CCTV cameras to start watching.</p>
          <a class="btn primary" routerLink="/cameras">Add a camera</a>
        </div>
      } @else if (layout() === 'custom' && !gridCameras().length) {
        <div class="empty-state">
          <h2>Your custom grid is empty</h2>
          <p>Choose which cameras to show and in what order.</p>
          @if (!editing()) {
            <button type="button" class="btn primary" (click)="editing.set(true)">✎ Choose cameras</button>
          }
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
              [quality]="quality()"
              [maxWidth]="streamWidth()"
              [fps]="12"
              (click)="open(camera)"
              [title]="'Open ' + camera.name"
            />
          }
        </div>
      }

      @if (editing() && layout() === 'custom') {
        <app-custom-grid-editor
          [cameras]="cameras()"
          [selectedIds]="customIds()"
          (save)="saveCustom($event)"
          (cancel)="editing.set(false)"
        />
      }
    </div>
  `,
})
export class GridView {
  protected readonly store = inject(CameraStore);
  private readonly router = inject(Router);
  private readonly gridEl = viewChild<ElementRef<HTMLElement>>('grid');
  private readonly players = viewChildren(CameraPlayer);

  protected readonly layouts: { value: Layout; label: string }[] = [
    { value: 'custom', label: 'Custom' },
    { value: 'auto', label: 'Auto' },
    { value: '1', label: '1×1' },
    { value: '2', label: '2×2' },
    { value: '3', label: '3×3' },
    { value: '4', label: '4×4' },
  ];

  /** The custom grid is the default view every time the app starts. */
  protected readonly layout = signal<Layout>('custom');
  /** Grid starts on the light sub-streams; HQ is opt-in because it costs much more CPU. */
  protected readonly quality = signal<StreamQuality>('lq');
  protected readonly editing = signal(false);
  private readonly page = signal(0);
  /** Saved custom selection; null until the user saves one (then the custom grid shows every camera). */
  private readonly savedCustomIds = signal<number[] | null>(null);

  protected readonly cameras = this.store.cameras;

  /** Custom selection resolved against the current cameras (deleted cameras drop out). */
  protected readonly customIds = computed(() => {
    const existing = new Set(this.cameras().map((c) => c.id));
    const saved = this.savedCustomIds();
    return saved ? saved.filter((id) => existing.has(id)) : [...existing];
  });

  /** Cameras shown by the current layout, before paging. */
  protected readonly gridCameras = computed(() => {
    if (this.layout() !== 'custom') return this.cameras();
    const byId = new Map(this.cameras().map((c) => [c.id, c]));
    return this.customIds().flatMap((id) => byId.get(id) ?? []);
  });

  /** Custom and Auto pick the column count from the number of cameras; the others are fixed. */
  private readonly isFlexible = computed(() => this.layout() === 'custom' || this.layout() === 'auto');

  private readonly pageSize = computed(() => (this.isFlexible() ? AUTO_MAX_TILES : Number(this.layout()) ** 2));

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.gridCameras().length / this.pageSize())));
  protected readonly currentPage = computed(() => Math.min(this.page(), this.pageCount() - 1));

  protected readonly visibleCameras = computed(() => {
    const size = this.pageSize();
    const start = this.currentPage() * size;
    return this.gridCameras().slice(start, start + size);
  });

  protected readonly columns = computed(() => {
    if (!this.isFlexible()) return Number(this.layout());
    return Math.max(1, Math.ceil(Math.sqrt(this.visibleCameras().length)));
  });

  protected readonly rows = computed(() => {
    if (!this.isFlexible()) return Number(this.layout());
    return Math.max(1, Math.ceil(this.visibleCameras().length / this.columns()));
  });

  /** Smaller tiles get smaller streams to save CPU; HQ keeps twice the detail (e.g. for HiDPI screens). */
  protected readonly streamWidth = computed(() => {
    const cols = this.columns();
    const width = cols <= 1 ? 1920 : cols === 2 ? 960 : cols === 3 ? 640 : 480;
    return this.quality() === 'hq' ? Math.min(1920, width * 2) : width;
  });

  constructor() {
    void this.store.getSetting(CUSTOM_GRID_SETTING).then((saved) => {
      if (!saved) return;
      try {
        const ids = JSON.parse(saved) as unknown;
        if (Array.isArray(ids)) this.savedCustomIds.set(ids.filter((id): id is number => Number.isInteger(id)));
      } catch {
        // Ignore a corrupt setting; the custom grid falls back to all cameras.
      }
    });
  }

  protected setLayout(layout: Layout): void {
    this.layout.set(layout);
    this.page.set(0);
    if (layout !== 'custom') this.editing.set(false);
  }

  protected async saveCustom(ids: number[]): Promise<void> {
    this.savedCustomIds.set(ids);
    this.editing.set(false);
    this.page.set(0);
    await this.store.setSetting(CUSTOM_GRID_SETTING, JSON.stringify(ids));
  }

  protected goToPage(page: number): void {
    this.page.set(Math.max(0, Math.min(page, this.pageCount() - 1)));
  }

  protected reloadAll(): void {
    for (const player of this.players()) player.reload();
  }

  protected open(camera: Camera): void {
    void this.router.navigate(['/camera', camera.id]);
  }

  protected fullscreen(): void {
    void this.gridEl()?.nativeElement.requestFullscreen();
  }
}
