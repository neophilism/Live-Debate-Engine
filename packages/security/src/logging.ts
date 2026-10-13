import { enumeration, identifier, integer, object } from '../../contracts/src/validation.js';

const event = object({
  event: enumeration(['protected-object-request', 'material-contract-request', 'administration-request'] as const), requestId: identifier('request'),
  status: integer(100, 599), result: enumeration(['completed', 'denied', 'invalid', 'unavailable'] as const),
});
/** Allowlist rather than recursively trying to guess which arbitrary fields are secret. */
export function securityLogLine(value: unknown): string { return JSON.stringify(event(value)); }
