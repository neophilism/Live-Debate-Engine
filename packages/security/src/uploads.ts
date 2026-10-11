import { createConnection } from 'node:net';
import { isAbsolute } from 'node:path';
import { MAX_OBJECT_BYTES, type ObjectContext } from './envelope.js';

export type ScanVerdict = Readonly<{ verdict: 'clean' | 'rejected' | 'unavailable'; engine: string }>;
export interface ContentScanner { readonly id: string; scan(bytes: Buffer, contentType: ObjectContext['contentType']): Promise<ScanVerdict>; }

export function matchesDeclaredType(bytes: Buffer, contentType: ObjectContext['contentType']): boolean {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_OBJECT_BYTES) return false;
  if (contentType === 'application/pdf') return bytes.subarray(0, 5).equals(Buffer.from('%PDF-'));
  if (contentType === 'image/png') return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === 'image/jpeg') return bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  try {
    const string = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (string.includes('\0')) return false;
    if (contentType === 'application/json') { JSON.parse(string); return true; }
    return contentType === 'text/plain';
  } catch { return false; }
}
/** Local Unix socket only: remote plaintext scanning is not silently permitted. */
export class ClamAvScanner implements ContentScanner {
  readonly id = 'clamav-instream-v1';
  constructor(private readonly socketPath: string, private readonly timeoutMs = 5000) {
    if (!isAbsolute(socketPath) || socketPath.includes('\0') || socketPath.length > 100 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('Invalid scanner configuration');
  }
  private request(command: string, bytes?: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ path: this.socketPath }); let result = Buffer.alloc(0); let completed = false;
      const done = (value?: string) => {
        if (completed) return; completed = true; clearTimeout(timer); socket.destroy();
        if (value === undefined) reject(new Error('Scanner unavailable')); else resolve(value);
      };
      const timer = setTimeout(() => done(), this.timeoutMs);
      socket.once('error', () => done()); socket.once('close', () => { if (!completed) done(); });
      socket.once('end', () => {
        const end = result.indexOf(0);
        if (end < 0 || end !== result.length - 1) { done(); return; }
        done(result.subarray(0, end).toString('utf8'));
      });
      socket.once('connect', () => {
        socket.write(command);
        if (bytes) {
          for (let offset = 0; offset < bytes.length; offset += 65536) {
            const part = bytes.subarray(offset, Math.min(bytes.length, offset + 65536));
            const size = Buffer.alloc(4); size.writeUInt32BE(part.length); socket.write(size); socket.write(part);
          }
          socket.write(Buffer.alloc(4));
        }
      });
      socket.on('data', (part: Buffer) => {
        if (result.length + part.length > 1024) { done(); return; }
        result = Buffer.concat([result, part]);
        // Drain through EOF: a second record or delayed error must not be ignored.
      });
    });
  }
  async scan(bytes: Buffer, contentType: ObjectContext['contentType']): Promise<ScanVerdict> {
    if (!matchesDeclaredType(bytes, contentType)) return { verdict: 'rejected', engine: 'content-format-v1' };
    try {
      const version = await this.request('zVERSION\0');
      // Typical VERSION response includes signature date punctuation; store only bounded safe evidence.
      if (!/^ClamAV [A-Za-z0-9 ./:_+-]{1,140}$/.test(version)) return { verdict: 'unavailable', engine: this.id };
      const result = await this.request('zINSTREAM\0', bytes);
      const engine = version.replaceAll('/', ':').replaceAll('+', '-');
      if (result === 'stream: OK') return { verdict: 'clean', engine };
      if (/^stream: [ -~]{1,900} FOUND$/.test(result)) return { verdict: 'rejected', engine };
      return { verdict: 'unavailable', engine };
    } catch { return { verdict: 'unavailable', engine: this.id }; }
  }
}
