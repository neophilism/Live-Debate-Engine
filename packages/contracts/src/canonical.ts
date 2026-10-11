import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.js';
export { canonicalJson, CANONICAL_FORMAT, MAX_RECORD_BYTES } from './canonical-json.js';
export function contentHash(value: unknown): string { return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex'); }
