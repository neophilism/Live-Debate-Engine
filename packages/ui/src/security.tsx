import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, safeError } from './api.js';
import { Button, Card, ConfirmDialog, DataTable, Field, Notice, PageHeader, Status, readableDate } from './components.js';
import type { Session } from './types.js';

type BrowserSession = { id: string; createdAt: string; expiresAt: string };
export function Security({ session, onSessionChange }: { session: Session; onSessionChange: () => Promise<void> }) {
  const [sessions, setSessions] = useState<BrowserSession[]>([]); const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null); const [busy, setBusy] = useState(false); 
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const result = await api<{ sessions: BrowserSession[] }>('/api/sessions', signal ? { signal } : {}); if (!signal?.aborted) { setSessions(result.sessions); setError(''); } }
    catch (failure) { if (!signal?.aborted) setError(safeError(failure)); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  return <><PageHeader label="Account / Security" title="Keep access in your hands"><p>Manage your authenticator and sessions. Staff actions require a recent, completed authenticator check.</p></PageHeader>
    {new URLSearchParams(location.search).has('recovered') && <Notice>You recovered account access. Verify or re-enroll an authenticator before using staff permissions.</Notice>}
    <div className="two-column"><Card title="Authenticator protection"><p><Status state={session.twoFactorEnabled ? 'active' : 'pending'} /></p>
      <p>{session.twoFactorEnabled ? 'An authenticator is enrolled for your account.' : 'Add an authenticator before accepting a staff role.'}</p>
      <p className="muted">{session.mfaVerifiedAt ? `Last verified: ${readableDate(session.mfaVerifiedAt)}. Sensitive approvals require a check within 15 minutes.` : 'This session has not completed an authenticator check.'}</p>
      <Authenticator enrolled={session.twoFactorEnabled} refresh={onSessionChange} />
    </Card><Card title="Change password"><p>Other sessions will be ended. When an authenticator is enrolled, complete a fresh check first.</p><ChangePassword refresh={onSessionChange} /></Card></div>
    <Card title="Your signed-in sessions"><p>Only your sessions are shown. Ending a session immediately removes its access on subsequent requests.</p>
      {error && <Notice tone="error" focus>{error}</Notice>}<Button variant="secondary" onClick={() => void load()}>Refresh sessions</Button>
      <DataTable caption="Active account sessions" headings={['Session', 'Signed in', 'Expires', 'Action']}>
        {sessions.map((item) => <tr key={item.id}><th scope="row">{item.id === session.sessionId ? 'This session' : `Session ${item.id.slice(-8)}`}</th><td>{readableDate(item.createdAt)}</td><td>{readableDate(item.expiresAt)}</td><td><Button variant="quiet" onClick={() => setPending(item.id)} aria-label={`End ${item.id === session.sessionId ? 'this session' : `session ${item.id.slice(-8)}`}`}>End session</Button></td></tr>)}
      </DataTable>{!sessions.length && !error && <p className="muted">No session records have loaded.</p>}
    </Card>
    {pending && <ConfirmDialog title="End this session?" confirm="End session" busy={busy} onCancel={() => setPending(null)} onConfirm={() => {
      setBusy(true); setError(''); void api(`/api/sessions/${encodeURIComponent(pending)}/revoke`, { body: {} }).then(async () => { setPending(null); await load(); await onSessionChange(); }).catch((failure) => setError(safeError(failure))).finally(() => setBusy(false));
    }}><p>The device using this session will need to sign in again.</p></ConfirmDialog>}
  </>;
}
function Authenticator({ enrolled, refresh }: { enrolled: boolean; refresh: () => Promise<void> }) {
  const [setup, setSetup] = useState<{ secret: string; codes: string[] } | null>(null); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [verified, setVerified] = useState(false);
  useEffect(() => { if (!enrolled) { setVerified(false); setMessage(''); setSetup(null); } }, [enrolled]);
  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try {
      const value = await api<{ totpURI: string; backupCodes: string[] }>('/api/auth/two-factor/enable', { body: { password: fields.get('password') } });
      const uri = new URL(value.totpURI); const secret = uri.searchParams.get('secret');
      if (uri.protocol !== 'otpauth:' || !secret || !/^[A-Z2-7]+=*$/i.test(secret) || !Array.isArray(value.backupCodes)) throw new Error('Invalid setup response');
      form.reset(); setSetup({ secret, codes: value.backupCodes }); setMessage('Add the setup key to your authenticator, save the recovery codes, then verify a code.');
    } catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }
  async function challenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try { await api('/api/auth/two-factor/verify-totp', { body: { code: fields.get('code'), trustDevice: false } }); form.reset(); setVerified(true); setMessage('Authenticator verified for this session.'); if (!setup) await refresh(); }
    catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }
  return <>{error && <Notice tone="error" focus>{error}</Notice>}{message && <Notice tone="success" focus>{message}</Notice>}
    {!enrolled && !setup && <form onSubmit={enable}><Field label="Confirm password to enroll" name="password" type="password" required autoComplete="current-password" /><Button type="submit" busy={busy}>Set up authenticator</Button></form>}
    {setup && <div className="secret-panel"><h3>Save these privately</h3><p>In your authenticator app, add a time-based account using this setup key. Never share the key or recovery codes.</p>
      <Field label="Authenticator setup key" value={setup.secret} readOnly autoComplete="off" spellCheck={false} /><label htmlFor="recovery-codes">Single-use recovery codes</label>
      <textarea id="recovery-codes" className="recovery-codes" rows={6} value={setup.codes.join('\n')} readOnly spellCheck={false} autoComplete="off" />
      <p>Recovery codes restore account access but do not substitute for a staff authenticator check.</p>
      {verified && <Button onClick={() => { setSetup(null); void refresh(); }}>I saved my recovery codes</Button>}
    </div>}
    {(enrolled || setup) && !verified && <form onSubmit={challenge}><Field label="Authenticator code" name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required hint="Enter the current six-digit code." /><Button type="submit" busy={busy}>Verify authenticator</Button></form>}
    {enrolled && <details className="help"><summary>Replace or remove an authenticator</summary><p>Complete a fresh authenticator check above. Disabling the factor clears old verification and ends other sessions.</p><DisableAuthenticator refresh={refresh} /></details>}
  </>;
}
function DisableAuthenticator({ refresh }: { refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form onSubmit={async (event) => {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError('');
    try { await api('/api/auth/two-factor/disable', { body: { password: fields.get('password') } }); form.reset(); await refresh(); }
    catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }}>{error && <Notice tone="error" focus>{error}</Notice>}<Field label="Confirm password to remove" name="password" type="password" autoComplete="current-password" required /><Button type="submit" variant="danger" busy={busy}>Remove authenticator</Button></form>;
}
function ChangePassword({ refresh }: { refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  return <form onSubmit={async (event) => {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setError(''); setDone(false);
    try { await api('/api/auth/change-password', { body: { currentPassword: fields.get('current'), newPassword: fields.get('new'), revokeOtherSessions: true } }); form.reset(); setDone(true); await refresh(); }
    catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }}>{error && <Notice tone="error" focus>{error}</Notice>}{done && <Notice tone="success" focus>Password changed. Other sessions have ended.</Notice>}
    <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
    <Field label="New password" name="new" type="password" autoComplete="new-password" required minLength={12} maxLength={128} hint="Use at least 12 characters." /><Button type="submit" busy={busy}>Change password</Button>
  </form>;
}
