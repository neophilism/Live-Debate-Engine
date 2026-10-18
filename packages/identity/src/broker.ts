import type { Pool, PoolClient } from 'pg';
import { ACTIONS, type Action } from '../../contracts/src/access.js';
import { identifier } from '../../contracts/src/validation.js';

export class AccessError extends Error {
  constructor(readonly status: 401 | 403) { super(status === 401 ? 'Authentication required' : 'Access denied'); this.name = 'AccessError'; }
}
export type Actor = Readonly<{ principalId: string; kind: 'human' | 'service'; sessionId: string | null; epoch: number; mfaVerifiedAt: string | null }>;
export type AccessScope = Readonly<{ tenantId: string; eventId: string | null; ownerPrincipalId?: string | null }>;
type ActorRow = { principal_id: string; kind: 'human' | 'service'; session_id: string | null; epoch: number; mfa_at: Date | null };

/** Must run at startup. Membership in a base role is not permission to own protected tables. */
export async function assertDatabaseRole(pool: Pool, kind: 'runtime' | 'identity'): Promise<void> {
  const result = await pool.query<{ safe: boolean }>(`SELECT NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb
    AND pg_has_role(current_user,$1,'USAGE') AND NOT pg_has_role(current_user,'lde_guard','MEMBER')
    AND NOT pg_has_role(current_user,$2,'MEMBER')
    AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('lde','lde_auth','lde_security','engine_meta','lde_storage','lde_competition','lde_casting') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS safe
    FROM pg_roles r WHERE r.rolname=current_user`, [kind === 'runtime' ? 'lde_runtime' : 'lde_identity', kind === 'runtime' ? 'lde_identity' : 'lde_runtime']);
  if (result.rows[0]?.safe !== true) throw new Error('Unsafe database role for identity or competition runtime');
}

/**
 * Internal credential broker. Credential is a live provider-session secret or scoped worker
 * secret, never an asserted principal/role. The database revalidates it on each RLS statement.
 * Callbacks and scope ownership are trusted application code, never request/model programs.
 */
export async function withCredential<T>(pool: Pool, credential: string, operation: (client: PoolClient, actor: Actor) => Promise<T>): Promise<T> {
  if (typeof credential !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(credential)) throw new AccessError(401);
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='15s'");
    await client.query("SELECT set_config('lde.credential',$1,true)", [credential]);
    const result = await client.query<ActorRow>('SELECT principal_id,kind,session_id,epoch,mfa_at FROM lde_security.current_actor()');
    const row = result.rows[0];
    if (!row) throw new AccessError(401);
    const actor: Actor = Object.freeze({ principalId: row.principal_id, kind: row.kind, sessionId: row.session_id, epoch: row.epoch, mfaVerifiedAt: row.mfa_at?.toISOString() ?? null });
    const value = await operation(client, actor);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}

export async function requireAccess(client: PoolClient, action: Action, scope: AccessScope): Promise<void> {
  if (!ACTIONS.includes(action)) throw new AccessError(403);
  const tenant = identifier('tenant')(scope.tenantId);
  const event = scope.eventId === null ? null : identifier('event')(scope.eventId);
  const owner = scope.ownerPrincipalId == null ? null : identifier('principal')(scope.ownerPrincipalId);
  const result = await client.query<{ allowed: boolean }>('SELECT lde_security.has_access($1,$2,$3,$4) AS allowed', [action, tenant, event, owner]);
  if (result.rows[0]?.allowed !== true) throw new AccessError(403);
}

export function withAuthorizedCredential<T>(pool: Pool, credential: string, action: Action, scope: AccessScope, operation: (client: PoolClient, actor: Actor) => Promise<T>): Promise<T> {
  return withCredential(pool, credential, async (client, actor) => {
    await requireAccess(client, action, scope);
    return operation(client, actor);
  });
}

/** Shared adapter for workers and realtime dispatch: fresh DB authorization on every use. */
export function withWorkerCredential<T>(pool: Pool, authorization: string, action: Action, scope: AccessScope, operation: (client: PoolClient, actor: Actor) => Promise<T>): Promise<T> {
  if (!/^Bearer svc_[A-Za-z0-9_-]{43}$/.test(authorization)) throw new AccessError(401);
  return withAuthorizedCredential(pool, authorization.slice(7), action, scope, async (client, actor) => {
    if (actor.kind !== 'service') throw new AccessError(403);
    return operation(client, actor);
  });
}

