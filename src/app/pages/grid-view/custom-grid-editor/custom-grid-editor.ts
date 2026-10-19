import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import type { Camera } from '@shared/api-types';

/** Side panel for choosing which cameras appear in the custom grid, and in what order. */
@Component({
  selector: 'app-custom-grid-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './custom-grid-editor.html',
  styleUrl: './custom-grid-editor.scss',
})
export class CustomGridEditor {
  readonly cameras = input.required<Camera[]>();
  /** Camera ids currently in the custom grid, in display order. */
  readonly selectedIds = input.required<number[]>();
  readonly saved = output<number[]>();
  readonly cancelled = output<void>();

  /** Working copy; reset whenever the saved selection changes. */
  protected readonly draft = linkedSignal(() => [...this.selectedIds()]);

  protected readonly selected = computed(() => {
    const byId = new Map(this.cameras().map((c) => [c.id, c]));
    return this.draft().flatMap((id) => byId.get(id) ?? []);
  });

  protected readonly available = computed(() => {
    const chosen = new Set(this.draft());
    return this.cameras().filter((c) => !chosen.has(c.id));
  });

  protected add(id: number): void {
    this.draft.update((ids) => [...ids, id]);
  }

  protected addAll(): void {
    this.draft.update((ids) => [...ids, ...this.available().map((c) => c.id)]);
  }

  protected remove(id: number): void {
    this.draft.update((ids) => ids.filter((x) => x !== id));
  }

  protected move(index: number, delta: -1 | 1): void {
    this.draft.update((ids) => {
      const next = [...ids];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
}
