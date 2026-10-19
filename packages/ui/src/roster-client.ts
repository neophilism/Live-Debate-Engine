import { canonicalJson } from '../../contracts/src/canonical-json.js';
import { identifier } from '../../contracts/src/validation.js';

/** Draft-only transport. Responses never confer live role or event access. */
export class RosterDraftClient {
  constructor(private readonly fetcher: typeof fetch, private readonly origin = '') {}
  private path(tenant: string, event: string) {
    return `${this.origin}/api/tenants/${identifier('tenant')(tenant)}/events/${identifier('event')(event)}/roster`;
  }
  private async request(path: string, method: 'GET' | 'POST', data?: unknown): Promise<Record<string, unknown>> {
    const response = await this.fetcher(path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(data) : undefined,
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Roster operation unavailable (${response.status})`);
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        (value as Record<string, unknown>).operational !== false) {
      throw new Error('Roster response did not preserve draft-only semantics');
    }
    return value as Record<string, unknown>;
  }
  workspace(tenant: string, event: string, before?: string) {
    const path = this.path(tenant, event);
    return this.request(before ? `${path}?before=${identifier('principal')(before)}` : path, 'GET');
  }
  review(tenant: string, event: string, candidate: string, command: RosterDraftCommand, data: unknown, expectedRevision: number) {
    return this.request(`${this.path(tenant, event)}/reviews/${identifier('principal')(candidate)}`, 'POST',
      { commandId: command.commandId, expectedRevision, data });
  }
  saveDraft(tenant: string, event: string, command: RosterDraftCommand, entries: unknown, expectedRevision: number) {
    return this.request(`${this.path(tenant, event)}/draft`, 'POST',
      { commandId: command.commandId, expectedRevision, entries });
  }
}
export type RosterDraftCommand = Readonly<{ key: string; commandId: string }>;
/** Retain the same command on transport uncertainty; change it for changed intent. */
export function rosterDraftCommand(previous: RosterDraftCommand | null, path: string, intent: unknown): RosterDraftCommand {
  const key = canonicalJson({ path, intent });
  return previous?.key === key ? previous : { key, commandId: crypto.randomUUID() };
}
