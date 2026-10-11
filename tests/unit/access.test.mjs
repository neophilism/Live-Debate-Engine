import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, ACCESS_POLICY_VERSION, evaluateAccess, STAFF_MFA_MAX_AGE_MS, SENSITIVE_MFA_MAX_AGE_MS } from '../../dist/packages/contracts/src/access.js';
import { ROLES } from '../../dist/packages/contracts/src/domain.js';

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const now = Date.parse('2026-10-11T12:00:00.000Z');
const iso = (offset) => new Date(now + offset).toISOString();
function fixture(role = 'moderator', action = 'session.control') {
  return {
    principal: { id: id(1), kind: 'human', status: 'active', epoch: 2 },
    session: { id: id(2), principalId: id(1), kind: 'human', principalEpoch: 2, authenticatedAt: iso(-60000), expiresAt: iso(3600000), revokedAt: null, assurance: 'mfa', mfaVerifiedAt: iso(-30000) },
    membership: { principalId: id(1), tenantId: id(3), status: 'active', validFrom: iso(-60000), expiresAt: null },
    roleGrants: [{ principalId: id(1), tenantId: id(3), eventId: id(4), role, validFrom: iso(-60000), expiresAt: null, revokedAt: null }],
    serviceGrants: [], request: { action, tenantId: id(3), eventId: id(4), ownerPrincipalId: null },
  };
}
const allowed = (value) => assert.deepEqual(evaluateAccess(value, now), { allowed: true, policyVersion: ACCESS_POLICY_VERSION });
const denied = (value, reason) => {
  const result = evaluateAccess(value, now);
  assert.equal(result.allowed, false);
  if (reason) assert.equal(result.reason, reason);
};

