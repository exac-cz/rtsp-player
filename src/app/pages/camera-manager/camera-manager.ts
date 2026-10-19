import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
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
} from '@shared/api-types';
import { CameraStore } from '../../services/camera-store';
import { errorMessage } from '../../utils/error-message';
import { maskUrl } from '../../utils/mask-url';

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
  templateUrl: './camera-manager.html',
  styleUrl: './camera-manager.scss',
})
export class CameraManager {
  protected readonly store = inject(CameraStore);
  private readonly injector = inject(Injector);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

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
    this.form.reset({
      name: camera.name,
      hqUrl: camera.hqUrl,
      lqUrl: camera.lqUrl,
      transport: camera.transport,
    });
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
    if (
      mode === 'replace' &&
      !confirm(
        `Delete your ${this.store.cameras().length} cameras and replace them with the imported ones?`,
      )
    ) {
      return;
    }
    await this.runTransfer(async () => {
      const { added, skipped } = await api.applyImport(mode);
      this.importPreview.set(null);
      await this.store.load();
      const skippedText = skipped ? `, skipped ${skipped} already in the list` : '';
      this.notice.set({
        ok: true,
        text: `Imported ${added} ${added === 1 ? 'camera' : 'cameras'}${skippedText}.`,
      });
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
    // Move focus into the form the user just asked for (instead of the `autofocus` attribute).
    afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
  }

  private input(): CameraInput {
    const { name, hqUrl, lqUrl, transport } = this.form.getRawValue();
    return { name: name.trim(), hqUrl: hqUrl.trim(), lqUrl: lqUrl.trim(), transport };
  }
}
