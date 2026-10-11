import { ROLES } from './domain.js';
import { array, enumeration, identifier, integer, nullable, object, refine, timestamp, type Parsed } from './validation.js';

/** A policy decision is not authentication, a credential, or an executable capability. */
export const ACCESS_POLICY_VERSION = 'lde-access-v1';
export const STAFF_MFA_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const SENSITIVE_MFA_MAX_AGE_MS = 15 * 60 * 1000;
export const ACTIONS = Object.freeze([
  'tenant.manage', 'event.read', 'event.manage', 'session.control', 'timer.control',
  'media.control', 'question.submit', 'question.moderate', 'ballot.cast-own',
  'scorecard.read-own', 'scorecard.write-own', 'result.verify', 'result.publish',
  'prize.manage', 'payout.approve', 'dispute.review', 'ballot.read-sealed',
  'tally.write', 'transcript.append', 'payout.execute',
] as const);
export type Action = typeof ACTIONS[number];
export type Role = typeof ROLES[number];
export const SERVICE_PROFILES = Object.freeze(['transcription-worker', 'tally-worker', 'payout-worker'] as const);
export type ServiceProfile = typeof SERVICE_PROFILES[number];

const actorKind = enumeration(['human', 'service'] as const);
const principalParser = object({
  id: identifier('principal'), kind: actorKind,
  status: enumeration(['active', 'disabled'] as const), epoch: integer(1),
});
const sessionParser = refine(object({
  id: identifier('session'), principalId: identifier('principal'), kind: actorKind,
  principalEpoch: integer(1), authenticatedAt: timestamp, expiresAt: timestamp,
  revokedAt: nullable(timestamp), assurance: enumeration(['single-factor', 'mfa', 'service'] as const),
  mfaVerifiedAt: nullable(timestamp),
}), (session) => session.expiresAt > session.authenticatedAt
  && (session.kind === 'service' ? session.assurance === 'service' && session.mfaVerifiedAt === null
    : session.assurance !== 'service' && (session.assurance === 'mfa'
      ? session.mfaVerifiedAt !== null && session.mfaVerifiedAt >= session.authenticatedAt && session.mfaVerifiedAt < session.expiresAt
      : session.mfaVerifiedAt === null)), 'Invalid session assurance or lifetime');
const membershipParser = object({
  tenantId: identifier('tenant'), principalId: identifier('principal'),
  status: enumeration(['active', 'suspended', 'revoked'] as const),
  validFrom: timestamp, expiresAt: nullable(timestamp),
});
const grantFields = {
  tenantId: identifier('tenant'), principalId: identifier('principal'), eventId: nullable(identifier('event')),
  validFrom: timestamp, expiresAt: nullable(timestamp), revokedAt: nullable(timestamp),
};
const roleGrantParser = object({ ...grantFields, role: enumeration(ROLES) });
const serviceGrantParser = object({
  ...grantFields, profile: enumeration(SERVICE_PROFILES), actions: array(enumeration(ACTIONS), 1, ACTIONS.length),
});
const requestParser = object({
  action: enumeration(ACTIONS), tenantId: identifier('tenant'), eventId: nullable(identifier('event')),
  ownerPrincipalId: nullable(identifier('principal')),
});
const inputParser = object({
  principal: principalParser, session: sessionParser, membership: membershipParser,
  roleGrants: array(roleGrantParser, 0, 100), serviceGrants: array(serviceGrantParser, 0, 100),
  request: requestParser,
});
export type AccessInput = Parsed<typeof inputParser>;
export type AccessRequest = Parsed<typeof requestParser>;
export type PrincipalRecord = Parsed<typeof principalParser>;
export type SessionEvidence = Parsed<typeof sessionParser>;
export type RoleGrant = Parsed<typeof roleGrantParser>;
export type ServiceGrant = Parsed<typeof serviceGrantParser>;

