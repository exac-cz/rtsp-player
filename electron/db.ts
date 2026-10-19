import { safeStorage } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import type { Camera, CameraInput, Transport } from './api-types';

interface CameraRow {
  id: number;
  name: string;
  hq_url: string;
  lq_url: string;
  transport: Transport;
  sort_order: number;
}

const ENCRYPTED_PREFIX = 'enc:';

// RTSP URLs usually contain the camera password, so encrypt them at rest with the
// OS keychain (DPAPI on Windows) whenever it is available.
function encryptUrl(url: string): string {
  if (!url || !safeStorage.isEncryptionAvailable()) return url;
  return ENCRYPTED_PREFIX + safeStorage.encryptString(url).toString('base64');
}

function decryptUrl(stored: string): string {
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;
  return safeStorage.decryptString(Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64'));
}

function toCamera(row: CameraRow): Camera {
  return {
    id: row.id,
    name: row.name,
    hqUrl: decryptUrl(row.hq_url),
    lqUrl: decryptUrl(row.lq_url),
    transport: row.transport,
    sortOrder: row.sort_order,
  };
}

export class CameraRepository {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    const { user_version } = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (user_version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cameras (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT    NOT NULL,
          url        TEXT    NOT NULL,
          transport  TEXT    NOT NULL DEFAULT 'tcp' CHECK (transport IN ('tcp', 'udp')),
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `);
    }
    if (user_version < 2) {
      // v2: separate high- and low-quality stream URLs; the original URL becomes the HQ one.
      this.db.exec(`
        ALTER TABLE cameras RENAME COLUMN url TO hq_url;
        ALTER TABLE cameras ADD COLUMN lq_url TEXT NOT NULL DEFAULT '';
        PRAGMA user_version = 2;
      `);
    }
  }

  list(): Camera[] {
    const rows = this.db.prepare('SELECT * FROM cameras ORDER BY sort_order, id').all() as unknown as CameraRow[];
    return rows.map(toCamera);
  }

  get(id: number): Camera | undefined {
    const row = this.db.prepare('SELECT * FROM cameras WHERE id = ?').get(id) as unknown as CameraRow | undefined;
    return row ? toCamera(row) : undefined;
  }

  create(input: CameraInput): Camera {
    const { next } = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM cameras').get() as {
      next: number;
    };
    const result = this.db
      .prepare('INSERT INTO cameras (name, hq_url, lq_url, transport, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(input.name, encryptUrl(input.hqUrl), encryptUrl(input.lqUrl), input.transport, next);
    return this.get(Number(result.lastInsertRowid))!;
  }

  update(id: number, input: CameraInput): Camera {
    const result = this.db
      .prepare('UPDATE cameras SET name = ?, hq_url = ?, lq_url = ?, transport = ? WHERE id = ?')
      .run(input.name, encryptUrl(input.hqUrl), encryptUrl(input.lqUrl), input.transport, id);
    if (result.changes === 0) throw new Error(`Camera ${id} not found`);
    return this.get(id)!;
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM cameras WHERE id = ?').run(id);
  }

  reorder(ids: number[]): Camera[] {
    const stmt = this.db.prepare('UPDATE cameras SET sort_order = ? WHERE id = ?');
    this.db.exec('BEGIN');
    try {
      ids.forEach((id, index) => stmt.run(index, id));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return this.list();
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  close(): void {
    this.db.close();
  }
}
