import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ROLES } from '../../contracts/src/domain.js';
import { ACTIONS, describeAccessPolicy, SERVICE_PROFILES } from '../../contracts/src/access.js';
import { array, enumeration, identifier, nullable, object, refine, text, timestamp } from '../../contracts/src/validation.js';

const scope = { principalId: identifier('principal'), tenantId: identifier('tenant') };
const reason = text(10, 500);
const membership = object({ ...scope, status: enumeration(['active', 'suspended', 'revoked'] as const), expiresAt: nullable(timestamp), reason });
const role = object({ ...scope, eventId: nullable(identifier('event')), role: enumeration(ROLES), expiresAt: nullable(timestamp), revoked: enumeration(['yes', 'no'] as const), reason });
const principal = object({ principalId: identifier('principal'), status: enumeration(['active', 'disabled'] as const), reason });
const service = object({ ...scope, eventId: identifier('event'), profile: enumeration(SERVICE_PROFILES), actions: refine(array(enumeration(ACTIONS), 1, ACTIONS.length), (values) => new Set(values).size === values.length, 'Duplicate actions'), expiresAt: timestamp, reason });
const revoke = object({ credentialId: identifier('credential'), reason });
export type AdministrativeAction = 'membership' | 'role' | 'principal' | 'issue-service' | 'revoke-service';

/** Operator-only release credential. Never import this into request handlers. */
export async function administerAccess(pool: Pool, action: AdministrativeAction, raw: unknown): Promise<Readonly<{ credential?: string; credentialId?: string }>> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s'");
    const authority = await client.query<{ owner: boolean }>("SELECT pg_has_role(current_user,c.relowner,'USAGE') AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='lde_security' AND c.relname='principals'");
    if (authority.rows[0]?.owner !== true) throw new Error('Operator credential required');
    let principalId: string | null = null; let tenantId: string | null = null; let eventId: string | null = null; let why: string;
    let result: Readonly<{ credential?: string; credentialId?: string }> = {};
    if (action === 'membership') {
      const value = membership(raw); principalId = value.principalId; tenantId = value.tenantId; why = value.reason;
      await client.query('INSERT INTO lde_security.memberships(tenant_id,principal_id,status,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,principal_id) DO UPDATE SET status=excluded.status,expires_at=excluded.expires_at', [tenantId, principalId, value.status, value.expiresAt]);
    } else if (action === 'role') {
      const value = role(raw); principalId = value.principalId; tenantId = value.tenantId; eventId = value.eventId; why = value.reason;
      if (eventId === null && value.role !== 'organizer') throw new Error('Only organizer is tenant scoped');
      const eligible = await client.query("SELECT 1 FROM lde_security.principals p JOIN lde_auth.\"user\" u ON u.id=p.provider_user_id WHERE p.id=$1 AND p.kind='human' AND p.status='active' AND u.\"emailVerified\"=true", [principalId]);
      if (!eligible.rowCount) throw new Error('Verified active human required');
      await client.query('INSERT INTO lde_security.role_grants(id,tenant_id,principal_id,event_id,role,expires_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7::boolean THEN now() ELSE NULL END) ON CONFLICT(tenant_id,principal_id,event_id,role) DO UPDATE SET expires_at=excluded.expires_at,revoked_at=excluded.revoked_at', [randomUUID(), tenantId, principalId, eventId, value.role, value.expiresAt, value.revoked === 'yes']);
    } else if (action === 'principal') {
      const value = principal(raw); principalId = value.principalId; why = value.reason;
      const rows = await client.query<{ provider_user_id: string | null }>('UPDATE lde_security.principals SET status=$1,epoch=epoch+1 WHERE id=$2 RETURNING provider_user_id', [value.status, principalId]);
      if (!rows.rowCount) throw new Error('Unknown principal');
      await client.query('DELETE FROM lde_auth.session WHERE "userId"=$1', [rows.rows[0]?.provider_user_id]);
      await client.query('UPDATE lde_security.service_credentials SET revoked_at=now() WHERE principal_id=$1', [principalId]);
    } else if (action === 'issue-service') {
      const value = service(raw); principalId = value.principalId; tenantId = value.tenantId; eventId = value.eventId; why = value.reason;
      const allowed = describeAccessPolicy();
      if (value.actions.some((item) => !allowed[item].services.includes(value.profile))) throw new Error('Action exceeds service profile');
      const secret = `svc_${randomBytes(32).toString('base64url')}`; const credentialId = randomUUID();
      await client.query("INSERT INTO lde_security.principals(id,kind) VALUES($1,'service') ON CONFLICT(id) DO NOTHING", [principalId]);
      const current = await client.query<{ epoch: number }>("SELECT epoch FROM lde_security.principals WHERE id=$1 AND kind='service' AND status='active' FOR UPDATE", [principalId]);
      if (!current.rows[0]) throw new Error('Active service identity required');
      await client.query('INSERT INTO lde_security.memberships(tenant_id,principal_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [tenantId, principalId]);
      const member = await client.query("SELECT 1 FROM lde_security.memberships WHERE principal_id=$1 AND tenant_id=$2 AND status='active' AND valid_from<=now() AND (expires_at IS NULL OR expires_at>now())", [principalId, tenantId]);
      if (!member.rowCount) throw new Error('Active service membership required');
      await client.query('INSERT INTO lde_security.service_credentials(id,secret_digest,principal_id,tenant_id,event_id,epoch,profile,actions,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [credentialId, createHash('sha256').update(secret).digest(), principalId, tenantId, eventId, current.rows[0].epoch, value.profile, value.actions, value.expiresAt]);
      result = { credential: secret, credentialId };
    } else if (action === 'revoke-service') {
      const value = revoke(raw); why = value.reason;
      const rows = await client.query<{ principal_id: string; tenant_id: string; event_id: string }>('UPDATE lde_security.service_credentials SET revoked_at=now() WHERE id=$1 RETURNING principal_id,tenant_id,event_id', [value.credentialId]);
      if (!rows.rows[0]) throw new Error('Unknown credential');
      principalId = rows.rows[0].principal_id; tenantId = rows.rows[0].tenant_id; eventId = rows.rows[0].event_id;
    } else throw new Error('Unknown administrative action');
    await client.query('INSERT INTO lde_security.administrative_audit(actor,action,principal_id,tenant_id,event_id,reason) VALUES(session_user,$1,$2,$3,$4,$5)', [action, principalId, tenantId, eventId, why]);
    await client.query('COMMIT');
    return Object.freeze(result);
  } catch (error) { try { await client.query('ROLLBACK'); } catch { discard = true; } throw error; }
  finally { client.release(discard); }
}
