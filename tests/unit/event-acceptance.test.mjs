import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEventAcceptance } from '../../packages/competition/src/event-acceptance.mjs';

const scope = () => ({ tenantId: 'tenant-1', eventId: 'event-1', participantId: 'user-1' });
const terms = { documentId: 'terms-1', documentRevision: 2, documentHash: 'a'.repeat(64), kind: 'terms', required: true };
const release = { documentId: 'release-1', documentRevision: 3, documentHash: 'b'.repeat(64), kind: 'recording-release', required: true };
const receipt = (doc) => ({ ...scope(), documentId: doc.documentId, documentRevision: doc.documentRevision, documentHash: doc.documentHash, acceptedAt: '2026-10-18T12:00:00.000Z' });
test('event-specific release manifest finds missing and outdated revisions without granting access', () => {
  const input = { ...scope(), documents: [terms, release], acceptances: [receipt(terms)] };
  const missing = evaluateEventAcceptance(input);
  assert.deepEqual(missing.missing, ['release-1']); assert.deepEqual(missing.outdated, []);
  assert.equal(missing.matchedCurrentDocuments, false);
  assert.equal(missing.competitionReady, false);
  const outdated = evaluateEventAcceptance({ ...input, acceptances: [{...receipt(terms), documentHash:'c'.repeat(64)}, receipt(release)] });
  assert.deepEqual(outdated.outdated, ['terms-1']);
  const matched = evaluateEventAcceptance({ ...input, acceptances: [receipt(terms), receipt(release)], isJunior:true });
  assert.equal(matched.matchedCurrentDocuments, true);
  assert.equal(matched.guardianVerificationRequired, true);
  assert.equal(matched.identityVerified, false);
  assert.equal(matched.legallyEffective, false);
  assert.equal(matched.competitionReady, false);
  assert.ok(Object.isFrozen(matched));
});
test('cross-event and cross-tenant reuse, duplicate receipts, unknown kinds and fields fail closed', () => {
  const base = { ...scope(), documents: [terms], acceptances: [receipt(terms)] };
  const reject = value => assert.throws(() => evaluateEventAcceptance(value));
  reject({ ...base, acceptances: [{...receipt(terms), eventId:'event-2'}] });
  reject({ ...base, acceptances: [{...receipt(terms), tenantId:'tenant-2'}] });
  reject({ ...base, acceptances: [receipt(terms), receipt(terms)] });
  reject({ ...base, documents: [{...terms, kind:'other'}] });
  reject({ ...base, documents: [{...terms, permissions:['admin']}] });
  reject({ ...base, isJunior:'false' });
  reject({ ...base, documents: [terms, terms] });
  reject({ ...base, documents: [], acceptances: [] });
  reject({ ...base, documents: [{ ...terms, required: false }], acceptances: [] });
  reject({ ...base, acceptances: [{ ...receipt(terms), documentId: 'different-document' }] });
});
