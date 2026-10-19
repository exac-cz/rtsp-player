import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import type { Camera } from '../../../electron/api-types';

/** Side panel for choosing which cameras appear in the custom grid, and in what order. */
@Component({
  selector: 'app-custom-grid-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid-editor' },
  template: `
    <div class="grid-editor-header">
      <h3>Custom grid</h3>
      <span class="muted">Choose cameras and their order</span>
    </div>

    <div class="grid-editor-body">
      <h4>In grid ({{ selected().length }})</h4>
      @for (cam of selected(); track cam.id; let i = $index, first = $first, last = $last) {
        <div class="editor-row">
          <span class="pos">{{ i + 1 }}</span>
          <span class="name">{{ cam.name }}</span>
          <button type="button" class="btn small icon" (click)="move(i, -1)" [disabled]="first" aria-label="Move up">↑</button>
          <button type="button" class="btn small icon" (click)="move(i, 1)" [disabled]="last" aria-label="Move down">↓</button>
          <button type="button" class="btn small icon danger" (click)="remove(cam.id)" aria-label="Remove from grid">✕</button>
        </div>
      } @empty {
        <p class="muted">No cameras selected yet. Add some from the list below.</p>
      }

      <h4>
        Not in grid ({{ available().length }})
        @if (available().length > 1) {
          <button type="button" class="btn small" (click)="addAll()">Add all</button>
        }
      </h4>
      @for (cam of available(); track cam.id) {
        <div class="editor-row">
          <span class="name">{{ cam.name }}</span>
          <button type="button" class="btn small" (click)="add(cam.id)">+ Add</button>
        </div>
      } @empty {
        <p class="muted">All cameras are in the grid.</p>
      }
    </div>

    <div class="form-actions">
      <span class="spacer"></span>
      <button type="button" class="btn" (click)="cancel.emit()">Cancel</button>
      <button type="button" class="btn primary" (click)="save.emit(draft())">Save</button>
    </div>
  `,
})
export class CustomGridEditor {
  readonly cameras = input.required<Camera[]>();
  /** Camera ids currently in the custom grid, in display order. */
  readonly selectedIds = input.required<number[]>();
  readonly save = output<number[]>();
  readonly cancel = output<void>();

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
