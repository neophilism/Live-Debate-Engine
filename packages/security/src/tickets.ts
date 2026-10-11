import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '../../contracts/src/canonical.js';
import type { Parsed } from '../../contracts/src/validation.js';
import { ProtectedDataError, decodeBase64Url, ticketClaimsParser, type KeyProvider } from './envelope.js';

export type TicketClaims = Parsed<typeof ticketClaimsParser>;
export const TICKET_MAX_AGE_MS = 60000;
function validClaims(raw: unknown, now: number): TicketClaims {
  const value = ticketClaimsParser(raw);
  if (!Number.isSafeInteger(now) || now < 0 || value.sessionId === null || value.issuedAt > now || value.expiresAt <= now
    || value.expiresAt <= value.issuedAt || value.expiresAt - value.issuedAt > TICKET_MAX_AGE_MS) throw new ProtectedDataError();
  return value;
}
export async function issueTicket(raw: TicketClaims, now: number, keys: KeyProvider): Promise<string> {
  const claims = validClaims(raw, now); const key = await keys.active('asset-ticket');
  if (key.purpose !== 'asset-ticket' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(key.id) || key.key.symmetricKeySize !== 32) throw new ProtectedDataError();
  const body = Buffer.from(canonicalJson(claims)).toString('base64url'); const input = `lde1.${key.id}.${body}`;
  return `${input}.${createHmac('sha256', key.key).update(input).digest('base64url')}`;
}
export async function verifyTicket(token: string, now: number, keys: KeyProvider): Promise<TicketClaims> {
  try {
    if (typeof token !== 'string' || token.length > 2048) throw new ProtectedDataError();
    const parts = token.split('.'); const [version, keyId, body, tag] = parts;
    if (parts.length !== 4 || version !== 'lde1' || !keyId || !body || !tag || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(keyId)) throw new ProtectedDataError();
    const key = await keys.resolve('asset-ticket', keyId);
    if (key.id !== keyId || key.purpose !== 'asset-ticket' || key.key.symmetricKeySize !== 32) throw new ProtectedDataError();
    const expected = createHmac('sha256', key.key).update(`lde1.${keyId}.${body}`).digest();
    if (!timingSafeEqual(expected, decodeBase64Url(tag, 32, 32))) throw new ProtectedDataError();
    const encoded = decodeBase64Url(body, undefined, 1400).toString('utf8'); const claims = validClaims(JSON.parse(encoded), now);
    if (canonicalJson(claims) !== encoded) throw new ProtectedDataError();
    return claims;
  } catch { throw new ProtectedDataError(); }
}
