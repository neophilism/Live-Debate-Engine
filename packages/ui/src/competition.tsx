import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { anyReference, materialContract, materialRuleset, parseData, type MaterialContract, type MaterialRuleset } from '../../contracts/src/domain.js';
import { MATERIAL_TIME_ZONES } from '../../contracts/src/timezones.js';
import { identifier } from '../../contracts/src/validation.js';
import type { MaterialRecord, RulesetPage, ContractWorkspace } from '../../competition/src/types.js';
import { ActionForm, Button, DataTable, Field, Notice, Panel, StatusBadge } from './components.js';
import { request } from './client.js';
import { readContractWorkspace, readRulesets } from './competition-client.js';

const formText = (form: FormData, name: string) => String(form.get(name) ?? '');
const formNumber = (form: FormData, name: string) => {
  const value = formText(form, name); if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${name}: enter a nonnegative whole number.`);
  const number = Number(value); if (!Number.isSafeInteger(number)) throw new Error(`${name}: the number is too large.`); return number;
};
const ref = (record: MaterialRecord) => {
  const { kind, tenantId, entityId, eventId, snapshotId, revision } = record.snapshot;
  return anyReference({ refType: 'snapshot', kind, tenantId, entityId, eventId, snapshotId, revision });
};
function parameters() {
  const params = new URLSearchParams(window.location.search); const tenantId = identifier('tenant')(params.get('tenant'));
  return { params, tenantId };
}
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Unable to retrieve current material records.'; }
/** An ambiguous network retry keeps the same command key for unchanged intent, in memory only. */
function useCommand() {
  const keys = useRef(new Map<string, string>());
  return useCallback(async (path: string, body: Record<string, unknown>) => {
    const intent = JSON.stringify({ path, body }); let commandId = keys.current.get(intent);
    if (!commandId) { commandId = crypto.randomUUID(); if (keys.current.size >= 16) keys.current.clear(); keys.current.set(intent, commandId); }
    return request(path, { ...body, commandId });
  }, []);
}
function Choice({ label, options, id: supplied, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: readonly (string | { value: string; label: string })[] }) {
  const generated = useId(); const id = supplied ?? generated;
  return <div className="field"><label htmlFor={id}>{label}</label><select {...props} id={id}>{options.map((option) => {
    const value = typeof option === 'string' ? option : option.value; return <option key={value} value={value}>{typeof option === 'string' ? option.replaceAll('-', ' ') : option.label}</option>;
  })}</select></div>;
}
function Reason({ initial }: { initial: string | null }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>Reason for amendment</label><textarea id={id} name="amendmentReason" rows={3} minLength={10} maxLength={1000} defaultValue={initial ?? ''} aria-describedby={`${id}-hint`} /><p id={`${id}-hint`} className="hint">At least 10 characters are required after a version has been published or offered. An amendment requires every speaker to acknowledge the new version.</p></div>;
}
function Whole({ name, label, initial, min = 0, max = 2147483647 }: { name: string; label: string; initial: number; min?: number; max?: number }) {
  return <Field type="number" name={name} label={label} defaultValue={initial} min={min} max={max} step={1} required />;
}
function Title({ children, note }: { children: ReactNode; note: string }) {
  return <div className="page-title"><p className="eyebrow">Competition preparation</p><h1>{children}</h1><p className="lede">{note}</p></div>;
}
function RecordIdentity({ record }: { record: MaterialRecord }) {
  return <p className="material-identity">Revision {record.snapshot.revision} <span className="secret">Snapshot: {record.snapshot.snapshotId}</span><span className="secret">SHA-256: {record.contentHash}</span></p>;
}
const humanLabel = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace('Bps', '(basis points)');
function ReadableValue({ value }: { value: unknown }): ReactNode {
  if (value === null) return <span>Not applicable</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'string' || typeof value === 'number') return <span className="material-value">{String(value)}</span>;
  if (Array.isArray(value)) return <ol className="material-list">{value.map((item, index) => <li key={`${index}-${typeof item}`}><ReadableValue value={item} /></li>)}</ol>;
  if (typeof value === 'object') return <dl className="material-definition">{Object.entries(value).map(([key, entry]) => <div key={key}><dt>{humanLabel(key)}</dt><dd><ReadableValue value={entry} /></dd></div>)}</dl>;
  return <span>Unavailable</span>;
}
function RulesSummary({ rules }: { rules: MaterialRuleset }) {
  return <><p>Only voters with valid ballots in both polls count in the official paired cohort. Undecided votes remain in the denominator. Interim distributions are sealed.</p>
    <DataTable caption="Judging rubric" headings={['Criterion', 'Weight', 'Score bounds']}>{rules.rubric.map((criterion) => <tr key={criterion.code}><th scope="row">{criterion.label}</th><td>{criterion.weightBps / 100}%</td><td>{criterion.minimum} to {criterion.maximum}</td></tr>)}</DataTable>
    <p>Opening: {rules.timing.openingPerSideSeconds} seconds per side. Closing: {rules.timing.closingPerSideSeconds} seconds per side. These are not multiplied by the number of speakers.</p>
    <p>The audience verdict and judges’ verdict are separate. Each is assigned 50% of the stated standard prize budget; this does not verify funding or authorize a payment.</p>
    <details><summary>Read every frozen ruleset field</summary><ReadableValue value={rules} /></details></>;
}
function RulesEditor({ initial, save }: { initial: MaterialRuleset; save: (rules: MaterialRuleset) => Promise<unknown> }) {
  const [criteria, setCriteria] = useState(() => initial.rubric.map((data) => ({ id: crypto.randomUUID(), data })));
  const ruleNumbers = [
    ['timing', 'openingPerSideSeconds', 'Opening seconds per side', 1, 7200], ['timing', 'discussionSeconds', 'Discussion seconds total', 1, 14400],
    ['timing', 'questionsSeconds', 'Audience question seconds total', 1, 14400], ['timing', 'closingPerSideSeconds', 'Closing seconds per side', 1, 7200],
    ['voting', 'preWindowSeconds', 'Pre-debate voting window seconds', 30, 3600], ['voting', 'postWindowSeconds', 'Post-debate voting window seconds', 30, 3600], ['voting', 'remoteDelaySeconds', 'Remote broadcast delay seconds', 0, 600],
    ['judging', 'requiredSeats', 'Required judge seats', 1, 21], ['conduct', 'graceSeconds', 'Speaking grace seconds', 0, 300],
    ['adjustments', 'penaltyMaxPerFinding', 'Maximum penalty points per finding', 0, 10], ['adjustments', 'penaltyTotalCap', 'Total penalty point cap', 0, 100], ['adjustments', 'bonusMaxPerFinding', 'Maximum bonus points per finding', 0, 10], ['adjustments', 'bonusTotalCap', 'Total bonus point cap', 0, 100],
    ['deadlines', 'aiReviewHours', 'AI-review deadline hours', 1, 8760], ['deadlines', 'outcomeDisputeHours', 'Outcome dispute deadline hours', 1, 8760], ['deadlines', 'paymentTargetDays', 'Payment processing target days', 1, 3650], ['deadlines', 'paymentDeadlineDays', 'Payment contractual deadline days', 1, 3650],
  ] as const;
  return <ActionForm submitLabel="Save ruleset draft" action={async (form) => {
    const value = structuredClone(initial) as unknown as Record<string, unknown>;
    value.name = formText(form, 'name'); value.amendmentReason = formText(form, 'amendmentReason').trim() || null;
    for (const [section, key] of ruleNumbers) (value[section] as Record<string, unknown>)[key] = formNumber(form, `${section}.${key}`);
    for (const [section, key] of [['electorate', 'channels'], ['judging', 'aggregation'], ['standardPrize', 'tiePolicy'], ['advancement', 'audienceTie']] as const) (value[section] as Record<string, unknown>)[key] = formText(form, `${section}.${key}`);
    for (const key of ['judgesPrizeAllocation', 'teamPrizeSplit', 'judgesTie']) value[key] = formText(form, key);
    value.rubric = criteria.map(({ id }) => ({ code: formText(form, `${id}.code`), label: formText(form, `${id}.label`), weightBps: formNumber(form, `${id}.weightBps`), minimum: formNumber(form, `${id}.minimum`), maximum: formNumber(form, `${id}.maximum`) }));
    return save(materialRuleset(value));
  }}><Field label="Ruleset name" name="name" defaultValue={initial.name} maxLength={240} required /><Reason initial={initial.amendmentReason} />
    <h3>Rubric</h3><p className="hint">Weights use basis points: 3,000 is 30%. All criteria must add to 10,000 (100%). Codes remain stable within this revision.</p>
    {criteria.map(({ id, data }, index) => <fieldset className="material-group" key={id}><legend>Criterion {index + 1}</legend><div className="two-column"><Field label={`Criterion ${index + 1} code`} name={`${id}.code`} defaultValue={data.code} maxLength={64} pattern="[a-z][a-z0-9-]*" required /><Field label={`Criterion ${index + 1} label`} name={`${id}.label`} defaultValue={data.label} maxLength={120} required /></div><div className="two-column"><Whole label={`Criterion ${index + 1} weight in basis points`} name={`${id}.weightBps`} initial={data.weightBps} min={1} max={10000} /><Whole label={`Criterion ${index + 1} minimum score`} name={`${id}.minimum`} initial={data.minimum} max={10000} /><Whole label={`Criterion ${index + 1} maximum score`} name={`${id}.maximum`} initial={data.maximum} min={1} max={10000} /></div><Button className="secondary" disabled={criteria.length <= 1} onClick={() => setCriteria(criteria.filter((row) => row.id !== id))}>Remove criterion {index + 1}</Button></fieldset>)}
    <Button className="secondary" disabled={criteria.length >= 20} onClick={() => setCriteria([...criteria, { id: crypto.randomUUID(), data: { code: `criterion-${criteria.length + 1}`, label: 'New criterion', weightBps: 1, minimum: 0, maximum: 10 } }])}>Add criterion</Button>
    <h3>Timing, judging and deadlines</h3><div className="two-column">{ruleNumbers.map(([section, key, label, min, max]) => <Whole key={`${section}.${key}`} name={`${section}.${key}`} label={label} initial={Number(initial[section][key as keyof typeof initial[typeof section]])} min={min} max={max} />)}</div>
    <h3>Published policy choices</h3><div className="two-column"><Choice label="In-person and remote electorate channels" name="electorate.channels" defaultValue={initial.electorate.channels} options={['separate', 'combined']} /><Choice label="Judge score aggregation" name="judging.aggregation" defaultValue={initial.judging.aggregation} options={['mean', 'sum', 'majority']} /><Choice label="Audience prize tie policy" name="standardPrize.tiePolicy" defaultValue={initial.standardPrize.tiePolicy} options={['split-share', 'review']} /><Choice label="Advancement after an audience tie" name="advancement.audienceTie" defaultValue={initial.advancement.audienceTie} options={['judges', 'review', 'rematch']} /><Choice label="Judges prize allocation" name="judgesPrizeAllocation" defaultValue={initial.judgesPrizeAllocation} options={['winner-take-all', 'proportional']} /><Choice label="Judges prize tie policy" name="judgesTie" defaultValue={initial.judgesTie} options={['split-share', 'review']} /><Choice label="Team member prize split" name="teamPrizeSplit" defaultValue={initial.teamPrizeSplit} options={['equal', 'unanimous-custom']} /></div>
    <p>Judge mode: {initial.judging.mode}. Only human mode can be published at this milestone. Every configured seat is required; judge weighting is equal.</p><p>Evidence is required for adjustments, with no double counting. No new closing arguments, outside coaching, competitor entry fees or interim vote disclosures are allowed by this profile.</p><p>Saving creates a draft. Publishing and offering an event contract are separate actions.</p>
  </ActionForm>;
}
export function RulesetsPage() {
  const [page, setPage] = useState<RulesetPage | null>(null); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [selected, setSelected] = useState<MaterialRecord | null>(null); const [preview, setPreview] = useState<MaterialRecord | null>(null);
  const freshId = useRef(crypto.randomUUID()); const command = useCommand(); const [reload, setReload] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: An explicit refresh token refetches from the server without unsupported cache-busting query parameters.
  useEffect(() => { let alive = true; setPage(null); setError(''); void (async () => {
    const { params, tenantId } = parameters(); const entity = params.get('ruleset'); if (entity) identifier('entity')(entity);
    const result = await readRulesets(await request(`/api/tenants/${tenantId}/rulesets${entity ? `/${entity}` : ''}${params.has('before') ? `?before=${encodeURIComponent(params.get('before') ?? '')}` : ''}`));
    if (alive) { setPage(result); setSelected(result.current); setPreview(null); }
  })().catch((e: unknown) => { if (alive) setError(errorText(e)); }); return () => { alive = false; }; }, [reload]);
  return <><Title note="Prepare, review and publish immutable versions. Existing event contracts keep their exact referenced ruleset.">Competition rulesets</Title><div className="actions"><Button className="secondary" onClick={() => setReload(reload + 1)}>Refresh rulesets</Button><a href="/workspaces">My workspaces</a></div>{error ? <Notice tone="error" focus>{error}</Notice> : !page ? <Notice>Loading rulesets...</Notice> : <>{message && <Notice tone="success" focus>{message}</Notice>}
    <DataTable caption="Stored ruleset versions" headings={['Name', 'Revision', 'State', 'Open']}>{page.records.map((row) => <tr key={row.snapshot.snapshotId}><th scope="row">{parseData('ruleset', row.snapshot.data).name}</th><td>{row.snapshot.revision}</td><td>{row.published ? 'Published' : 'Draft'}</td><td><a href={`/rulesets?tenant=${row.snapshot.tenantId}&ruleset=${row.snapshot.entityId}`}>Manage {parseData('ruleset', row.snapshot.data).name}</a> <Button className="secondary" onClick={() => setPreview(row)}>Review revision {row.snapshot.revision}</Button></td></tr>)}</DataTable>
    {preview && <Panel title={`Historical ruleset revision ${preview.snapshot.revision}`}><RecordIdentity record={preview} />{'materialVersion' in preview.snapshot.data ? <RulesSummary rules={materialRuleset(preview.snapshot.data)} /> : <ReadableValue value={preview.snapshot.data} />}</Panel>}
    <div className="actions"><a href={`/rulesets?tenant=${parameters().tenantId}`}>All rulesets / create new</a>{selected && page.records.length === 50 && <a href={`/rulesets?tenant=${selected.snapshot.tenantId}&ruleset=${selected.snapshot.entityId}&before=${page.records[49]?.snapshot.revision}`}>Load older ruleset revisions</a>}</div>
    <Panel title={selected ? `Review ruleset revision ${selected.snapshot.revision}` : 'Create a ruleset'}>{selected && <RecordIdentity record={selected} />}
      <RulesEditor key={selected?.snapshot.snapshotId ?? freshId.current} initial={selected && 'materialVersion' in selected.snapshot.data ? materialRuleset({ ...selected.snapshot.data, ...(selected.published ? { amendmentReason: null } : {}) }) : page.profile} save={async (data) => {
        const { tenantId } = parameters(); const entity = selected?.snapshot.entityId ?? freshId.current;
        await command(`/api/tenants/${tenantId}/rulesets/${entity}`, { expectedRevision: selected?.snapshot.revision ?? 0, data });
        window.history.replaceState(null, '', `/rulesets?tenant=${tenantId}&ruleset=${entity}`); setMessage('Ruleset draft saved. Review this revision before publishing.'); setReload((n) => n + 1);
      }} />
    </Panel>{selected && !selected.published && <Panel title="Publish the reviewed revision"><ActionForm submitLabel="Publish ruleset revision" action={async (form) => {
      if (formText(form, 'reviewed') !== 'yes') throw new Error('Confirm review of this exact ruleset revision.');
      await command(`/api/tenants/${selected.snapshot.tenantId}/rulesets/${selected.snapshot.entityId}/publish`, { snapshotId: selected.snapshot.snapshotId }); setMessage('Ruleset revision published. No event contract or participation was authorized.'); setReload((n) => n + 1);
    }}><label className="check"><input type="checkbox" name="reviewed" value="yes" required /> I reviewed all fields of this ruleset revision for publication.</label></ActionForm></Panel>}
    <Panel title="Complete ruleset preview"><RulesSummary rules={selected && 'materialVersion' in selected.snapshot.data ? materialRuleset(selected.snapshot.data) : page.profile} /></Panel>
  </>}</>;
}
function utcValue(form: FormData, name: string, optional = false) {
  const value = formText(form, name); if (!value && optional) return null;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?$/.test(value)) throw new Error('Enter a valid UTC date and time.');
  const date = new Date(`${value}Z`); if (!Number.isFinite(date.getTime())) throw new Error('Enter a valid UTC date and time.'); return date.toISOString();
}
function ContractEditor({ workspace, save }: { workspace: ContractWorkspace; save: (data: MaterialContract) => Promise<unknown> }) {
  const initial = workspace.current ? materialContract(workspace.current.snapshot.data) : null;
  const teams = workspace.choices.filter((row) => row.snapshot.kind === 'team');
  const [forTeam, setForTeam] = useState(initial?.forTeamRef.entityId ?? teams[0]?.snapshot.entityId ?? '');
  const [againstTeam, setAgainstTeam] = useState(initial?.againstTeamRef.entityId ?? teams[1]?.snapshot.entityId ?? '');
  const [publication, setPublication] = useState(initial?.publication ?? 'live');
  const event = workspace.choices.find((row) => row.snapshot.kind === 'event');
  const eventData = event ? parseData('event', event.snapshot.data) : null;
  const rulesRecord = workspace.choices.find((row) => row.snapshot.snapshotId === eventData?.rulesetRef.snapshotId);
  const rules = rulesRecord && 'materialVersion' in rulesRecord.snapshot.data ? materialRuleset(rulesRecord.snapshot.data) : null;
  if (!event || !eventData || !rules || !rulesRecord?.published || rules.judging.mode !== 'human' || teams.length < 2) return <Notice>Preparation prerequisites are missing. The event must reference a published human-judged ruleset, and two current teams must have individually bound debater assignments. Event and participant administration are separate workflows.</Notice>;
  function speakersFor(teamId: string, side: 'for' | 'against') {
    const team = teams.find((row) => row.snapshot.entityId === teamId);
    const members = team ? parseData('team', team.snapshot.data).members : [];
    return members.map((member, index) => {
      const participant = workspace.choices.find((row) => row.snapshot.kind === 'participant' && row.snapshot.entityId === member.entityId);
      const principal = workspace.participantLinks.find((link) => link.entityId === member.entityId)?.principalId;
      const assignment = workspace.choices.find((row) => row.snapshot.kind === 'assignment' && row.snapshot.data.principalId === principal && row.snapshot.data.teamRef?.snapshotId === team?.snapshot.snapshotId);
      const prior = initial?.speakers.find((s) => s.participantRef.entityId === member.entityId && s.side === side);
      const allocate = (total: number) => Math.floor(total / members.length) + (index < total % members.length ? 1 : 0);
      return { participant, assignment, label: `${side === 'for' ? 'For' : 'Against'} speaker ${index + 1}`, field: `${side}-${member.entityId}`, side, order: prior?.order ?? index + 1, opening: prior?.openingSeconds ?? allocate(rules?.timing.openingPerSideSeconds ?? 0), closing: prior?.closingSeconds ?? allocate(rules?.timing.closingPerSideSeconds ?? 0), share: prior?.prizeShareBps ?? allocate(10000) };
    });
  }
  const speakers = [...speakersFor(forTeam, 'for'), ...speakersFor(againstTeam, 'against')];
  const options = teams.map((row) => ({ value: row.snapshot.entityId, label: parseData('team', row.snapshot.data).name }));
  return <ActionForm submitLabel="Save contract draft" action={async (form) => {
    const forRecord = teams.find((row) => row.snapshot.entityId === forTeam); const againstRecord = teams.find((row) => row.snapshot.entityId === againstTeam);
    if (!forRecord || !againstRecord || forTeam === againstTeam) throw new Error('Choose two different current teams.');
    const data = materialContract({ materialVersion: 2, eventRef: ref(event), motionRef: eventData.motionRef, rulesetRef: eventData.rulesetRef,
      forTeamRef: ref(forRecord), againstTeamRef: ref(againstRecord), startsAt: utcValue(form, 'startsAt'), acknowledgmentDeadline: utcValue(form, 'acknowledgmentDeadline'),
      timeZone: formText(form, 'timeZone'), publication, embargoUntil: publication === 'embargoed' ? utcValue(form, 'embargoUntil') : null,
      prizeBudget: { currency: formText(form, 'currency'), minorUnits: formText(form, 'minorUnits'), exponent: formNumber(form, 'exponent') },
      amendmentReason: formText(form, 'amendmentReason').trim() || null,
      speakers: speakers.map((speaker) => {
        if (!speaker.participant || !speaker.assignment) throw new Error(`${speaker.label} needs a current individual assignment before this contract can be saved.`);
        return { participantRef: ref(speaker.participant), assignmentRef: ref(speaker.assignment), side: speaker.side, order: formNumber(form, `${speaker.field}.order`), openingSeconds: formNumber(form, `${speaker.field}.opening`), closingSeconds: formNumber(form, `${speaker.field}.closing`), prizeShareBps: rules.teamPrizeSplit === 'equal' ? null : formNumber(form, `${speaker.field}.share`) };
      }),
    }); return save(data);
  }}><p>Event: {eventData.title}. Ruleset: {rules.name}, revision {rulesRecord.snapshot.revision}.</p><div className="two-column"><Choice label="For team" name="forTeam" value={forTeam} onChange={(e) => setForTeam(e.target.value)} options={options} required /><Choice label="Against team" name="againstTeam" value={againstTeam} onChange={(e) => setAgainstTeam(e.target.value)} options={options} required /></div>
    <h3>Every speaker has an individual allocation</h3><p className="hint">New teams start with an equal suggested allocation. Review it explicitly. Each side must total {rules.timing.openingPerSideSeconds} opening seconds and {rules.timing.closingPerSideSeconds} closing seconds.</p>
    {speakers.map((speaker) => <fieldset className="material-group" key={`${speaker.field}-${speaker.assignment?.snapshot.snapshotId}`}><legend>{speaker.label}</legend><p>Participant: {speaker.participant?.snapshot.entityId ?? 'Unavailable'}</p>{!speaker.assignment && <Notice tone="error">The current participant-to-assignment binding is missing.</Notice>}<div className="two-column"><Whole label={`${speaker.label} speaking order`} name={`${speaker.field}.order`} initial={speaker.order} min={1} max={8} /><Whole label={`${speaker.label} opening seconds`} name={`${speaker.field}.opening`} initial={speaker.opening} max={7200} /><Whole label={`${speaker.label} closing seconds`} name={`${speaker.field}.closing`} initial={speaker.closing} max={7200} />{rules.teamPrizeSplit === 'unanimous-custom' && <Whole label={`${speaker.label} prize share basis points`} name={`${speaker.field}.share`} initial={speaker.share} min={1} max={10000} />}</div></fieldset>)}
    <h3>Schedule and publication</h3><p className="hint">Enter all clock times in UTC. The display time zone is saved separately; it never silently changes the instant entered.</p><div className="two-column"><Field label="Start time (UTC)" name="startsAt" type="datetime-local" step="0.001" defaultValue={initial?.startsAt.slice(0, -1) ?? ''} required /><Field label="Acknowledgment deadline (UTC)" name="acknowledgmentDeadline" type="datetime-local" step="0.001" defaultValue={initial?.acknowledgmentDeadline.slice(0, -1) ?? ''} required /><Choice label="Display time zone" name="timeZone" defaultValue={initial?.timeZone ?? 'UTC'} options={MATERIAL_TIME_ZONES} /><Choice label="Event publication policy" name="publication" value={publication} onChange={(e) => setPublication(e.target.value === 'embargoed' ? 'embargoed' : 'live')} options={['live', 'embargoed']} />{publication === 'embargoed' && <Field label="Embargo ends (UTC)" name="embargoUntil" type="datetime-local" step="0.001" defaultValue={initial?.embargoUntil?.slice(0, -1) ?? ''} required />}</div>
    <h3>Stated prize budget, not funding approval</h3><div className="two-column"><Field label="Currency code" name="currency" defaultValue={initial?.prizeBudget.currency ?? 'USD'} pattern="[A-Z]{3}" minLength={3} maxLength={3} required /><Field label="Budget in minor units" name="minorUnits" defaultValue={initial?.prizeBudget.minorUnits ?? '0'} inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={19} required hint="For USD with exponent 2, 100 minor units means one dollar. No funds move here." /><Whole label="Currency exponent" name="exponent" initial={initial?.prizeBudget.exponent ?? 2} max={6} /></div>
    <Reason initial={workspace.current?.published ? null : initial?.amendmentReason ?? null} /><p>Saving does not offer these terms to speakers. Review the full frozen version and use the separate offer action.</p>
  </ActionForm>;
}
function contractRoute() { const { params, tenantId } = parameters(); const eventId = identifier('event')(params.get('event')); return { params, tenantId, eventId, path: `/api/tenants/${tenantId}/events/${eventId}/contract`, page: `/contract?tenant=${tenantId}&event=${eventId}` }; }
export function ContractPage() {
  const [workspace, setWorkspace] = useState<ContractWorkspace | null>(null); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [reload, setReload] = useState(0); const command = useCommand();
  // biome-ignore lint/correctness/useExhaustiveDependencies: An explicit refresh token refetches from the server without unsupported cache-busting query parameters.
  useEffect(() => { let alive = true; setWorkspace(null); setError(''); void (async () => {
    const { path, params } = contractRoute(); const query = new URLSearchParams();
    for (const key of ['snapshot', 'before']) { const value = params.get(key); if (value) query.set(key, value); }
    const data = await readContractWorkspace(await request(`${path}${query.size ? `?${query}` : ''}`)); if (alive) setWorkspace(data);
  })().catch((e: unknown) => { if (alive) setError(errorText(e)); }); return () => { alive = false; }; }, [reload]);
  const record = workspace?.current; const data = record ? materialContract(record.snapshot.data) : null;
  return <><Title note="Review the exact motion, rules, speaking allocations and deadlines. Acknowledgment is personal and applies only to the displayed version.">Event competition contract</Title>
    <div className="actions"><Button className="secondary" onClick={() => setReload(reload + 1)}>Refresh contract</Button><a href="/workspaces">My workspaces</a></div>
    {error ? <Notice tone="error" focus>{error}</Notice> : !workspace ? <Notice>Loading current contract...</Notice> : <>{message && <Notice tone="success" focus>{message}</Notice>}
      <Panel title="Material acceptance status"><StatusBadge label={workspace.status.materialReady ? 'Material terms accepted' : workspace.status.basisCurrent ? 'Acknowledgments incomplete' : record ? 'Review or amendment required' : 'No offered terms'} tone={workspace.status.materialReady ? 'good' : 'warning'} /><p>{workspace.status.acknowledgments} of {workspace.status.requiredAcknowledgments} individual acknowledgments for the latest version.</p><p>Material acceptance does not open registration, certify eligibility, confirm legal releases, qualify AI, verify staffing or prove prize funding. No real competition or financial operation is authorized.</p>{workspace.pendingAmendment && <Notice>A draft is pending. Previously accepted terms do not establish current readiness.</Notice>}{workspace.viewingHistory && <Notice>You are reading a historical version. <a href={contractRoute().page}>Return to the current contract.</a></Notice>}</Panel>
      {record && data ? <><Panel title={`Frozen contract revision ${record.snapshot.revision}`}><RecordIdentity record={record} /><p>{record.published ? 'Offered to participants' : 'Organizer-only draft'}{record.invalidated ? ' - invalidated by a changed material basis or assignment.' : '.'}</p>{workspace.details && <><h3>Motion</h3><p className="motion-text">{workspace.details.motion.text}</p><h3>Referenced ruleset</h3><RulesSummary rules={workspace.details.ruleset} /></>}<h3>Speaking allocations</h3><DataTable caption="Individual speaking allocations" headings={['Side', 'Participant', 'Order', 'Opening seconds', 'Closing seconds', 'Prize share']}>{data.speakers.map((speaker) => <tr key={speaker.participantRef.entityId}><th scope="row">{speaker.side}</th><td className="material-value">{speaker.participantRef.entityId}</td><td>{speaker.order}</td><td>{speaker.openingSeconds}</td><td>{speaker.closingSeconds}</td><td>{speaker.prizeShareBps === null ? 'Equal per team' : `${speaker.prizeShareBps / 100}%`}</td></tr>)}</DataTable><p>Start: <time dateTime={data.startsAt}>{data.startsAt}</time> (UTC). Display zone: {data.timeZone}.</p><p>Individual acknowledgments close at <time dateTime={data.acknowledgmentDeadline}>{data.acknowledgmentDeadline}</time> (UTC).</p><p>Publication: {data.publication}{data.embargoUntil ? ` until ${data.embargoUntil}` : ''}.</p>{data.amendmentReason && <p><strong>Amendment reason:</strong> {data.amendmentReason}</p>}<details><summary>Read every frozen contract field and reference</summary><ReadableValue value={data} /></details></Panel>
        {!workspace.viewingHistory && workspace.canAcknowledge && workspace.status.acknowledgmentOpen && !workspace.ownAcknowledgment && <Panel title="Your individual acknowledgment"><ActionForm submitLabel="Acknowledge this contract revision" action={async (form) => {
          if (formText(form, 'accepted') !== 'yes') throw new Error('Personally confirm this exact contract before submitting.');
          await command(`${contractRoute().path}/acknowledge`, { snapshotId: record.snapshot.snapshotId, contentHash: record.contentHash, accepted: true }); setMessage('Your individual acknowledgment was recorded for this version. No teammate was acknowledged on your behalf.'); setReload((n) => n + 1);
        }}><label className="check"><input type="checkbox" name="accepted" value="yes" required /> I personally acknowledge the motion, referenced rules, allocations, publication policy, budget and deadlines of revision {record.snapshot.revision}, with the SHA-256 digest shown above.</label></ActionForm></Panel>}
        {!workspace.viewingHistory && workspace.ownAcknowledgment && <Notice tone="success">You acknowledged the latest contract revision. A subsequent amendment requires a new personal acknowledgment.</Notice>}
        {!workspace.viewingHistory && workspace.canManage && !record.published && !record.invalidated && <Panel title="Offer the reviewed contract"><ActionForm submitLabel="Offer contract to participants" action={async (form) => {
          if (formText(form, 'reviewed') !== 'yes') throw new Error('Confirm review before offering the contract.');
          await command(`${contractRoute().path}/offer`, { snapshotId: record.snapshot.snapshotId }); setMessage('This contract revision was offered. Each assigned speaker must acknowledge individually.'); setReload((n) => n + 1);
        }}><label className="check"><input type="checkbox" name="reviewed" value="yes" required /> I reviewed this exact version and intend to offer these terms to its assigned participants.</label></ActionForm></Panel>}
      </> : <Notice>No contract version is available to your account. Drafts are visible only to authorized organizers.</Notice>}
      {!workspace.viewingHistory && workspace.canManage && <Panel title={record ? 'Create the next contract revision' : 'Prepare a contract'}><ContractEditor key={record?.snapshot.snapshotId ?? 'new'} workspace={workspace} save={async (value) => {
        await command(contractRoute().path, { expectedRevision: record?.snapshot.revision ?? 0, data: value }); setMessage('Contract draft saved. Review its frozen contents before offering.'); setReload((n) => n + 1);
      }} /></Panel>}
      <DataTable caption="Preserved contract history" headings={['Revision', 'Recorded', 'State', 'Review']}>{workspace.history.map((row) => <tr key={row.snapshot.snapshotId}><th scope="row">{row.snapshot.revision}</th><td>{row.snapshot.recordedAt}</td><td>{row.accepted ? 'Accepted historically' : row.published ? 'Offered' : 'Draft'}{row.invalidated ? '; invalidated' : ''}</td><td><a href={`${contractRoute().page}&snapshot=${row.snapshot.snapshotId}`}>Review revision {row.snapshot.revision}</a></td></tr>)}</DataTable>
      {workspace.history.length === 50 && <a href={`${contractRoute().page}&before=${workspace.history[49]?.snapshot.revision}`}>Load older contract revisions</a>}
    </>}
  </>;
}
