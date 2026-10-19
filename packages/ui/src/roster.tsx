import { useEffect, useRef, useState } from 'react';
import { ActionForm, Button, Field, Notice, Panel } from './components.js';
import { RosterDraftClient, rosterDraftCommand, type RosterDraftCommand } from './roster-client.js';
import { identifier } from '../../contracts/src/validation.js';
const client = new RosterDraftClient(fetch.bind(globalThis));
const field = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
export function RosterPage() {
  const query = new URLSearchParams(window.location.search);
  const tenant = query.get('tenant') ?? '', event = query.get('event') ?? '';
  const [workspace, setWorkspace] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState(''); const [stale, setStale] = useState(false);
  const intent = useRef<RosterDraftCommand | null>(null);
  const reload = async () => {
    try { setWorkspace(await client.workspace(tenant, event)); setError(''); setStale(false); }
    catch { setStale(true); setError('Roster unavailable. Check organizer access.'); }
  };
  useEffect(() => { if (tenant && event) void reload(); }, [tenant, event]);
  if (!tenant || !event) return <Notice tone="error">Choose a tenant and event from an authorized workspace.</Notice>;
  const draft = workspace?.draft && typeof workspace.draft === 'object' ? workspace.draft as Record<string, unknown> : null;
  const revision = typeof draft?.revision === 'number' ? draft.revision : 0;
  return <div className="administration"><h1>Provisional casting roster</h1>
    <Notice>No role is activated here. Final assignments require fresh independent authorization and conflict checks.</Notice>
    {error && <Notice tone="error">{error}</Notice>}
    <Button onClick={() => { intent.current = null; void reload(); }}>Refresh reviews and drafts</Button>
    {workspace && <>
    <Panel title="Review a candidate"><ActionForm submitLabel="Record review" action={async data => {
      if (stale) throw new Error('Refresh stale reviews first.');
      const candidate = identifier('principal')(field(data, 'candidate'));
      const reviews = Array.isArray(workspace.reviews) ? workspace.reviews as Record<string, unknown>[] : [];
      const current = reviews.find(r => r.candidate_id === candidate);
      const expectedRevision = typeof current?.revision === 'number' ? current.revision : 0;
      const body = { eligible: data.get('eligible') === 'yes', available: data.get('available') === 'yes', conflictClear: data.get('conflictClear') === 'yes', expiresAt: new Date(field(data, 'expiry')).toISOString(), reason: field(data, 'reason') };
      const cmd = rosterDraftCommand(null, candidate, { expectedRevision, body });
      try { await client.review(tenant, event, candidate, cmd, body, expectedRevision); } catch (e) { setStale(true); throw e; }
      await reload(); return 'Review recorded without granting a role.';
    }}>
      <Field label="Candidate principal UUID" name="candidate" required />
      <label className="checkbox"><input type="checkbox" name="eligible" value="yes" /> Eligibility confirmed</label>
      <label className="checkbox"><input type="checkbox" name="available" value="yes" /> Available</label>
      <label className="checkbox"><input type="checkbox" name="conflictClear" value="yes" /> Conflict cleared</label>
      <Field label="Expiry timestamp (ISO 8601)" name="expiry" required />
      <Field label="Review reason" name="reason" required minLength={10} maxLength={2000} />
    </ActionForm></Panel>
    <Panel title="Save a reviewed draft"><p>Current revision: {revision}. Each JSON entry requires principalId, role, teamId, side, and position. This only saves a proposal.</p>
      <fieldset disabled={stale}><ActionForm submitLabel="Save draft (not active)" action={async data => {
        const entries: unknown = JSON.parse(field(data, 'entries'));
        if (!Array.isArray(entries)) throw new Error('Expected an array.');
        const command = rosterDraftCommand(intent.current, 'draft', { tenant, event, revision, entries }); intent.current = command;
        try { await client.saveDraft(tenant, event, command, entries, revision); } catch (e) { setStale(true); throw e; }
        intent.current = null; await reload(); return 'Provisional roster saved.';
      }}><label className="field">Roster JSON<textarea name="entries" rows={8} required defaultValue={draft?.entries ? JSON.stringify(draft.entries, null, 2) : '[]'} /></label></ActionForm></fieldset>
    </Panel>
    <Panel title="Current review ledger"><pre>{JSON.stringify(workspace.reviews ?? [], null, 2)}</pre></Panel>
    </>}</div>;
}
