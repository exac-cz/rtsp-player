import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  Camera,
  CameraInput,
  ImportMode,
  ImportPreview,
  TestResult,
  Transport,
} from '../../../electron/api-types';
import { CameraStore, errorMessage, maskUrl } from '../core/camera-store';

/** Empty, or an rtsp:// / rtsps:// URL. */
const RTSP_URL = /^\s*(rtsps?:\/\/\S+)?\s*$/i;

function atLeastOneUrl(group: AbstractControl): ValidationErrors | null {
  const { hqUrl, lqUrl } = group.value as { hqUrl: string; lqUrl: string };
  return hqUrl.trim() || lqUrl.trim() ? null : { noUrl: true };
}

interface StreamTest {
  label: string;
  result: TestResult;
}

@Component({
  selector: 'app-camera-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="toolbar">
      <h2 class="toolbar-title">Cameras</h2>
      <span class="spacer"></span>
      <button type="button" class="btn" (click)="pickImport()" [disabled]="!store.api || transferBusy()" title="Add cameras from a JSON file">
        ⇩ Import
      </button>
      <button type="button" class="btn" (click)="exportCameras()" [disabled]="!store.cameras().length || transferBusy()" title="Save all cameras to a JSON file">
        ⇧ Export
      </button>
      @if (!formOpen()) {
        <button type="button" class="btn primary" (click)="startAdd()" [disabled]="!store.api">+ Add camera</button>
      }
    </div>

    <div class="page">
      @if (importPreview(); as preview) {
        <div class="card import-card">
          <h3>Import “{{ preview.fileName }}”</h3>
          <p>
            {{ preview.total }} {{ preview.total === 1 ? 'camera' : 'cameras' }} in the file
            @if (preview.duplicates) {
              — {{ preview.duplicates }} already in your list (same stream URLs)
            }
          </p>
          <div class="form-actions">
            <button type="button" class="btn primary" (click)="applyImport('merge')" [disabled]="transferBusy() || preview.duplicates >= preview.total">
              Add {{ preview.total - preview.duplicates }} new
            </button>
            <button type="button" class="btn danger" (click)="applyImport('replace')" [disabled]="transferBusy()">
              Replace all cameras
            </button>
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="importPreview.set(null)">Cancel</button>
          </div>
          <small class="muted">
            “Replace all” deletes your current {{ store.cameras().length }} cameras
            {{ preview.hasCustomGrid ? 'and restores the Custom grid from the file.' : 'and resets the Custom grid to show all cameras.' }}
          </small>
        </div>
      }

      @if (notice(); as n) {
        <div class="card test-result notice" [class.ok]="n.ok" [class.error]="!n.ok">
          <span>{{ n.text }}</span>
          <button type="button" class="btn small" (click)="notice.set(null)">Dismiss</button>
        </div>
      }

      @if (formOpen()) {
        <form class="card camera-form" [formGroup]="form" (ngSubmit)="save()">
          <h3>{{ editingId() ? 'Edit camera' : 'New camera' }}</h3>

          <label>
            Name
            <input formControlName="name" placeholder="Front door" autofocus />
          </label>

          <label>
            <span>HQ stream URL <span class="hint">· used in single view</span></span>
            <input formControlName="hqUrl" placeholder="rtsp://user:password@192.168.1.10:554/stream1" spellcheck="false" />
            @if (form.controls.hqUrl.invalid) {
              <small class="field-error">Enter a URL starting with rtsp:// or rtsps://</small>
            }
          </label>

          <label>
            <span>LQ stream URL <span class="hint">· used in grid view</span></span>
            <input formControlName="lqUrl" placeholder="rtsp://user:password@192.168.1.10:554/stream2" spellcheck="false" />
            @if (form.controls.lqUrl.invalid) {
              <small class="field-error">Enter a URL starting with rtsp:// or rtsps://</small>
            }
          </label>

          <small class="muted">
            Fill in at least one URL. If only one is set, it is used in both views.
          </small>

          <label>
            Transport
            <select formControlName="transport">
              <option value="tcp">TCP (recommended)</option>
              <option value="udp">UDP</option>
            </select>
          </label>

          @for (test of testResults(); track test.label) {
            @if (test.result.ok) {
              <div class="test-result ok">
                <span>✔ {{ test.label }} stream works</span>
                <img [src]="test.result.snapshot" [alt]="test.label + ' snapshot'" />
              </div>
            } @else {
              <div class="test-result error">✖ {{ test.label }}: {{ test.result.error }}</div>
            }
          }
          @if (formError(); as err) {
            <div class="test-result error">{{ err }}</div>
          }

          <div class="form-actions">
            <button type="button" class="btn" (click)="test()" [disabled]="form.invalid || testing()">
              {{ testing() ? 'Testing…' : 'Test connection' }}
            </button>
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closeForm()">Cancel</button>
            <button type="submit" class="btn primary" [disabled]="form.invalid || saving()">Save</button>
          </div>
        </form>
      }

      @if (store.error(); as err) {
        <div class="card test-result error">{{ err }}</div>
      }

      @if (store.cameras().length) {
        <table class="card camera-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>HQ stream (single view)</th>
              <th>LQ stream (grid view)</th>
              <th>Transport</th>
              <th class="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (cam of store.cameras(); track cam.id; let first = $first, last = $last) {
              <tr>
                <td>{{ cam.name }}</td>
                <td class="url">
                  @if (cam.hqUrl) { {{ mask(cam.hqUrl) }} } @else { <span class="fallback">uses LQ stream</span> }
                </td>
                <td class="url">
                  @if (cam.lqUrl) { {{ mask(cam.lqUrl) }} } @else { <span class="fallback">uses HQ stream</span> }
                </td>
                <td>{{ cam.transport.toUpperCase() }}</td>
                <td class="actions">
                  <a class="btn small" [routerLink]="['/camera', cam.id]">Watch</a>
                  <button type="button" class="btn small icon" (click)="store.move(cam.id, -1)" [disabled]="first" aria-label="Move up">↑</button>
                  <button type="button" class="btn small icon" (click)="store.move(cam.id, 1)" [disabled]="last" aria-label="Move down">↓</button>
                  <button type="button" class="btn small" (click)="startEdit(cam)">Edit</button>
                  <button type="button" class="btn small danger" (click)="remove(cam)">Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else if (store.loaded() && !formOpen()) {
        <div class="empty-state">
          <h2>No cameras yet</h2>
          <p>Add your first CCTV camera using its RTSP URL.</p>
        </div>
      }
    </div>
  `,
})
export class CameraManager {
  protected readonly store = inject(CameraStore);

  protected readonly form = new FormGroup(
    {
      name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      hqUrl: new FormControl('', { nonNullable: true, validators: [Validators.pattern(RTSP_URL)] }),
      lqUrl: new FormControl('', { nonNullable: true, validators: [Validators.pattern(RTSP_URL)] }),
      transport: new FormControl<Transport>('tcp', { nonNullable: true }),
    },
    { validators: atLeastOneUrl },
  );

  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly testing = signal(false);
  protected readonly saving = signal(false);
  protected readonly testResults = signal<StreamTest[]>([]);
  protected readonly formError = signal<string | null>(null);

  protected readonly importPreview = signal<ImportPreview | null>(null);
  protected readonly transferBusy = signal(false);
  protected readonly notice = signal<{ ok: boolean; text: string } | null>(null);

  protected readonly mask = maskUrl;

  constructor() {
    // A stale test result would be misleading once the URL changes.
    this.form.valueChanges.subscribe(() => {
      this.testResults.set([]);
      this.formError.set(null);
    });
  }

  protected startAdd(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', hqUrl: '', lqUrl: '', transport: 'tcp' });
    this.openForm();
  }

  protected startEdit(camera: Camera): void {
    this.editingId.set(camera.id);
    this.form.reset({ name: camera.name, hqUrl: camera.hqUrl, lqUrl: camera.lqUrl, transport: camera.transport });
    this.openForm();
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  /** Grab a snapshot from every URL that is filled in, in parallel. */
  protected async test(): Promise<void> {
    const api = this.store.api;
    if (!api) return;
    const { hqUrl, lqUrl, transport } = this.input();
    const streams = [
      { label: 'HQ', url: hqUrl },
      { label: 'LQ', url: lqUrl },
    ].filter((s) => s.url);

    this.testing.set(true);
    this.testResults.set([]);
    const results = await Promise.all(
      streams.map(async ({ label, url }): Promise<StreamTest> => {
        try {
          return { label, result: await api.testStream(url, transport) };
        } catch (err) {
          return { label, result: { ok: false, error: errorMessage(err) } };
        }
      }),
    );
    this.testResults.set(results);
    this.testing.set(false);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const id = this.editingId();
      if (id) await this.store.update(id, this.input());
      else await this.store.add(this.input());
      this.closeForm();
    } catch (err) {
      this.formError.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(camera: Camera): Promise<void> {
    if (!confirm(`Delete camera "${camera.name}"?`)) return;
    try {
      await this.store.remove(camera.id);
      if (this.editingId() === camera.id) this.closeForm();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  protected async exportCameras(): Promise<void> {
    const api = this.store.api;
    if (!api) return;
    await this.runTransfer(async () => {
      const result = await api.exportCameras();
      if (result.saved) {
        this.notice.set({
          ok: true,
          text: `Exported ${result.count} cameras to ${result.path}. The file contains camera passwords in plain text, so keep it safe.`,
        });
      }
    });
  }

  protected async pickImport(): Promise<void> {
    const api = this.store.api;
    if (!api) return;
    this.importPreview.set(null);
    await this.runTransfer(async () => this.importPreview.set(await api.pickImportFile()));
  }

  protected async applyImport(mode: ImportMode): Promise<void> {
    const api = this.store.api;
    if (!api) return;
    if (mode === 'replace' && !confirm(`Delete your ${this.store.cameras().length} cameras and replace them with the imported ones?`)) {
      return;
    }
    await this.runTransfer(async () => {
      const { added, skipped } = await api.applyImport(mode);
      this.importPreview.set(null);
      await this.store.load();
      const skippedText = skipped ? `, skipped ${skipped} already in the list` : '';
      this.notice.set({ ok: true, text: `Imported ${added} ${added === 1 ? 'camera' : 'cameras'}${skippedText}.` });
    });
  }

  /** Run an export/import step, turning failures into an error notice. */
  private async runTransfer(step: () => Promise<void>): Promise<void> {
    this.transferBusy.set(true);
    this.notice.set(null);
    try {
      await step();
    } catch (err) {
      this.notice.set({ ok: false, text: errorMessage(err) });
    } finally {
      this.transferBusy.set(false);
    }
  }

  private openForm(): void {
    this.testResults.set([]);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  private input(): CameraInput {
    const { name, hqUrl, lqUrl, transport } = this.form.getRawValue();
    return { name: name.trim(), hqUrl: hqUrl.trim(), lqUrl: lqUrl.trim(), transport };
  }
}
