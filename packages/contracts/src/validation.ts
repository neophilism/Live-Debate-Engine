export class ContractError extends Error {
  readonly code = 'invalid_contract';
  constructor(message = 'Invalid contract value') { super(message); this.name = 'ContractError'; }
}
export type Parser<T> = (value: unknown) => T;
export type Parsed<P> = P extends Parser<infer T> ? T : never;

export function reject(message: string): never { throw new ContractError(message); }

export function assertUnicode(value: string): void {
  if (value.includes('\0')) reject('NUL is not a supported text character');
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) reject('Invalid Unicode text');
    } else if (code >= 0xdc00 && code <= 0xdfff) reject('Invalid Unicode text');
  }
}

/** Only plain JSON data; never invoke getters, toJSON methods or class instances. */
export function dataObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('Expected object');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) reject('Expected plain data object');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== Object.keys(value).length) reject('Hidden object properties are unsupported');
  for (const descriptor of Object.values(descriptors)) {
    if (!Object.hasOwn(descriptor, 'value')) reject('Accessor properties are unsupported');
  }
  return value as Record<string, unknown>;
}

export function text(min = 1, max = 240): Parser<string> {
  return (value) => {
    if (typeof value !== 'string' || value.length < min || value.length > max || (min > 0 && !value.trim())) reject('Invalid text length');
    assertUnicode(value);
    return value;
  };
}
export function integer(min = 0, max = 2147483647): Parser<number> {
  return (value) => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < min || value > max) reject('Invalid integer');
    return value;
  };
}
export function literal<const T extends string | number | boolean>(expected: T): Parser<T> {
  return (value) => value === expected ? expected : reject('Unexpected contract discriminator');
}
export function enumeration<const T extends readonly string[]>(values: T): Parser<T[number]> {
  return (value) => typeof value === 'string' && values.includes(value) ? value as T[number] : reject('Unknown enumeration value');
}
export function nullable<T>(parser: Parser<T>): Parser<T | null> { return (value) => value === null ? null : parser(value); }
export const boolean: Parser<boolean> = (value) => typeof value === 'boolean' ? value : reject('Expected boolean');
export function refine<T>(parser: Parser<T>, predicate: (value: T) => boolean, message: string): Parser<T> {
  return (input) => { const value = parser(input); return predicate(value) ? value : reject(message); };
}
export function array<T>(parser: Parser<T>, min = 0, max = 1000): Parser<readonly T[]> {
  return (value) => {
    if (!Array.isArray(value) || value.length < min || value.length > max || Object.keys(value).length !== value.length || Reflect.ownKeys(value).length !== value.length + 1) reject('Invalid array');
    const result: T[] = [];
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject('Sparse or accessor array is unsupported');
      result.push(parser(descriptor.value));
    }
    return Object.freeze(result);
  };
}
type Shape = Readonly<Record<string, Parser<unknown>>>;
type ObjectResult<S extends Shape> = { readonly [K in keyof S]: Parsed<S[K]> };
export function object<const S extends Shape>(shape: S): Parser<ObjectResult<S>> {
  return (value) => {
    const input = dataObject(value);
    if (Object.keys(input).length !== Object.keys(shape).length || Object.keys(input).some((key) => !Object.hasOwn(shape, key))) reject('Missing or unknown contract fields');
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const parser = shape[key];
      if (!parser) reject('Missing field parser');
      output[key] = parser(input[key]);
    }
    return Object.freeze(output) as ObjectResult<S>;
  };
}

declare const identifierBrand: unique symbol;
export type Identifier<K extends string> = string & { readonly [identifierBrand]: K };
export function identifier<K extends string>(_kind: K): Parser<Identifier<K>> {
  return (value) => {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) reject('Expected canonical UUID v4');
    return value as Identifier<K>;
  };
}
export const digest = refine(text(64, 64), (value) => /^[a-f0-9]{64}$/.test(value), 'Expected SHA-256 hex digest');
export const code = refine(text(1, 64), (value) => /^[a-z][a-z0-9-]*$/.test(value), 'Invalid stable code');
export const timestamp: Parser<string> = (value) => {
  const input = text(24, 24)(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input)) reject('Expected canonical UTC timestamp');
  const time = new Date(input);
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== input) reject('Invalid UTC timestamp');
  return input;
};
