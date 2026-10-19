/** Strip Electron's "Error invoking remote method ..." prefix from IPC errors. */
export function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
