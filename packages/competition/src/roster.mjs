/** E-09 pure preflight only: trusted tenant membership and durable authorization
 * must be checked separately before any assignment is saved. */
const VALID_ROLE = new Set(['debater', 'judge', 'moderator']);
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
export function validateEventRoster({eventId,tenantId,entries}) {
  if (!ID.test(eventId||'') || !ID.test(tenantId||'') ||
      !Array.isArray(entries) || entries.length > 100 || entries.length < 1)
    throw new TypeError('Invalid roster');
  const identities = new Set();
  const judges = new Set();
  const result = [];
  for (const entry of entries) {
    if (!entry || Object.getPrototypeOf(entry) !== Object.prototype ||
        Object.keys(entry).sort().join(',') !== 'identityId,role,teamId' ||
        !ID.test(entry.identityId||'') || !VALID_ROLE.has(entry.role) ||
        !(entry.teamId === null || ID.test(entry.teamId||'')) ||
        (entry.role === 'debater' && entry.teamId === null) ||
        (entry.role !== 'debater' && entry.teamId !== null) ||
        identities.has(entry.identityId)) throw new TypeError('Invalid roster entry');
    identities.add(entry.identityId);
    if (entry.role === 'judge') judges.add(entry.identityId);
    result.push(Object.freeze({identityId:entry.identityId,role:entry.role,teamId:entry.teamId}));
  }
  if (!result.some(x=>x.role==='debater') || judges.size===0) throw new TypeError('Roster requires debaters and judges');
  return Object.freeze({eventId,tenantId,entries:Object.freeze(result)});
}
