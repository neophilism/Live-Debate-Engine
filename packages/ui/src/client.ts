export class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Same-origin cookies only. Never cache session, password, MFA seed or reset token in web storage. */
export async function request(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('Invalid application route');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
      ...(body === undefined ? { method: 'GET' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = response.status === 401 ? 'Your credentials could not be verified. Sign in again or check your code.' : response.status === 403 ? 'Access is not available. Verify your email or complete a fresh authenticator challenge.' : response.status === 429 ? 'Too many attempts. Please wait before trying again.' : response.status >= 500 ? 'The service is temporarily unavailable. Please try again.' : 'The request was not accepted. Check the values and try again.';
      throw new RequestError(message, response.status);
    }
    if (!isRecord(data)) throw new RequestError('The service returned an unexpected response.', 502);
    return data;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('The request could not reach the service. Check your connection and try again.', 0);
  } finally { clearTimeout(timeout); }
}
export type Session = Readonly<{ principalId: string; sessionId: string; assurance: 'mfa' | 'single-factor'; mfaVerifiedAt: string | null }>;
export function readSession(value: unknown): Session {
  if (!isRecord(value) || typeof value.principalId !== 'string' || typeof value.sessionId !== 'string' || !['mfa', 'single-factor'].includes(String(value.assurance)) || !(value.mfaVerifiedAt === null || typeof value.mfaVerifiedAt === 'string')) throw new Error('Session response could not be verified.');
  return value as Session;
}
