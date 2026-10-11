import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, safeError } from './api.js';
import { Register, SignIn, ForgotPassword, ResetPassword, Challenge } from './account.js';
import { Security } from './security.js';
import { WorkspacePage, FileWorkspace } from './workspace.js';
import { Button, Card, Notice, PageHeader } from './components.js';
import { navigate, useLocation } from './navigation.js';
import type { InterfaceConfig, Session } from './types.js';

export function App() {
  const route = useLocation(); const path = route.split('?')[0] ?? '/';
  const [config, setConfig] = useState<InterfaceConfig | null>(null); const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [signingOut, setSigningOut] = useState(false);
  const request = useRef(0);
  const refreshSession = useCallback(async () => {
    const sequence = ++request.current; setSessionLoading(true);
    try { const value = await api<Session>('/api/session'); if (sequence === request.current) { setSession(value); setError(''); } }
    catch (failure) { if (sequence === request.current) { setSession(null); if (failure instanceof ApiError && failure.status === 401) setError(''); else setError(safeError(failure)); } }
    finally { if (sequence === request.current) setSessionLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void api<InterfaceConfig>('/api/interface', { signal: controller.signal }).then(setConfig).catch((failure) => { if (!controller.signal.aborted) setError(safeError(failure)); }); void refreshSession(); return () => { controller.abort(); request.current += 1; }; }, [refreshSession]);
  useEffect(() => { if (config) { document.documentElement.dataset.brand = config.brand.id; document.title = `${config.brand.name} | ${path === '/' ? 'Debate workspace' : path.slice(1).replaceAll('-', ' ')}`; } }, [config, path]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void refreshSession(); };
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh);
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [refreshSession]);
  const requireAccount = (content: ReactNode) => session ? content : sessionLoading ? <Notice>Checking your session...</Notice> : <><PageHeader label="Account access" title="Sign in to continue" /><Notice>{error || 'Your workspace is private. Sign in to view your authorized events.'}</Notice><a className="button button-primary" href="/sign-in">Sign in</a></>;
  let page: ReactNode;
  if (path === '/') page = <><PageHeader label="Live Debate Engine / Workspace" title="Give good arguments a fair hearing."><p>{config?.brand.description ?? 'A considered space for rigorous debate.'}</p></PageHeader><div className="hero-actions"><a className="button button-primary" href={session ? '/workspace' : '/sign-in'}>{session ? 'Open your workspace' : 'Sign in to participate'}</a>{!session && <a className="button button-secondary" href="/register">Create an account</a>}</div>
    <div className="principle-grid"><Card title="A motion. Two perspectives."><p>Structured speaking turns and clear responsibilities create room for a balanced exchange.</p></Card><Card title="Persuasion and quality, separately."><p>Audience opinion change and judges' assessments are distinct. Neither is a substitute for the other.</p></Card><Card title="Private preparation."><p>Keep account access, judging notes, financial documents, and production files within their assigned boundaries.</p></Card></div>
    <Notice>This engine is under development. Account access and protected preparation tools are available when configured. Live competitions are not yet enabled.</Notice></>;
  else if (path === '/register') page = <Register />;
  else if (path === '/sign-in') page = <SignIn onSessionChange={refreshSession} />;
  else if (path === '/forgot-password') page = <ForgotPassword />;
  else if (path === '/reset-password') page = <ResetPassword />;
  else if (path === '/challenge') page = <Challenge onSessionChange={refreshSession} />;
  else if (path === '/security') page = requireAccount(session ? <Security key={session.principalId} session={session} onSessionChange={refreshSession} /> : null);
  else if (path === '/workspace') page = requireAccount(<WorkspacePage key={session?.sessionId} storageEnabled={config?.features.storage ?? false} />);
  else if (path === '/files') page = requireAccount(config?.features.storage ? <FileWorkspace key={`${session?.sessionId}:${route}`} /> : <Notice>Protected storage is not configured for this deployment.</Notice>);
  else page = <><PageHeader label="Navigation" title="Page not found" /><a href="/">Return home</a></>;
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><header className="site-header"><a className="brand" href="/" aria-label={`${config?.brand.name ?? 'Live Debate Engine'} Competition workspace home`}><span className="brand-monogram" aria-hidden="true">{config?.brand.monogram ?? 'LD'}</span><span>{config?.brand.name ?? 'Live Debate Engine'}<small>Competition workspace</small></span></a>
    <nav aria-label="Main navigation"><a href="/workspace" aria-current={path === '/workspace' || path === '/files' ? 'page' : undefined}>Workspace</a><a href="/security" aria-current={path === '/security' ? 'page' : undefined}>Account security</a>
      {session ? <Button variant="secondary" busy={signingOut} onClick={() => { setSigningOut(true); setNotice(''); void api('/api/auth/sign-out', { body: {} }).then(async () => { setSession(null); await refreshSession(); navigate('/sign-in'); }).catch((failure) => setNotice(safeError(failure))).finally(() => setSigningOut(false)); }}>Sign out</Button> : <a href="/sign-in" aria-current={path === '/sign-in' ? 'page' : undefined}>Sign in</a>}
    </nav></header><main id="main-content" tabIndex={-1}>{notice && <Notice tone="error" focus>{notice}</Notice>}{!config && error ? <><PageHeader label="Connection" title="Workspace unavailable" /><Notice tone="error">{error}</Notice><Button onClick={() => location.reload()}>Retry connection</Button></> : page}</main>
    <footer className="site-footer"><p>{config?.brand.name ?? 'Live Debate Engine'}</p><p>Powered by Live Debate Engine <span aria-hidden="true">/</span> Development release</p></footer></div>;
}
