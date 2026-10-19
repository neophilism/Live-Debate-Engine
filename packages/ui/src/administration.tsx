import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { EventAdministration, MotionRevision, Series } from '../../competition/src/administration.js';
import { identifier } from '../../contracts/src/validation.js';
import { ActionForm, Button, Field, Notice, Panel, StatusBadge } from './components.js';
import { request, RequestError } from './client.js';
import { administrationCommand, readAdministrationPage, readAdministrationRecord, type AdministrationKind, type AdministrationPage as Page, type AdministrationRecord as Row } from './administration-client.js';
const string = (value: unknown) => typeof value === 'string' ? value : '';
const field = (data: FormData, name: string) => string(data.get(name)).normalize('NFC').trim();
const categories = (data: FormData) => field(data, 'categories').split(',').map(v => v.trim()).filter(Boolean);
const collection = (kind: AdministrationKind) => kind === 'series' ? 'series' : kind === 'motion' ? 'motions' : 'events';
const title = (row: Row) => string(row.snapshot.data.name ?? row.snapshot.data.wording ?? row.snapshot.data.title);
function Select({ label, name, children, value, onChange, defaultValue = '', required = true }: { label: string; name: string; children: ReactNode; value?: string; onChange?: (value: string) => void; defaultValue?: string; required?: boolean }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} name={name} required={required} {...(value === undefined ? { defaultValue } : { value })} onChange={e => onChange?.(e.target.value)}>{children}</select></div>;
}
function TextArea({ label, name, value, maxLength, minLength = 1 }: { label: string; name: string; value: string; maxLength: number; minLength?: number }) {
  const id = useId(); return <div className="field"><label htmlFor={id}>{label}</label><textarea id={id} name={name} defaultValue={value} maxLength={maxLength} minLength={minLength} required rows={4} /></div>;
}
function MotionFields({ data }: { data: Record<string, unknown> }) {
  return <><TextArea label="Motion wording" name="wording" value={string(data.wording)} maxLength={2000} /><TextArea label="Motion description" name="description" value={string(data.description)} maxLength={10000} /><Field label="Categories, separated by commas" name="categories" defaultValue={Array.isArray(data.categories) ? data.categories.join(', ') : ''} required maxLength={970} hint="Choose 1–12 unique categories, each up to 80 characters." /></>;
}
function AdministrationEditor({ tenant, kind, selected, series, motions, stale, mutate }: {
  tenant: string; kind: AdministrationKind; selected: Row | null; series: readonly Row[]; motions: readonly Row[]; stale: boolean;
  mutate: (path: string, body: Record<string, unknown>, resultKind: AdministrationKind) => Promise<void>;
}) {
  const [newId] = useState(() => crypto.randomUUID());
  const data = selected?.snapshot.data ?? {}; const id = selected?.snapshot.entityId ?? newId; const revision = selected?.snapshot.revision ?? 0;
  const [seriesId, setSeriesId] = useState(string(data.seriesId));
  const published = data.state === 'published';
  const path = `/api/tenants/${tenant}/administration/${collection(kind)}/${id}`;
  const motion = motions.find(row => row.snapshot.entityId === data.motionId && row.snapshot.revision === data.motionRevision);
  const writable = !stale && (!published || kind === 'series');
  const save = async (form: FormData) => {
    let input: Record<string, unknown>;
    if (kind === 'series') input = { name: field(form, 'name'), season: field(form, 'season'), startsOn: field(form, 'startsOn'), endsOn: field(form, 'endsOn') };
    else if (kind === 'motion') input = { seriesId: field(form, 'seriesId'), wording: field(form, 'wording'), description: field(form, 'description'), categories: categories(form) };
    else {
      const bound = motions.find(row => row.snapshot.entityId === field(form, 'motionId'));
      if (!bound || bound.snapshot.data.state !== 'published' || bound.snapshot.data.seriesId !== field(form, 'seriesId')) throw new Error('Choose a currently published motion in this series. Load more motions if needed.');
      input = { seriesId: field(form, 'seriesId'), motionId: bound.snapshot.entityId, motionRevision: bound.snapshot.revision, title: field(form, 'title'), venue: field(form, 'venue'), broadcastMode: field(form, 'broadcastMode') };
    }
    await mutate(path, { expectedRevision: revision, data: input }, kind);
    return 'Saved. The verified server revision is shown above.';
  };
  return <Panel title={selected ? `Review ${kind} · revision ${revision}` : `Create ${kind}`}>
    {kind === 'event' && <Notice>Publishing or amending an event requires an explicit organizer or producer assignment for that event. Creating it does not grant that permission.</Notice>}{selected && <><p>{title(selected)}</p><StatusBadge label={string(data.state) || 'Recorded'} /><p className="hint">Recorded {selected.snapshot.recordedAt}. Changes require current server permission and a fresh staff authenticator challenge.</p></>}
    {published && <Notice>Published wording and event details cannot be edited as drafts. Use the explicit motion amendment below for a published event.</Notice>}
    <fieldset disabled={!writable} className="administration-editor"><ActionForm submitLabel={selected ? 'Save new revision' : `Create ${kind}`} action={save}>
      {kind === 'series' ? <><Field label="Series name" name="name" defaultValue={string(data.name)} required maxLength={200} /><Field label="Season" name="season" defaultValue={string(data.season)} required maxLength={120} /><Field label="Series starts on" name="startsOn" type="date" defaultValue={string(data.startsOn)} required /><Field label="Series ends on" name="endsOn" type="date" defaultValue={string(data.endsOn)} required /></> : <>
        <Select label="Series" name="seriesId" value={seriesId} onChange={setSeriesId}><option value="">Select a series</option>{series.map(row => <option key={row.snapshot.entityId} value={row.snapshot.entityId}>{title(row)}</option>)}</Select>
        {kind === 'motion' ? <MotionFields data={data} /> : <>
          <Select label="Published motion" name="motionId" defaultValue={string(data.motionId)}><option value="">Select a published motion</option>{motions.filter(row => row.snapshot.data.seriesId === seriesId && row.snapshot.data.state === 'published').map(row => <option key={row.snapshot.entityId} value={row.snapshot.entityId}>{title(row)} · revision {row.snapshot.revision}</option>)}</Select>
          <Field label="Event title" name="title" defaultValue={string(data.title)} required maxLength={240} /><Field label="Venue" name="venue" defaultValue={string(data.venue)} required maxLength={500} />
          <Select label="Broadcast mode" name="broadcastMode" defaultValue={string(data.broadcastMode) || 'none'}>{['none', 'private-stream', 'public-stream', 'prerecorded'].map(mode => <option key={mode} value={mode}>{mode.split('-').join(' ')}</option>)}</Select>
        </>}
      </>}
    </ActionForm></fieldset>
    {selected && data.state === 'draft' && !stale && <ActionForm submitLabel={`Publish ${kind}`} action={async form => {
      if (form.get('confirm') !== 'yes') throw new Error('Confirm publication after reviewing the exact revision.');
      await mutate(`${path}/publish`, { expectedRevision: revision }, kind); return 'Published. Publication does not open registration or establish event readiness.';
    }}><label className="checkbox"><input type="checkbox" name="confirm" value="yes" required />I reviewed revision {revision} and want to publish it.</label></ActionForm>}
    {kind === 'event' && published && <>{!motion ? <Notice>Load the event’s exact motion revision in the motion list before preparing an amendment.</Notice> : <fieldset disabled={stale}><ActionForm submitLabel="Record published motion amendment" action={async form => {
      if (form.get('confirm') !== 'yes') throw new Error('Confirm the amendment after reviewing the prior and replacement wording.');
      await mutate(`${path}/amend/${motion.snapshot.entityId}`, { expectedMotionRevision: motion.snapshot.revision, expectedEventRevision: revision, data: { wording: field(form, 'wording'), description: field(form, 'description'), categories: categories(form), reason: field(form, 'reason') } }, 'event');
      return 'The motion and event references were amended atomically.';
    }}><h3>Amend published motion</h3><p>Previous wording: <strong>{string(motion.snapshot.data.wording)}</strong></p><MotionFields data={motion.snapshot.data} /><TextArea label="Reason for the amendment" name="reason" value="" minLength={10} maxLength={2000} /><label className="checkbox"><input type="checkbox" name="confirm" value="yes" required />I reviewed the prior and replacement wording and want to record this amendment.</label></ActionForm></fieldset>}</>}
  </Panel>;
}
export function AdministrationPage() {
  const [tenant] = useState(() => new URL(window.location.href).searchParams.get('tenant') ?? '');
  const [pages, setPages] = useState<Record<AdministrationKind, Page> | null>(null); const [kind, setKind] = useState<AdministrationKind>('series');
  const [selected, setSelected] = useState<Row | null>(null); const [error, setError] = useState(''); const [stale, setStale] = useState(false);
  const [history, setHistory] = useState<Page | null>(null); const [historyError, setHistoryError] = useState(''); const [historyPending, setHistoryPending] = useState(false);
  const pageEpoch = useRef(0); const morePending = useRef(new Set<AdministrationKind>()); const [paginationPending, setPaginationPending] = useState<AdministrationKind | null>(null);
  const intent = useRef<{ key: string; commandId: string } | null>(null); const historyTarget = useRef(''); const mounted = useRef(true);
  const base = `/api/tenants/${tenant}/administration/`;
  const load = useCallback(async () => {
    identifier('tenant')(tenant); const epoch = ++pageEpoch.current;
    const result = await Promise.all((['series', 'motion', 'event'] as const).map(async k => [k, await readAdministrationPage(await request(`${base}${collection(k)}`), tenant, k)] as const));
    if (mounted.current && pageEpoch.current === epoch) { setPages(Object.fromEntries(result) as Record<AdministrationKind, Page>); setError(''); }
  }, [tenant, base]);
  useEffect(() => { mounted.current = true; void load().catch(e => { if (mounted.current) setError(e instanceof Error ? e.message : 'Administration is unavailable.'); }); return () => { mounted.current = false; }; }, [load]);
  const mutate = async (path: string, body: Record<string, unknown>, resultKind: AdministrationKind) => {
    if (stale) throw new Error('Refresh and review the current server revisions first.');
    const command = administrationCommand(intent.current, path, body); intent.current = command;
    let result: Record<string, unknown>;
    try { result = await request(path, { ...body, commandId: command.commandId }); }
    catch (e) { if (e instanceof RequestError && e.status === 409) { setStale(true); intent.current = null; } throw e; }
    const row = await readAdministrationRecord(result.current ?? result.event, tenant, resultKind);
    intent.current = null; setSelected(row); setHistory(null); historyTarget.current = '';
    // A failed refresh does not turn a committed write into an implied failed write.
    try { await load(); } catch { setError('The write was confirmed, but the list could not refresh. Refresh the current records before continuing.'); setStale(true); }
  };
  const choose = (k: AdministrationKind, row: Row | null) => { setKind(k); setSelected(row); setHistory(null); setHistoryError(''); historyTarget.current = ''; intent.current = null; };
  const loadMore = async (k: AdministrationKind) => {
    const cursor = pages?.[k].nextCursor; if (!cursor || morePending.current.has(k)) return;
    const epoch = pageEpoch.current; morePending.current.add(k); setPaginationPending(k);
    try {
      const page = await readAdministrationPage(await request(`${base}${collection(k)}?before=${cursor}`), tenant, k);
      if (mounted.current && pageEpoch.current === epoch) setPages(old => old ? { ...old, [k]: { ...page, records: [...old[k].records, ...page.records.filter(row => !old[k].records.some(existing => existing.snapshot.entityId === row.snapshot.entityId))] } } : old);
    } catch (e) { if (mounted.current && pageEpoch.current === epoch) setError(e instanceof Error ? e.message : 'The next page is unavailable.'); }
    finally { morePending.current.delete(k); if (mounted.current) setPaginationPending(null); }
  };
  const readHistory = async (before?: number) => {
    if (!selected || historyPending) return;
    const target = `${kind}:${selected.snapshot.entityId}`; historyTarget.current = target; setHistoryPending(true); setHistoryError('');
    try {
      const page = await readAdministrationPage(await request(`${base}${collection(kind)}?entity=${selected.snapshot.entityId}${before ? `&beforeRevision=${before}` : ''}`), tenant, kind);
      if (mounted.current && historyTarget.current === target) setHistory(old => ({ ...page, records: before && old ? [...old.records, ...page.records] : page.records }));
    } catch (e) { if (mounted.current && historyTarget.current === target) setHistoryError(e instanceof Error ? e.message : 'History is unavailable.'); }
    finally { if (mounted.current) setHistoryPending(false); }
  };
  if (!pages) return <><h1>Series, motions, and events</h1>{error ? <Notice tone="error">{error}<br /><Button onClick={() => { void load().catch(e => setError(String(e.message))); }}>Retry administration</Button></Notice> : <Notice>Checking organizer access...</Notice>}</>;
  return <div className="administration"><div className="page-title"><p className="eyebrow">Organizer workspace</p><h1>Series, motions, and events</h1><p>Publication does not establish registration, funding, or competition readiness. Published wording requires a recorded amendment.</p></div>
    {error && <Notice tone="error">{error}</Notice>}{stale && <Notice tone="error">The server revision changed or a refresh failed. Your unsaved fields remain below. Refresh, review the latest records, and choose the item again before submitting.</Notice>}
    <div className="actions"><Button className="secondary" onClick={() => { void load().then(() => { setStale(false); setSelected(null); setHistory(null); intent.current = null; }).catch(e => setError(String(e.message))); }}>Refresh current records</Button><a href={`/workspace?tenant=${tenant}`}>Back to workspace</a></div>
    <div className="two-column"><Panel title="Administration records">{(['series', 'motion', 'event'] as const).map(k => <section key={k} aria-label={`${collection(k)} records`}><h3>{collection(k)}</h3><Button onClick={() => choose(k, null)}>New {k}</Button>{pages[k].records.length === 0 && <p>No {collection(k)} recorded.</p>}<ul>{pages[k].records.map(row => <li key={row.snapshot.entityId}><Button className="secondary" onClick={() => choose(k, row)}>{title(row)} · revision {row.snapshot.revision} · {string(row.snapshot.data.state) || 'recorded'}</Button></li>)}</ul>{pages[k].nextCursor && <Button disabled={paginationPending === k} onClick={() => { void loadMore(k); }}>Load more {collection(k)}</Button>}</section>)}</Panel>
      <AdministrationEditor key={`${kind}:${selected?.snapshot.snapshotId ?? 'new'}`} tenant={tenant} kind={kind} selected={selected} series={pages.series.records} motions={pages.motion.records} stale={stale} mutate={mutate} /></div>
    {selected && kind === 'event' && <Panel title="Casting proposals"><p>Roster assignments remain provisional until eligibility and conflict checks are revalidated.</p><a className="button secondary" href={`/roster?tenant=${tenant}&event=${selected.snapshot.entityId}`}>Review casting roster</a></Panel>}
    {selected && <Panel title="Revision history"><Button disabled={historyPending} onClick={() => { void readHistory(); }}>{historyPending ? 'Loading history...' : 'Load revision history'}</Button>{historyError && <Notice tone="error">{historyError}</Notice>}{history && <ol>{history.records.map(row => <li key={row.snapshot.snapshotId}><h3>Revision {row.snapshot.revision} · {string(row.snapshot.data.state) || 'recorded'}</h3><p>{title(row)}</p><p>{row.snapshot.recordedAt}</p>{row.snapshot.data.amendment !== null && typeof row.snapshot.data.amendment === 'object' && <p>Amendment reason: {string((row.snapshot.data.amendment as Record<string, unknown>).reason)}</p>}</li>)}</ol>}{history?.nextRevision && <Button disabled={historyPending} onClick={() => { void readHistory(history.nextRevision ?? undefined); }}>Older revisions</Button>}</Panel>}
  </div>;
}
/** Read-only presentation remains available to embedding applications. */
export function AdministrationOverview({ series, motions, events }: { series: readonly Series[]; motions: readonly MotionRevision[]; events: readonly EventAdministration[] }) {
  return <section aria-label="Series and event administration"><h2>Series, motions, and events</h2><p>Publication does not establish registration, funding, or event readiness.</p>{series.map(item => <section key={item.id} aria-label={item.name}><h3>{item.name}</h3><p>Season {item.season} | {item.startsOn} to {item.endsOn}</p><h4>Motions</h4><ul>{motions.filter(m => m.seriesId === item.id && m.tenantId === item.tenantId).map(m => <li key={m.motionId}>{m.wording} | Revision {m.revision} | {m.state}</li>)}</ul><h4>Events</h4><ul>{events.filter(e => e.seriesId === item.id && e.tenantId === item.tenantId).map(e => <li key={e.id}>{e.title} | {e.venue} | {e.broadcastMode} | {e.state} | Motion revision {e.motionRevision}</li>)}</ul></section>)}</section>;
}

