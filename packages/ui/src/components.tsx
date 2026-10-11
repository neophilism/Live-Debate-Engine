import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export function Button({ children, busy = false, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'quiet' }) {
  return <button type="button" {...props} className={`button button-${variant} ${props.className ?? ''}`} disabled={props.disabled || busy} aria-busy={busy || undefined}>{busy ? 'Working...' : children}</button>;
}
export function Field({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generated = useId(); const id = props.id ?? generated;
  return <div className="field"><label htmlFor={id}>{label}</label><input {...props} id={id} aria-invalid={!!error || undefined} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} />
    {hint && <small id={`${id}-hint`} className="field-hint">{hint}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}
export function Notice({ children, tone = 'info', focus = false }: { children: ReactNode; tone?: 'info' | 'success' | 'error'; focus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus) ref.current?.focus(); }, [focus]);
  return <div ref={ref} tabIndex={focus ? -1 : undefined} className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}
export function PageHeader({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return <header className="page-header"><p className="eyebrow">{label}</p><h1 tabIndex={-1} id="page-title">{title}</h1>{children && <div className="page-intro">{children}</div>}</header>;
}
export function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  const id = useId(); return <section className={`card ${className}`} aria-labelledby={id}><h2 id={id}>{title}</h2>{children}</section>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><h2>{title}</h2><div>{children}</div></div>;
}
export function Status({ state }: { state: 'quarantined' | 'released' | 'rejected' | 'revoked' | 'active' | 'pending' }) {
  const labels = { quarantined: 'Awaiting safety check', released: 'Available', rejected: 'Rejected', revoked: 'Access revoked', active: 'Active', pending: 'Not yet verified' };
  return <span className={`status status-${state}`}><span aria-hidden="true" className="status-dot" />{labels[state]}</span>;
}
export function DataTable({ caption, headings, children }: { caption: string; headings: readonly string[]; children: ReactNode }) {
  return <div className="table-scroll"><table><caption>{caption}</caption><thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export function ConfirmDialog({ title, children, confirm, onConfirm, onCancel, busy = false }: { title: string; children: ReactNode; confirm: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { if (dialog?.open) dialog.close(); }; }, []);
  return <dialog ref={ref} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}><h2 id={id}>{title}</h2><div className="dialog-content">{children}</div><div className="actions"><Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button><Button variant="danger" onClick={onConfirm} busy={busy}>{confirm}</Button></div></dialog>;
}
export function readableDate(value: string): string {
  const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable';
}
