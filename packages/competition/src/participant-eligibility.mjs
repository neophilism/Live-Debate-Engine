/** E10 advisory requirements evaluator. All input is untrusted until a server verifies
 * the issuing authority, person, event, epoch, and expiry. Never grants access. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const CHECKS = Object.freeze(['identity', 'age-or-guardian', 'jurisdiction', 'employee-family-conflict', 'recording-release', 'terms', 'material-rights']);
const STATES = new Set(['verified', 'missing', 'expired', 'disputed']);
export function evaluateEligibilityEvidence(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
    Object.keys(input).sort().join(',') !== 'checks,eventId,participantId,tenantId') throw new TypeError('Invalid eligibility envelope');
  for (const field of ['tenantId','eventId','participantId'])
    if (typeof input[field] !== 'string' || !ID.test(input[field])) throw new TypeError('Invalid eligibility scope');
  if (!Array.isArray(input.checks) || input.checks.length !== CHECKS.length) throw new TypeError('Incomplete eligibility evidence');
  const state = new Map();
  for (const item of input.checks) {
    if (!item || Object.getPrototypeOf(item) !== Object.prototype ||
      Object.keys(item).sort().join(',') !== 'code,state') throw new TypeError('Invalid eligibility finding');
    if (!CHECKS.includes(item.code) || !STATES.has(item.state) || state.has(item.code)) throw new TypeError('Duplicate or unknown eligibility check');
    state.set(item.code,item.state);
  }
  const blockers = CHECKS.filter(code => state.get(code) !== 'verified').map(code => Object.freeze({ code, status: state.get(code) }));
  return Object.freeze({
    noReportedFindings: blockers.length === 0,
    blockers: Object.freeze(blockers),
    evidenceAuthenticityVerified: false,
    participantAuthorized: false,
    competitionReady: false,
  });
}
