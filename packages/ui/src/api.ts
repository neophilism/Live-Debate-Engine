/** Browser adapter. No bearer credentials or persistent token storage. Mutations are never auto-retried. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(status === 401 ? 'Your session has ended. Sign in again.' : status === 403 ? 'This action needs the appropriate permission or a fresh authenticator check.' : status === 429 ? 'Too many attempts. Please pause before trying again.' : status === 413 ? 'This file is larger than the current storage limit.' : status >= 500 ? 'The service is unavailable. Your action has not been confirmed.' : 'The request could not be completed. Check your details and try again.');
    this.name = 'ApiError';
  }
}
export async function api<T>(path: string, options: Readonly<{ body?: unknown; raw?: File; signal?: AbortSignal }> = {}): Promise<T> {
  if (!path.startsWith('/api/') || path.startsWith('//') || path.includes('#')) throw new Error('Invalid API path');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
  const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const mutation = options.body !== undefined || options.raw !== undefined;
    const response = await fetch(path, { method: mutation ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: options.raw ? { 'content-type': options.raw.type } : mutation ? { 'content-type': 'application/json' } : {},
      ...(options.raw ? { body: options.raw } : options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
    const data: unknown = await response.json();
    if (!response.ok) {
      const code = data && typeof data === 'object' && 'code' in data && typeof data.code === 'string' ? data.code : 'request_failed';
      throw new ApiError(response.status, /^[A-Za-z0-9_-]{1,80}$/.test(code) ? code : 'request_failed');
    }
    return data as T;
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}
export function safeError(error: unknown): string {
  return error instanceof ApiError ? error.message : 'The request could not be confirmed. Check your connection and retry.';
}
export async function downloadFile(tenantId: string, objectId: string): Promise<void> {
  const prefix = `/api/tenants/${encodeURIComponent(tenantId)}/objects/${encodeURIComponent(objectId)}`;
  const { ticket } = await api<{ ticket: string }>(`${prefix}/ticket`, { body: {} });
  const response = await fetch(`${prefix}/content?ticket=${encodeURIComponent(ticket)}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ApiError(response.status, 'download_unavailable');
  const blob = await response.blob();
  if (blob.size > 1048576) throw new Error('Unexpected file size');
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `protected-${objectId}`; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
