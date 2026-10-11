import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import type { IdentityConfig } from './config.js';
import type { IdentityMail, IdentityMailer } from './provider.js';

export type MailEnvironment = Readonly<Record<string, string | undefined>>;
const error = () => new Error('Identity mail delivery unavailable');

/** Fixed-provider transport; no caller-supplied URL, forwarding header, or redirect. */
export function identityMailer(config: IdentityConfig, env: MailEnvironment, request: typeof fetch = fetch): IdentityMailer {
  const mode = env.LDE_IDENTITY_MAIL_MODE;
  if (mode === 'local-file') {
    const origin = new URL(config.origin);
    if (config.environment === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw error();
    const directory = path.resolve('.lde-mail');
    return async (message) => {
      validateMessage(message, config.origin);
      await mkdir(directory, { mode: 0o700, recursive: true });
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw error();
      const file = await open(path.join(directory, `${randomUUID()}.json`), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(JSON.stringify(message)); } finally { await file.close(); }
    };
  }
  if (mode !== 'resend') throw error();
  const key = env.RESEND_API_KEY; const from = env.LDE_IDENTITY_MAIL_FROM;
  if (!key || !/^re_[A-Za-z0-9_-]{20,200}$/.test(key) || !from || from.length > 254 || /[\r\n\0]/.test(from) || !from.includes('@')) throw error();
  return async (message) => {
    validateMessage(message, config.origin);
    const subject = message.kind === 'verify-email' ? 'Verify your Live Debate Engine email' : 'Reset your Live Debate Engine password';
    const payload = JSON.stringify({ from, to: [message.to], subject, text: `${subject}\n\n${message.url}\n\nDo not share this link. Ignore this message if you did not request it.` });
    const result = await request('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'idempotency-key': `lde-identity-${createHash('sha256').update(payload).digest('hex')}` },
      body: payload,
    }).catch(() => { throw error(); });
    await result.body?.cancel();
    if (!result.ok) throw error();
  };
}
function validateMessage(message: IdentityMail, origin: string): void {
  if (!['verify-email', 'reset-password'].includes(message.kind) || message.to.length > 254 || /[\r\n\0]/.test(message.to)) throw error();
  const target = new URL(message.url);
  if (target.origin !== origin || target.username || target.password || target.hash || message.url.length > 8192) throw error();
}
