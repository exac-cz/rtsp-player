import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { Camera, StreamQuality, StreamStatus } from '../../../electron/api-types';
import { CameraStore } from '../core/camera-store';

const RETRY_DELAY_MS = 5000;

@Component({
  selector: 'app-camera-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './camera-player.html',
  styleUrl: './camera-player.scss',
})
export class CameraPlayer {
  readonly camera = input.required<Camera>();
  readonly quality = input<StreamQuality>('hq');
  readonly maxWidth = input<number | undefined>(undefined);
  readonly fps = input(15);
  readonly showLabel = input(true);

  protected readonly status = signal<StreamStatus>('connecting');
  protected readonly message = signal<string | undefined>(undefined);
  protected readonly hasFrame = signal(false);

  private readonly store = inject(CameraStore);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly attempt = signal(0);
  // Restart the stream only when something that affects it actually changes.
  private readonly streamKey = computed(() => {
    const cam = this.camera();
    return `${cam.id}|${cam.hqUrl}|${cam.lqUrl}|${cam.transport}|${this.quality()}|${this.maxWidth() ?? ''}|${this.fps()}`;
  });
  private decoding = false;

  constructor() {
    effect((onCleanup) => {
      this.streamKey();
      this.attempt();
      const api = this.store.api;
      if (!api) {
        this.status.set('error');
        this.message.set('Not running inside Electron');
        return;
      }

      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      const handle = api.openStream(
        this.camera().id,
        { quality: this.quality(), maxWidth: this.maxWidth(), fps: this.fps() },
        (frame) => void this.draw(frame),
        (status, message) => {
          this.status.set(status);
          this.message.set(message);
          if (status === 'error' || status === 'ended') {
            retryTimer = setTimeout(() => this.attempt.update((n) => n + 1), RETRY_DELAY_MS);
          }
        },
      );

      onCleanup(() => {
        clearTimeout(retryTimer);
        handle.close();
      });
    });
  }

  protected reconnect(event: Event): void {
    event.stopPropagation();
    this.reload();
  }

  /** Close the current stream and open a fresh one. */
  reload(): void {
    this.status.set('connecting');
    this.attempt.update((n) => n + 1);
  }

  /** Current frame as a JPEG data URL, or null when nothing has been shown yet. */
  snapshot(): string | null {
    return this.hasFrame() ? this.canvas().nativeElement.toDataURL('image/jpeg', 0.95) : null;
  }

  private async draw(frame: Uint8Array<ArrayBuffer>): Promise<void> {
    // Drop frames while the previous one is still decoding instead of queueing them up.
    if (this.decoding) return;
    this.decoding = true;
    try {
      const bitmap = await createImageBitmap(new Blob([frame], { type: 'image/jpeg' }));
      const canvas = this.canvas().nativeElement;
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      if (!this.hasFrame()) this.hasFrame.set(true);
    } catch {
      // A corrupt frame is not fatal; the next one will replace it.
    } finally {
      this.decoding = false;
    }
  }
}
