/** Hide the password part of an RTSP URL for display. */
export function maskUrl(url: string): string {
  return url.replace(/(rtsps?:\/\/[^:/@\s]+):[^@/\s]+@/i, '$1:••••@');
}
