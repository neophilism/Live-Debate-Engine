import { useEffect, useId, useRef, useState, type ReactNode, type InputHTMLAttributes, type ButtonHTMLAttributes, type FormEvent } from 'react';
import type { Brand } from './branding.js';

export function Button({ children, type = 'button', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type={type} className={`button ${className}`}>{children}</button>;
}
export function Field({ label, hint, id: supplied, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string | undefined }) {
  const generated = useId(); const id = supplied ?? generated;
  return <div className="field"><label htmlFor={id}>{label}</label><input {...props} id={id} aria-describedby={hint ? `${id}-hint` : undefined} />{hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}</div>;
}
export function Notice({ children, tone = 'info', focus = false }: { children: ReactNode; tone?: 'info' | 'success' | 'error'; focus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus) ref.current?.focus(); }, [focus]);
  return <div ref={ref} tabIndex={focus ? -1 : undefined} className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}
export function Panel({ title, children, eyebrow }: { title: string; children: ReactNode; eyebrow?: string }) {
  const id = useId();
  return <section className="panel" aria-labelledby={id}>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={id}>{title}</h2>{children}</section>;
}
export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warning' }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" aria-hidden="true" />{label}</span>;
}
export function DataTable({ caption, headings, children }: { caption: string; headings: readonly string[]; children: ReactNode }) {
  // biome-ignore lint/a11y/noNoninteractiveTabindex: A named horizontally scrollable table region must support keyboard scrolling.
  return <section className="table-scroll" aria-label={caption} tabIndex={0}><table><caption>{caption}</caption><thead><tr>{headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></section>;
}
/** Presentation only; E14 supplies an authoritative event clock. Never decrement locally. */
export function TimerDisplay({ remainingSeconds, paused = false }: { remainingSeconds: number; paused?: boolean }) {
  if (!Number.isSafeInteger(remainingSeconds) || remainingSeconds < 0 || remainingSeconds > 86400) throw new Error('Invalid remaining time');
  const label = paused ? 'Paused' : remainingSeconds === 0 ? 'Time has expired' : remainingSeconds <= 30 ? 'Thirty seconds or less remaining' : remainingSeconds <= 60 ? 'One minute or less remaining' : 'Time remaining';
  const formatted = `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`;
  return <div className={`timer ${remainingSeconds <= 30 ? 'timer-warning' : ''}`}><p>{label}</p><output role="timer" aria-live="off" aria-label={`${remainingSeconds} seconds remaining${paused ? ', paused' : ''}`}>{formatted}</output></div>;
}
export function ActionForm({ children, submitLabel, action }: { children: ReactNode; submitLabel: string; action: (data: FormData) => Promise<unknown> }) {
  const [pending, setPending] = useState(false); const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const busy = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    const form = event.currentTarget; const data = new FormData(form); busy.current = true; setPending(true); setNotice(null);
    try { const message = await action(data); if (mounted.current) { form.reset(); if (typeof message === 'string' && message) setNotice({ text: message, error: false }); } }
    catch (error) { if (mounted.current) setNotice({ text: error instanceof Error ? error.message : 'The request could not be completed. Please try again.', error: true }); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  return <form onSubmit={(event) => { void submit(event); }} aria-busy={pending}>{notice && <Notice key={notice.text} tone={notice.error ? 'error' : 'success'} focus>{notice.text}</Notice>}<fieldset disabled={pending}>{children}<Button type="submit">{pending ? 'Working...' : submitLabel}</Button></fieldset></form>;
}
export function AppShell({ brand, path, signedIn, children }: { brand: Brand; path: string; signedIn: boolean; children: ReactNode }) {
  const links = signedIn ? [{ href: '/app', label: 'Overview' }, { href: '/workspaces', label: 'My workspaces' }, { href: '/security', label: 'Account security' }] : [{ href: '/', label: 'Welcome' }, { href: '/sign-in', label: 'Sign in' }, { href: '/register', label: 'Create account' }];
  return <div className="app-shell" data-theme={brand.id}><a className="skip-link" href="#main">Skip to main content</a><aside className="sidebar"><a className="brand" href={signedIn ? '/app' : '/'}><span className="brand-mark" aria-hidden="true">{brand.shortName}</span><span>{brand.name}<small>Debate workspace</small></span></a><p className="nav-label">Your workspace</p><nav aria-label="Main navigation">{links.map((link) => <a key={link.href} href={link.href} aria-current={path === link.href ? 'page' : undefined}>{link.label}<span aria-hidden="true">{path === link.href ? '\u2192' : ''}</span></a>)}</nav><div className="sidebar-note"><span className="eyebrow">Powered by</span><p>Live Debate Engine</p><small>Reusable competition infrastructure.<br />Reference brand, not a live event.</small></div></aside><div className="main-shell"><header className="topbar"><span>Ideas in focus. Fairness by design.</span><StatusBadge label="Development preview" /></header><main id="main" tabIndex={-1}>{children}</main><footer>{brand.name} &middot; {brand.tagline}<br /><small>No live competition or prize funding is represented in this preview.</small></footer></div></div>;
}
