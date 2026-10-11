import { createHmac } from 'node:crypto';

/** Independent RFC 6238 authenticator for tests, not a production verification function. */
export function authenticatorCode(uri, time = Date.now()) {
  const url = new URL(uri); const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const encoded = url.searchParams.get('secret').toUpperCase().replace(/=+$/, '');
  let bits = 0; let value = 0; const bytes = [];
  for (const letter of encoded) {
    const next = alphabet.indexOf(letter); if (next < 0) throw new Error('Invalid test secret');
    value = (value << 5) | next; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const period = Number(url.searchParams.get('period') ?? 30);
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / period)));
  const digest = createHmac((url.searchParams.get('algorithm') ?? 'SHA1').toLowerCase(), Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** Number(url.searchParams.get('digits') ?? 6))).padStart(Number(url.searchParams.get('digits') ?? 6), '0');
}

export function cookieJar() {
  const cookies = new Map();
  return {
    ingest(headers) {
      for (const header of headers.getSetCookie()) {
        const pair = header.split(';', 1)[0]; const equals = pair.indexOf('=');
        const key = pair.slice(0, equals); const value = pair.slice(equals + 1);
        if (/max-age=0(?:;|$)/i.test(header) || value === '') cookies.delete(key); else cookies.set(key, value);
      }
    },
    header() { return [...cookies].map(([key, value]) => `${key}=${value}`).join('; '); },
    copy() { const other = cookieJar(); other.ingest(new Headers([...cookies].map(([key, value]) => ['set-cookie', `${key}=${value}`]))); return other; },
  };
}

export function browser(origin) {
  const jar = cookieJar();
  return {
    jar,
    async call(path, { method = 'GET', body, headers = {} } = {}) {
      const response = await fetch(`${origin}${path}`, { method, redirect: 'manual', headers: {
        cookie: jar.header(), ...(method === 'POST' ? { origin, 'content-type': 'application/json' } : {}), ...headers,
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      jar.ingest(response.headers);
      return { status: response.status, headers: response.headers, data: await response.json().catch(() => null) };
    },
  };
}
