import { createHmac, timingSafeEqual } from 'node:crypto';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const B64=/^[A-Za-z0-9_-]+$/;
const UTC=/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/;
/** Only verifies authenticity and expiry of an existing opaque ticket.
 * Revocation, one-time gate scan, actor assurance and tenant authority
 * MUST be checked against a transactional server ledger before admission. */
export function verifyAdmissionProof(proof, secret, expected, now=new Date()) {
 if(!Buffer.isBuffer(secret)||secret.length<32)throw new TypeError('Server signing secret is missing');
 if(!expected||Object.getPrototypeOf(expected)!==Object.prototype||
   Object.keys(expected).sort().join(',')!=='eventId,tenantId'||!ID.test(expected.eventId)||!ID.test(expected.tenantId))
  throw new TypeError('Untrusted admission proof scope');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new TypeError('Invalid server clock');
 if(typeof proof!=='string'||proof.length>2048)throw new TypeError('Invalid admission proof');
 const parts=proof.split('.');
 if(parts.length!==2||!parts.every(p=>p.length>0&&B64.test(p)))throw new TypeError('Invalid admission token encoding');
 const [payload,sig]=parts;
 const digest=createHmac('sha256',secret).update(payload,'utf8').digest();
 const provided=Buffer.from(sig,'base64url');
 if(provided.length!==digest.length||!timingSafeEqual(provided,digest))throw new TypeError('Admission token signature mismatch');
 const raw=Buffer.from(payload,'base64url');
 if(raw.length>1024||raw.toString('base64url')!==payload)throw new TypeError('Invalid canonical ticket payload');
 let claims;try{claims=JSON.parse(raw.toString('utf8'));}catch{throw new TypeError('Invalid ticket claims');}
 if(!claims||Object.getPrototypeOf(claims)!==Object.prototype||
   Object.keys(claims).sort().join(',')!=='eventId,expiresAt,nonce,principalId,tenantId')
  throw new TypeError('Invalid ticket claim fields');
 for(const name of ['eventId','nonce','principalId','tenantId'])
  if(typeof claims[name]!=='string'||!ID.test(claims[name]))throw new TypeError('Invalid scoped admission claim');
 if(claims.tenantId!==expected.tenantId||claims.eventId!==expected.eventId)throw new TypeError('Admission ticket wrong event scope');
 if(typeof claims.expiresAt!=='string'||!UTC.test(claims.expiresAt)||
   !Number.isFinite(Date.parse(claims.expiresAt))||
   new Date(claims.expiresAt).toISOString()!==claims.expiresAt||
   Date.parse(claims.expiresAt)<=now.getTime())throw new TypeError('Admission ticket expired');
 return Object.freeze({tenantId:claims.tenantId,eventId:claims.eventId,principalId:claims.principalId,
   signatureVerified:true,revocationVerified:false,gateScanRecorded:false,admitted:false});
}
