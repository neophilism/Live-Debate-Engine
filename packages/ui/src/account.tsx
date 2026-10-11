import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, safeError } from './api.js';
import { Button, Card, Field, Notice, PageHeader } from './components.js';
import { navigate } from './navigation.js';

function AccountPanel({ title, introduction, children }: { title: string; introduction: string; children: ReactNode }) {
  return <div className="account-layout"><div><PageHeader label="Account access" title={title}><p>{introduction}</p></PageHeader><div className="account-aside"><span className="line-mark" aria-hidden="true" /><h2>Fair debate starts with clear boundaries.</h2><p>Your account identifies you. Event organizers separately assign participation and operating permissions.</p><p>Creating an account does not enroll you as a voter or give you staff access.</p></div></div><Card title={title}>{children}</Card></div>;
}
export function Register() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try { await api('/api/auth/sign-up/email', { body: { name: fields.get('name'), email: fields.get('email'), password: fields.get('password'), callbackURL: `${location.origin}/sign-in` } }); form.reset(); setSent(true); }
    catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }
  return <AccountPanel title="Create your account" introduction="A single place to manage your participation and access.">{sent ? <><Notice tone="success" focus>Check your inbox for a verification link. Verify your email before signing in.</Notice><a className="button button-primary" href="/sign-in">Continue to sign in</a></> : <form onSubmit={submit}>
    {error && <Notice tone="error" focus>{error}</Notice>}<Field label="Your name" name="name" autoComplete="name" required maxLength={100} />
    <Field label="Email address" name="email" type="email" autoComplete="email" required maxLength={254} />
    <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} hint="Use 12 or more characters. Do not reuse a password from another service." />
    <Button type="submit" busy={busy}>Create account</Button><p className="form-footer">Already registered? <a href="/sign-in">Sign in</a></p>
  </form>}</AccountPanel>;
}
export function SignIn({ onSessionChange }: { onSessionChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try {
      const result = await api<{ twoFactorRedirect?: boolean }>('/api/auth/sign-in/email', { body: { email: fields.get('email'), password: fields.get('password') } });
      form.reset();
      if (result.twoFactorRedirect) navigate('/challenge'); else { await onSessionChange(); navigate('/workspace'); }
    } catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }
  return <AccountPanel title="Welcome back" introduction="Sign in to your authorized workspaces and account settings."><form onSubmit={submit}>
    {error && <Notice tone="error" focus>{error}</Notice>}<Field label="Email address" name="email" type="email" autoComplete="email" required />
    <Field label="Password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
    <Button type="submit" busy={busy}>Sign in</Button><div className="form-links"><a href="/forgot-password">Forgot your password?</a><a href="/register">Create an account</a></div>
  </form><details className="help"><summary>Need another verification email?</summary><ResendVerification /></details></AccountPanel>;
}
function ResendVerification() {
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState('');
  return <form onSubmit={async (event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setStatus('');
    try { await api('/api/auth/send-verification-email', { body: { email: fields.get('email'), callbackURL: `${location.origin}/sign-in` } }); setStatus('A verification message has been requested. Check your inbox and spam folder.'); }
    catch (failure) { setStatus(safeError(failure)); } finally { setBusy(false); }
  }}><Field label="Email to verify" type="email" name="email" required autoComplete="email" /><Button type="submit" variant="secondary" busy={busy}>Request verification email</Button>{status && <Notice>{status}</Notice>}</form>;
}
export function ForgotPassword() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [sent, setSent] = useState(false);
  return <AccountPanel title="Reset your password" introduction="Request a private link to recover access to your account.">{sent ? <Notice tone="success" focus>If an eligible account exists, a reset message has been requested. Check your inbox. The link expires after 15 minutes.</Notice> : <form onSubmit={async (event) => {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try { await api('/api/auth/request-password-reset', { body: { email: fields.get('email'), redirectTo: `${location.origin}/reset-password` } }); form.reset(); setSent(true); }
    catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }}>{error && <Notice tone="error" focus>{error}</Notice>}<Field label="Email address" name="email" type="email" autoComplete="email" required /><Button type="submit" busy={busy}>Request reset link</Button></form>}<p className="form-footer"><a href="/sign-in">Back to sign in</a></p></AccountPanel>;
}
export function ResetPassword() {
  const [token] = useState(() => new URL(location.href).searchParams.get('token') ?? '');
  useEffect(() => { history.replaceState(null, '', '/reset-password'); }, []);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  return <AccountPanel title="Choose a new password" introduction="Resetting your password ends your previous sessions.">{!token ? <Notice tone="error">This page needs a valid reset link. <a href="/forgot-password">Request a new one.</a></Notice> : done ? <><Notice tone="success" focus>Your password was changed. Sign in with the new password.</Notice><a className="button button-primary" href="/sign-in">Sign in</a></> : <form onSubmit={async (event) => {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try { await api('/api/auth/reset-password', { body: { newPassword: fields.get('password'), token } }); form.reset(); setDone(true); }
    catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }}>{error && <Notice tone="error" focus>{error}</Notice>}<Field label="New password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" hint="At least 12 characters." /><Button type="submit" busy={busy}>Save new password</Button></form>}</AccountPanel>;
}
export function Challenge({ onSessionChange }: { onSessionChange: () => Promise<void> }) {
  const [recovery, setRecovery] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <AccountPanel title={recovery ? 'Use a recovery code' : 'Verify your authenticator'} introduction={recovery ? 'Recovery restores account access, not privileged staff authorization. Your other sessions will be ended.' : 'Enter the current code from your authenticator app.'}><form onSubmit={async (event) => {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try { await api(`/api/auth/two-factor/${recovery ? 'verify-backup-code' : 'verify-totp'}`, { body: { code: fields.get('code'), trustDevice: false } }); form.reset(); await onSessionChange(); navigate(recovery ? '/security?recovered=1' : '/workspace'); }
    catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }}>{error && <Notice tone="error" focus>{error}</Notice>}<Field key={String(recovery)} label={recovery ? 'Recovery code' : 'Authenticator code'} name="code" autoComplete="one-time-code" inputMode={recovery ? 'text' : 'numeric'} pattern={recovery ? undefined : '[0-9]{6}'} minLength={recovery ? undefined : 6} maxLength={recovery ? 100 : 6} required />
    <Button type="submit" busy={busy}>{recovery ? 'Recover account access' : 'Verify code'}</Button></form><Button variant="quiet" onClick={() => { setRecovery(!recovery); setError(''); }}>{recovery ? 'Use an authenticator instead' : 'Use a recovery code instead'}</Button></AccountPanel>;
}