test('explicit same-event moderator grant controls a session', () => allowed(fixture()));
test('tenant and event IDs must match exactly; tenant grants are not event wildcards', () => {
  for (const mutate of [
    (f) => { f.request.tenantId = id(8); },
    (f) => { f.request.eventId = id(8); },
    (f) => { f.roleGrants[0].tenantId = id(8); },
    (f) => { f.roleGrants[0].eventId = null; },
  ]) { const f = fixture(); mutate(f); denied(f); }
});
test('grant for another actor and mismatched session identity fail closed', () => {
  for (const mutate of [
    (f) => { f.roleGrants[0].principalId = id(8); },
    (f) => { f.session.principalId = id(8); },
    (f) => { f.membership.principalId = id(8); },
    (f) => { f.principal.epoch += 1; },
  ]) { const f = fixture(); mutate(f); denied(f); }
});
test('revocation, disablement, expiry, suspended membership and future grants reject access', () => {
  for (const mutate of [
    (f) => { f.session.revokedAt = iso(-1); },
    (f) => { f.principal.status = 'disabled'; },
    (f) => { f.session.expiresAt = iso(0); },
    (f) => { f.membership.status = 'suspended'; },
    (f) => { f.membership.status = 'revoked'; },
    (f) => { f.membership.validFrom = iso(1); },
    (f) => { f.membership.expiresAt = iso(0); },
    (f) => { f.roleGrants[0].expiresAt = iso(0); },
    (f) => { f.roleGrants[0].revokedAt = iso(-1); },
    (f) => { f.roleGrants[0].validFrom = iso(1); },
  ]) { const f = fixture(); mutate(f); denied(f); }
});
test('staff needs a verified challenge bound to the current session', () => {
  const f = fixture(); f.session.assurance = 'single-factor'; f.session.mfaVerifiedAt = null;
  denied(f, 'mfa-required');
  f.principal.twoFactorEnabled = true;
  denied(f, 'invalid-input');
});
test('future or pre-session MFA evidence cannot grant staff access', () => {
  for (const offset of [1, -60001]) { const f = fixture(); f.session.mfaVerifiedAt = iso(offset); denied(f); }
});
test('staff MFA and sensitive step-up expire at the exact boundary', () => {
  const f = fixture(); f.session.authenticatedAt = iso(-STAFF_MFA_MAX_AGE_MS - 1);
  f.session.mfaVerifiedAt = iso(-STAFF_MFA_MAX_AGE_MS);
  denied(f, 'mfa-required');
  f.session.mfaVerifiedAt = iso(-STAFF_MFA_MAX_AGE_MS + 1); allowed(f);
  const sensitive = fixture('finance', 'payout.approve');
  sensitive.session.authenticatedAt = iso(-SENSITIVE_MFA_MAX_AGE_MS - 1);
  sensitive.session.mfaVerifiedAt = iso(-SENSITIVE_MFA_MAX_AGE_MS);
  denied(sensitive, 'mfa-required');
  sensitive.session.mfaVerifiedAt = iso(-SENSITIVE_MFA_MAX_AGE_MS + 1); allowed(sensitive);
});
test('audience may request its own ballot operation without staff MFA, not someone else\'s', () => {
  const f = fixture('audience', 'ballot.cast-own'); f.session.assurance = 'single-factor'; f.session.mfaVerifiedAt = null;
  f.request.ownerPrincipalId = f.principal.id; allowed(f);
  f.request.ownerPrincipalId = id(9); denied(f, 'owner-mismatch');
  f.request.ownerPrincipalId = null; denied(f, 'owner-mismatch');
});
test('judge grants are own-scorecard only and still require MFA', () => {
  const f = fixture('judge', 'scorecard.read-own'); f.request.ownerPrincipalId = f.principal.id; allowed(f);
  f.request.ownerPrincipalId = id(9); denied(f, 'owner-mismatch');
  f.request.ownerPrincipalId = f.principal.id; f.session.assurance = 'single-factor'; f.session.mfaVerifiedAt = null;
  denied(f, 'mfa-required');
});
test('no human role is an implicit sealed-ballot or payout-execution superuser', () => {
  for (const role of ROLES) {
    denied(fixture(role, 'ballot.read-sealed'));
    denied(fixture(role, 'payout.execute'));
    denied(fixture(role, 'transcript.append'));
  }
});
test('organizer privilege is explicit, scoped and does not imply operational roles', () => {
  const f = fixture('organizer', 'tenant.manage'); denied(f, 'scope-mismatch');
  f.request.eventId = null; denied(f, 'missing-grant');
  f.roleGrants[0].eventId = null; allowed(f);
  denied(fixture('organizer', 'session.control'));
  denied(fixture('organizer', 'payout.approve'));
});
function serviceFixture() {
  const f = fixture('producer', 'ballot.read-sealed');
  f.principal.kind = 'service'; f.session.kind = 'service'; f.session.assurance = 'service'; f.session.mfaVerifiedAt = null;
  f.serviceGrants = [{ ...f.roleGrants[0], profile: 'tally-worker', actions: ['ballot.read-sealed'] }];
  delete f.serviceGrants[0].role;
  return f;
}
test('service profiles require explicit narrowed same-event grants', () => {
  const f = serviceFixture(); allowed(f);
  f.request.action = 'tally.write'; denied(f, 'missing-grant');
  f.serviceGrants[0].actions.push('tally.write'); allowed(f);
  f.request.eventId = id(9); denied(f, 'missing-grant');
});
test('service grants cannot broaden beyond their processing profile or impersonate human reviewers', () => {
  const f = serviceFixture();
  for (const action of ['result.verify', 'payout.approve', 'payout.execute', 'event.manage']) {
    f.request.action = action; f.serviceGrants[0].actions = [action]; denied(f, 'missing-grant');
  }
  f.request.action = 'result.verify'; f.roleGrants[0].role = 'oversight'; denied(f, 'missing-grant');
});
test('human identities cannot use service grants to bypass sealed-data restrictions', () => {
  const f = serviceFixture(); f.principal.kind = 'human'; f.session.kind = 'human';
  f.session.assurance = 'mfa'; f.session.mfaVerifiedAt = iso(-30000); denied(f, 'missing-grant');
});
test('unknown actions/roles, injected fields and accessor data fail closed', () => {
  for (const mutate of [
    (f) => { f.request.action = 'constructor'; },
    (f) => { f.roleGrants[0].role = 'admin'; },
    (f) => { f.request.allow = true; },
    (f) => { f.principal = Object.create(f.principal); },
    (f) => { Object.defineProperty(f.session, 'assurance', { enumerable: true, get() { throw new Error('must not execute'); } }); },
  ]) { const f = fixture(); mutate(f); denied(f, 'invalid-input'); }
});
test('decision is immutable and never includes identity, credentials or grants', () => {
  const f = fixture(); const original = structuredClone(f); const decision = evaluateAccess(f, now);
  assert.deepEqual(f, original); assert.equal(Object.isFrozen(decision), true);
  assert.deepEqual(Object.keys(decision).sort(), ['allowed', 'policyVersion']);
  f.roleGrants.length = 0; denied(f, 'missing-grant');
});
test('invalid trusted time and malformed session input fail closed', () => {
  for (const time of [NaN, Infinity, -1, 0.25]) assert.equal(evaluateAccess(fixture(), time).allowed, false);
  for (const input of [null, undefined, {}, [], 'session']) denied(input, 'invalid-input');
});
test('public policy action list is frozen and contains no wildcard privilege', () => {
  assert.ok(Object.isFrozen(ACTIONS)); assert.equal(ACTIONS.includes('*'), false);
});
