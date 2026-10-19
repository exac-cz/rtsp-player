import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Camera, CameraInput, TestResult, Transport } from '../../../electron/api-types';
import { CameraStore, errorMessage, maskUrl } from '../core/camera-store';

@Component({
  selector: 'app-camera-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="toolbar">
      <h2 class="toolbar-title">Cameras</h2>
      <span class="spacer"></span>
      @if (!formOpen()) {
        <button type="button" class="btn primary" (click)="startAdd()" [disabled]="!store.api">+ Add camera</button>
      }
    </div>

    <div class="page">
      @if (formOpen()) {
        <form class="card camera-form" [formGroup]="form" (ngSubmit)="save()">
          <h3>{{ editingId() ? 'Edit camera' : 'New camera' }}</h3>

          <label>
            Name
            <input formControlName="name" placeholder="Front door" autofocus />
          </label>

          <label>
            RTSP URL
            <input formControlName="url" placeholder="rtsp://user:password@192.168.1.10:554/stream1" spellcheck="false" />
            @if (form.controls.url.touched && form.controls.url.invalid) {
              <small class="field-error">Enter a URL starting with rtsp:// or rtsps://</small>
            }
          </label>

          <label>
            Transport
            <select formControlName="transport">
              <option value="tcp">TCP (recommended)</option>
              <option value="udp">UDP</option>
            </select>
          </label>

          @if (testResult(); as result) {
            @if (result.ok) {
              <div class="test-result ok">
                <span>✔ Connection works</span>
                <img [src]="result.snapshot" alt="Camera snapshot" />
              </div>
            } @else {
              <div class="test-result error">✖ {{ result.error }}</div>
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
              <th>URL</th>
              <th>Transport</th>
              <th class="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (cam of store.cameras(); track cam.id; let first = $first, last = $last) {
              <tr>
                <td>{{ cam.name }}</td>
                <td class="url">{{ mask(cam.url) }}</td>
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

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\s*rtsps?:\/\/\S+\s*$/i)],
    }),
    transport: new FormControl<Transport>('tcp', { nonNullable: true }),
  });

  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly testing = signal(false);
  protected readonly saving = signal(false);
  protected readonly testResult = signal<TestResult | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly mask = maskUrl;

  constructor() {
    // A stale test result would be misleading once the URL changes.
    this.form.valueChanges.subscribe(() => {
      this.testResult.set(null);
      this.formError.set(null);
    });
  }

  protected startAdd(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', url: '', transport: 'tcp' });
    this.openForm();
  }

  protected startEdit(camera: Camera): void {
    this.editingId.set(camera.id);
    this.form.reset({ name: camera.name, url: camera.url, transport: camera.transport });
    this.openForm();
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  protected async test(): Promise<void> {
    if (!this.store.api) return;
    this.testing.set(true);
    this.testResult.set(null);
    try {
      this.testResult.set(await this.store.api.testCamera(this.input()));
    } catch (err) {
      this.testResult.set({ ok: false, error: errorMessage(err) });
    } finally {
      this.testing.set(false);
    }
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

  private openForm(): void {
    this.testResult.set(null);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  private input(): CameraInput {
    const { name, url, transport } = this.form.getRawValue();
    return { name: name.trim(), url: url.trim(), transport };
  }
}