type Rule = Readonly<{
  scope: 'tenant' | 'event'; roles: readonly Role[]; services: readonly ServiceProfile[];
  ownership: boolean; sensitive: boolean;
}>;
function rule(scope: Rule['scope'], roles: readonly Role[], services: readonly ServiceProfile[] = [], ownership = false, sensitive = false): Rule {
  return Object.freeze({ scope, roles: Object.freeze([...roles]), services: Object.freeze([...services]), ownership, sensitive });
}
const rules: Readonly<Record<Action, Rule>> = Object.freeze({
  'tenant.manage': rule('tenant', ['organizer'], [], false, true),
  'event.read': rule('event', ROLES),
  'event.manage': rule('event', ['organizer', 'producer']),
  'session.control': rule('event', ['moderator']),
  'timer.control': rule('event', ['moderator', 'timekeeper']),
  'media.control': rule('event', ['producer']),
  'question.submit': rule('event', ['audience']),
  'question.moderate': rule('event', ['moderator', 'producer']),
  'ballot.cast-own': rule('event', ['audience'], [], true),
  'scorecard.read-own': rule('event', ['judge'], [], true),
  'scorecard.write-own': rule('event', ['judge'], [], true),
  'result.verify': rule('event', ['producer', 'oversight'], [], false, true),
  'result.publish': rule('event', ['producer'], [], false, true),
  'prize.manage': rule('event', ['finance']),
  'payout.approve': rule('event', ['finance'], [], false, true),
  'dispute.review': rule('event', ['oversight'], [], false, true),
  // Sensitive processing is delegated explicitly, never implied by human admin status.
  'ballot.read-sealed': rule('event', [], ['tally-worker']),
  'tally.write': rule('event', [], ['tally-worker']),
  'transcript.append': rule('event', [], ['transcription-worker']),
  'payout.execute': rule('event', [], ['payout-worker']),
});
export function describeAccessPolicy() { return rules; }
const nonStaff = new Set<Role>(['audience', 'debater']);
export type Denial = 'invalid-input' | 'identity-mismatch' | 'inactive-session' | 'inactive-membership'
  | 'scope-mismatch' | 'owner-mismatch' | 'missing-grant' | 'mfa-required';
export type AccessDecision = Readonly<{ allowed: true; policyVersion: typeof ACCESS_POLICY_VERSION }>
  | Readonly<{ allowed: false; reason: Denial; policyVersion: typeof ACCESS_POLICY_VERSION }>;
const deny = (reason: Denial): AccessDecision => Object.freeze({ allowed: false, reason, policyVersion: ACCESS_POLICY_VERSION });

function activeWindow(from: string, until: string | null, now: number): boolean {
  return Date.parse(from) <= now && (until === null || (until > from && now < Date.parse(until)));
}

/**
 * Pure preflight policy over CURRENT trusted server records. Never pass client-supplied
 * identity, grants, owner IDs, assurance, or time here. Re-read revocation/membership
 * inside the operation transaction; the returned boolean must not cross a trust boundary.
 * Workflow/ballot eligibility, publication, dual verification and funding gates are separate.
 */
export function evaluateAccess(raw: unknown, now: number): AccessDecision {
  if (!Number.isSafeInteger(now) || now < 0) return deny('invalid-input');
  let input: AccessInput;
  try { input = inputParser(raw); } catch { return deny('invalid-input'); }
  const { principal, session, membership, roleGrants, serviceGrants, request } = input;
  if (session.principalId !== principal.id || session.kind !== principal.kind || session.principalEpoch !== principal.epoch
    || membership.principalId !== principal.id) return deny('identity-mismatch');
  if (principal.status !== 'active' || session.revokedAt !== null
    || !activeWindow(session.authenticatedAt, session.expiresAt, now)) return deny('inactive-session');
  if (membership.tenantId !== request.tenantId || membership.status !== 'active'
    || !activeWindow(membership.validFrom, membership.expiresAt, now)) return deny('inactive-membership');
  const selected = rules[request.action];
  if ((selected.scope === 'tenant') !== (request.eventId === null)) return deny('scope-mismatch');
  if (selected.ownership && request.ownerPrincipalId !== principal.id) return deny('owner-mismatch');
  const matches = (grant: RoleGrant | ServiceGrant) => grant.principalId === principal.id
    && grant.tenantId === request.tenantId && grant.eventId === request.eventId
    && grant.revokedAt === null && activeWindow(grant.validFrom, grant.expiresAt, now);
  if (principal.kind === 'service') {
    // A human role on a service identity cannot turn a worker into a judge or verifier.
    if (serviceGrants.some((grant) => matches(grant) && selected.services.includes(grant.profile) && grant.actions.includes(request.action))) {
      return Object.freeze({ allowed: true, policyVersion: ACCESS_POLICY_VERSION });
    }
    return deny('missing-grant');
  }
  const candidates = roleGrants.filter((grant) => matches(grant) && selected.roles.includes(grant.role));
  if (candidates.length === 0) return deny('missing-grant');
  if (candidates.some((grant) => nonStaff.has(grant.role))) return Object.freeze({ allowed: true, policyVersion: ACCESS_POLICY_VERSION });
  const mfaAt = session.mfaVerifiedAt === null ? NaN : Date.parse(session.mfaVerifiedAt);
  const maxAge = selected.sensitive ? SENSITIVE_MFA_MAX_AGE_MS : STAFF_MFA_MAX_AGE_MS;
  if (session.assurance !== 'mfa' || !Number.isFinite(mfaAt) || mfaAt > now || now - mfaAt >= maxAge) return deny('mfa-required');
  return Object.freeze({ allowed: true, policyVersion: ACCESS_POLICY_VERSION });
}
