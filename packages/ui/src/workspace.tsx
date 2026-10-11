import { useCallback, useEffect, useId, useState } from 'react';
import { api, downloadFile, safeError } from './api.js';
import { Button, Card, ConfirmDialog, DataTable, EmptyState, Notice, PageHeader, Status, readableDate } from './components.js';
import { purposeLabels, type Workspace, type FileRecord, type ObjectPurpose, type Page } from './types.js';

const scopeLink = (item: Workspace, page = 'files') => `/${page}?tenant=${encodeURIComponent(item.tenantId)}&event=${encodeURIComponent(item.eventId)}`;
export function WorkspacePage({ storageEnabled }: { storageEnabled: boolean }) {
  const [items, setItems] = useState<readonly Workspace[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(true);
  const load = useCallback(async (after: string | null = null, signal?: AbortSignal) => {
    setBusy(true); setError('');
    try { const value = await api<Page<Workspace>>(`/api/workspaces${after ? `?after=${encodeURIComponent(after)}` : ''}`, signal ? { signal } : {});
      if (!signal?.aborted) { setItems((prior) => after ? [...prior, ...value.items] : value.items); setCursor(value.nextCursor); }
    } catch (failure) { if (!signal?.aborted) { setItems([]); setError(safeError(failure)); } } finally { if (!signal?.aborted) setBusy(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(null, controller.signal); return () => controller.abort(); }, [load]);
  return <><PageHeader label="Your workspace" title="Ready for a considered exchange"><p>Your current event permissions determine what appears here. Creating an account alone does not grant participation.</p></PageHeader>
    <div className="section-heading"><h2>Your events</h2><Button variant="secondary" busy={busy} onClick={() => void load()}>Refresh events</Button></div>
    {error && <Notice tone="error" focus>{error}</Notice>}{busy && !items.length && <Notice>Loading authorized events...</Notice>}
    {!busy && !items.length && !error && <EmptyState title="No accessible events yet"><p>Ask your organizer to assign you to an event. Staff assignments also require a recent authenticator check.</p><a href="/security" className="button button-secondary">Review account security</a></EmptyState>}
    <div className="event-grid">{items.map((item) => <Card key={`${item.tenantId}:${item.eventId}`} title={item.title}>
      <p className="eyebrow">{item.mode.replaceAll('-', ' ')} / {item.format}</p>
      <p>Account access and protected preparation files are available. Live competition controls will appear as their workflows are completed.</p>
      <details className="help"><summary>Your current permissions</summary><ul className="permission-list">{item.capabilities.map((action) => <li key={action}>{action.replaceAll('.', ': ').replaceAll('-', ' ')}</li>)}</ul><p className="muted">Permissions do not bypass event rules, eligibility, or release gates.</p></details>
      {storageEnabled ? <a className="button button-primary" href={scopeLink(item)}>Open preparation files</a> : <p className="muted">Protected storage is not configured for this deployment.</p>}
    </Card>)}</div>{cursor && <Button variant="secondary" busy={busy} onClick={() => void load(cursor)}>Load more events</Button>}
  </>;
}
export function FileWorkspace() {
  const search = new URLSearchParams(location.search); const tenant = search.get('tenant') ?? ''; const event = search.get('event') ?? '';
  const [workspace, setWorkspace] = useState<Workspace | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    if (![tenant, event].every((value) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value))) { setError('Choose an event from your workspace.'); return () => controller.abort(); }
    void api<{ capabilities: Workspace['capabilities'] }>(`/api/tenants/${tenant}/events/${event}/access`, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setWorkspace({ tenantId: tenant, eventId: event, title: 'Event preparation', format: '', mode: '', capabilities: value.capabilities });
    }).catch((failure) => { if (!controller.signal.aborted) setError(safeError(failure)); });
    return () => controller.abort();
  }, [tenant, event]);
  return <><PageHeader label="Workspace / Preparation" title="Protected preparation files"><p>Documents stay private to their assigned purpose and permissions. Uploads await a safety check before they can be downloaded.</p></PageHeader>
    <p><a href="/workspace">Back to your events</a></p>{error ? <Notice tone="error" focus>{error}</Notice> : workspace ? <FileManager key={`${tenant}:${event}`} workspace={workspace} /> : <Notice>Checking event access...</Notice>}
  </>;
}
function FileManager({ workspace }: { workspace: Workspace }) {
  const { tenantId, eventId } = workspace; const prefix = `/api/tenants/${tenantId}/events/${eventId}/objects`;
  const selectId = useId(); const fileId = useId();
  const [purpose, setPurpose] = useState<ObjectPurpose>('identity-document'); const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<readonly FileRecord[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [pending, setPending] = useState<FileRecord | null>(null);
  const purposes: ObjectPurpose[] = ['identity-document', 'finance-document'];
  if (workspace.capabilities.includes('scorecard.write-own')) purposes.push('judge-note');
  if (workspace.capabilities.includes('media.control')) purposes.push('production-asset');
  const load = useCallback(async (after: string | null = null, signal?: AbortSignal) => {
    setLoading(true);
    try { const value = await api<Page<FileRecord>>(`${prefix}${after ? `?after=${encodeURIComponent(after)}` : ''}`, signal ? { signal } : {});
      if (!signal?.aborted) { setRows((prior) => after ? [...prior, ...value.items] : value.items); setCursor(value.nextCursor); }
    } catch (failure) { if (!signal?.aborted) { setRows([]); setError(safeError(failure)); } } finally { if (!signal?.aborted) setLoading(false); }
  }, [prefix]);
  useEffect(() => { const controller = new AbortController(); void load(null, controller.signal); return () => controller.abort(); }, [load]);
  return <><div className="two-column file-preparation"><Card title="Add a protected document"><form onSubmit={async (submit) => {
    submit.preventDefault(); if (!file) { setError('Choose a document before uploading.'); return; }
    if (!file.size || file.size > 1048576 || !['text/plain', 'application/json', 'application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) { setError('Choose a nonempty PDF, PNG, JPEG, plain text, or JSON file no larger than 1 MiB.'); return; }
    const form = submit.currentTarget; setBusy(true); setError(''); setMessage('');
    try { await api(`${prefix}/${purpose}`, { raw: file }); form.reset(); setFile(null); setPurpose('identity-document'); setMessage('Document accepted into quarantine. A safety check is required before download.'); await load(); }
    catch (failure) { setError(safeError(failure)); } finally { setBusy(false); }
  }}><div className="field"><label htmlFor={selectId}>Document purpose</label><select id={selectId} value={purpose} onChange={(change) => setPurpose(change.target.value as ObjectPurpose)}>{purposes.map((value) => <option key={value} value={value}>{purposeLabels[value]}</option>)}</select></div>
    <div className="field"><label htmlFor={fileId}>Choose a document</label><input id={fileId} type="file" required accept="text/plain,application/json,application/pdf,image/png,image/jpeg" onChange={(change) => setFile(change.target.files?.[0] ?? null)} aria-describedby={`${fileId}-hint`} /><small id={`${fileId}-hint`}>PDF, PNG, JPEG, text, or JSON. Maximum 1 MiB. Full debate recordings use a separate media workflow.</small></div><Button type="submit" busy={busy}>Upload document</Button>
  </form></Card><Card title="Who can access these files?"><p><strong>Identity documents:</strong> only your account.</p><p><strong>Financial documents:</strong> your account and authorized event finance staff.</p><p><strong>Judging notes:</strong> the owning judge, after an authenticator check.</p><p><strong>Production assets:</strong> authorized event producers.</p><p className="muted">The application and the configured safety scanner process file contents. This is not secrecy from those processing services.</p></Card></div>
    {error && <Notice tone="error" focus>{error}</Notice>}{message && <Notice tone="success" focus>{message}</Notice>}
    <Card title="Accessible files"><div className="section-heading"><p>File contents are never included in this list.</p><Button variant="secondary" busy={loading} onClick={() => { setError(''); void load(); }}>Refresh files</Button></div>
      {!rows.length ? <p className="muted">{loading ? 'Loading files...' : 'No accessible files in this event.'}</p> : <DataTable caption="Protected event documents" headings={['Document', 'Added', 'Size', 'Status', 'Actions']}>
        {rows.map((row) => <tr key={row.id}><th scope="row">{purposeLabels[row.purpose]}<small className="muted block">{row.id.slice(-8)}</small></th><td>{readableDate(row.createdAt)}</td><td>{Math.ceil(row.byteLength / 1024)} KiB</td><td><Status state={row.state} /></td><td><div className="row-actions"><Button variant="quiet" disabled={row.state !== 'released' || busy} aria-label={`Download ${purposeLabels[row.purpose]} ${row.id.slice(-8)}`} onClick={() => {
          setBusy(true); setError(''); void downloadFile(tenantId, row.id).then(() => setMessage('Download started.')).catch((failure) => setError(safeError(failure))).finally(() => setBusy(false));
        }}>Download</Button>{row.canRevoke && row.state !== 'revoked' && <Button variant="quiet" onClick={() => setPending(row)} disabled={busy} aria-label={`Revoke ${purposeLabels[row.purpose]} ${row.id.slice(-8)}`}>Revoke access</Button>}</div></td></tr>)}
      </DataTable>}{cursor && <Button variant="secondary" busy={loading} onClick={() => void load(cursor)}>Load more files</Button>}
    </Card>{pending && <ConfirmDialog title="Revoke file access?" confirm="Revoke access" busy={busy} onCancel={() => setPending(null)} onConfirm={() => {
      setBusy(true); setError(''); void api(`/api/tenants/${tenantId}/objects/${pending.id}/revoke`, { body: {} }).then(async () => { setPending(null); setMessage('File access revoked. Existing downloaded copies cannot be recalled.'); await load(); }).catch((failure) => setError(safeError(failure))).finally(() => setBusy(false));
    }}><p>This invalidates future downloads. It does not delete retained records or copies already downloaded.</p></ConfirmDialog>}
  </>;
}
