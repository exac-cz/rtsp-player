import type { Camera, CameraInput } from './api-types';
import { toCameraInput } from './validation';

// File format for moving the camera setup between app instances.
// URLs are stored in plain text (including passwords): the encrypted form only
// works on the machine and Windows account that created it.

const FORMAT = 'rtsp-player-cameras';
const VERSION = 1;

interface ExportFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  cameras: CameraInput[];
  /** Custom grid as indexes into `cameras`, in display order; null if never customised. */
  customGrid: number[] | null;
}

export interface ParsedImport {
  cameras: CameraInput[];
  customGrid: number[] | null;
}

export function serializeExport(cameras: Camera[], customGridIds: number[] | null): string {
  const indexById = new Map(cameras.map((c, i) => [c.id, i]));
  const file: ExportFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    cameras: cameras.map(({ name, hqUrl, lqUrl, transport }) => ({
      name,
      hqUrl,
      lqUrl,
      transport,
    })),
    customGrid: customGridIds ? customGridIds.flatMap((id) => indexById.get(id) ?? []) : null,
  };
  return JSON.stringify(file, null, 2) + '\n';
}

/** Parse and validate an export file. Throws with a readable message when anything is wrong. */
export function parseImport(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }

  // Accept a bare array of cameras too, for hand-written files.
  const root = (Array.isArray(data) ? { cameras: data } : data) as Partial<
    Record<keyof ExportFile, unknown>
  > | null;
  if (!root || typeof root !== 'object' || !Array.isArray(root.cameras)) {
    throw new Error('The file does not contain a camera list.');
  }
  if (root.format !== undefined && root.format !== FORMAT) {
    throw new Error('This is not an RTSP Player camera export.');
  }
  if (typeof root.version === 'number' && root.version > VERSION) {
    throw new Error('The file was exported by a newer version of RTSP Player.');
  }

  const cameras = root.cameras.map((value, i) => {
    try {
      return toCameraInput(value);
    } catch (err) {
      throw new Error(`Camera ${i + 1}: ${(err as Error).message}`, { cause: err });
    }
  });
  if (!cameras.length) throw new Error('The file contains no cameras.');

  const customGrid = Array.isArray(root.customGrid)
    ? root.customGrid.filter(
        (i): i is number => Number.isInteger(i) && i >= 0 && i < cameras.length,
      )
    : null;

  return { cameras, customGrid };
}

/** Two cameras are the same when they point at the same streams. */
export function sameStreams(
  a: Pick<CameraInput, 'hqUrl' | 'lqUrl'>,
  b: Pick<CameraInput, 'hqUrl' | 'lqUrl'>,
): boolean {
  return a.hqUrl === b.hqUrl && a.lqUrl === b.lqUrl;
}
