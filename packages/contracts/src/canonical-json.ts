import { assertUnicode, dataObject, reject } from './validation.js';

export const CANONICAL_FORMAT = 'lde-json-integers-v1';
export const MAX_RECORD_BYTES = 262144;

/** Engine-specific integer-only canonical JSON, not a general RFC 8785 implementation. */
export function canonicalJson(value: unknown): string {
  let nodes = 0; let bytes = 0;
  const stack = new Set<object>();
  function emit(chunk: string): string {
    bytes += new TextEncoder().encode(chunk).byteLength;
    if (bytes > MAX_RECORD_BYTES) reject('Record exceeds canonical byte limit');
    return chunk;
  }
  function visit(input: unknown, depth: number): string {
    if (++nodes > 10000 || depth > 32) reject('Record exceeds structural limits');
    if (input === null) return emit('null');
    if (typeof input === 'boolean') return emit(String(input));
    if (typeof input === 'number') {
      if (!Number.isSafeInteger(input) || Object.is(input, -0)) reject('Canonical numbers must be safe integers');
      return emit(String(input));
    }
    if (typeof input === 'string') {
      if (input.length > MAX_RECORD_BYTES) reject('Canonical string is too large');
      assertUnicode(input);
      return emit(JSON.stringify(input));
    }
    if (typeof input !== 'object') reject('Unsupported canonical value');
    if (stack.has(input)) reject('Cyclic record is unsupported');
    stack.add(input);
    try {
      if (Array.isArray(input)) {
        if (input.length > 1000 || Object.keys(input).length !== input.length || Reflect.ownKeys(input).length !== input.length + 1) reject('Invalid canonical array');
        const pieces = [emit('[')];
        for (let i = 0; i < input.length; i += 1) {
          const item = Object.getOwnPropertyDescriptor(input, String(i));
          if (!item || !Object.hasOwn(item, 'value')) reject('Sparse or accessor array');
          if (i) pieces.push(emit(','));
          pieces.push(visit(item.value, depth + 1));
        }
        pieces.push(emit(']'));
        return pieces.join('');
      }
      const object = dataObject(input);
      const keys = Object.keys(object).sort();
      const pieces = [emit('{')];
      for (const [index, key] of keys.entries()) {
        if (key.length > 256) reject('Canonical key is too long');
        if (index) pieces.push(emit(','));
        pieces.push(visit(key, depth + 1), emit(':'), visit(object[key], depth + 1));
      }
      pieces.push(emit('}'));
      return pieces.join('');
    } finally { stack.delete(input); }
  }
  return visit(value, 0);
}
