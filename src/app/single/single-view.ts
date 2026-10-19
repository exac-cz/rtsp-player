import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CameraStore } from '../core/camera-store';
import { CameraPlayer } from '../player/camera-player';

@Component({
  selector: 'app-single-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CameraPlayer, RouterLink],
  host: { '(window:keydown)': 'onKey($event)' },
  template: `
    <div class="toolbar">
      <a class="btn" routerLink="/grid">‹ Grid</a>
      <button type="button" class="btn icon" (click)="step(-1)" [disabled]="cameras().length < 2" aria-label="Previous camera">◀</button>
      <button type="button" class="btn icon" (click)="step(1)" [disabled]="cameras().length < 2" aria-label="Next camera">▶</button>
      <h2 class="toolbar-title">{{ camera()?.name }}</h2>
      <span class="spacer"></span>
      <span class="muted">← → switch · F fullscreen</span>
      <button type="button" class="btn" (click)="saveSnapshot()" [disabled]="!camera()">📷 Snapshot</button>
      <button type="button" class="btn" (click)="fullscreen()" [disabled]="!camera()">⛶ Fullscreen</button>
    </div>

    <div class="single-layout">
      <div class="stage" #stage>
        @if (camera(); as cam) {
          <app-camera-player [camera]="cam" quality="hq" [maxWidth]="1920" [fps]="25" />
        } @else if (store.loaded()) {
          <div class="empty-state">
            <h2>Camera not found</h2>
            <a class="btn primary" routerLink="/grid">Back to grid</a>
          </div>
        }
      </div>

      <nav class="camera-list" aria-label="Cameras">
        @for (cam of cameras(); track cam.id) {
          <a [routerLink]="['/camera', cam.id]" [class.active]="cam.id === camera()?.id">{{ cam.name }}</a>
        }
      </nav>
    </div>
  `,
})
export class SingleView {
  /** Route parameter, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly store = inject(CameraStore);
  private readonly router = inject(Router);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly player = viewChild(CameraPlayer);

  protected readonly cameras = this.store.cameras;
  protected readonly camera = computed(() => this.store.byId(Number(this.id())));

  protected step(delta: number): void {
    const list = this.cameras();
    if (list.length < 2) return;
    const index = list.findIndex((c) => c.id === this.camera()?.id);
    const next = list[(index + delta + list.length) % list.length];
    void this.router.navigate(['/camera', next.id]);
  }

  protected fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.stage().nativeElement.requestFullscreen();
  }

  protected saveSnapshot(): void {
    const dataUrl = this.player()?.snapshot();
    const cam = this.camera();
    if (!dataUrl || !cam) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${cam.name.replace(/[^\w-]+/g, '_')}_${stamp}.jpg`;
    link.click();
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft') this.step(-1);
    else if (event.key === 'ArrowRight') this.step(1);
    else if (event.key === 'f' || event.key === 'F') this.fullscreen();
  }
}
