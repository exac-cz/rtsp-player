import type { CameraInput, Transport } from './api-types';

// Everything arriving from the renderer or an imported file is untrusted, so it is checked here.

export function toId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid id: ${String(value)}`);
  return id;
}

export function toUrl(value: unknown, label: string): string {
  const url = typeof value === 'string' ? value.trim() : '';
  if (url && !/^rtsps?:\/\/\S+$/i.test(url))
    throw new Error(`${label} must start with rtsp:// or rtsps://`);
  return url;
}

export function toTransport(value: unknown): Transport {
  return value === 'udp' ? 'udp' : 'tcp';
}

export function toCameraInput(value: unknown): CameraInput {
  const input = (value ?? {}) as Partial<Record<keyof CameraInput, unknown>>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) throw new Error('Camera name is required');
  const hqUrl = toUrl(input.hqUrl, 'HQ URL');
  const lqUrl = toUrl(input.lqUrl, 'LQ URL');
  if (!hqUrl && !lqUrl) throw new Error('Enter at least one stream URL');
  return { name, hqUrl, lqUrl, transport: toTransport(input.transport) };
}
