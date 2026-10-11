# E05 protected storage and key lifecycle

## Scope and source traceability

Implements the E05 security primitives required by the approved plan: encrypted private objects, upload quarantine, short-lived asset access, key lifecycle, durable audit and safe logs. Source requirements R15-R18 (voting integrity, protected judging/financial data, recording rights and privacy) remain distinct. This layer does not cast a ballot, accept legal terms, publish media or create prize entitlements. Those workflow-specific gates belong to E10/E20/E24/E31/E33.

E04 PR #4 merged at `fc40637f2c0af08e7b31e43b1570207922b0e1b7`. Exact-head CI `38151000137` and merged-main CI `38151234814` passed all five jobs; separate self-review `5483835591`. These facts supersede the prior draft-only handoff.

## Cryptographic boundary

Each immutable object receives a fresh random 256-bit data key and AES-256-GCM encryption with a 96-bit random nonce and a full 128-bit tag. The data key is independently wrapped using a versioned, purpose-specific 256-bit key. Associated data binds the tenant, event, object, owner, content type, byte length and protection purpose. Swapping any of those or modifying the payload/wrap fails authentication before plaintext is returned. Keys are never stored in PostgreSQL; only ciphertext, wrapped keys and nonsecret metadata are persisted.

The server is an authorized plaintext processor. This is authenticated encryption at rest plus protected transport, **not end-to-end secrecy from the application or scanner process**. The supplied file-backed key provider shares the server's trust boundary; a managed KMS adapter/process separation can implement the same interface later. No whole-process compromise isolation or security certification is claimed. JavaScript strings and runtime copies prevent a guarantee of complete forensic memory erasure; temporary plaintext/key buffers are cleared where controlled.

The key file must be absolute, owned by the current process user, mode 0600 (or stricter), regular, bounded, and not a symlink. It is reloaded on each key resolution. Purposes cannot reuse key material. Key states are active, decrypt-only, or revoked. Rotation creates a new active version and retires the prior wrapping key; existing records are rewrapped under a separately privileged operator connection with durable audit. Object generations change, invalidating prior asset tickets. Revocation blocks subsequent resolutions. It cannot recall already downloaded data or destroy external backups. Routine key rewrapping alone is not remediation of compromised data keys.

## Authorization and quarantine

Private object classes are identity documents (owner only), judge notes (owner judge with current MFA), financial documents (owner or event finance with current authorization), and production assets (event producer). Sealed-ballot cryptographic envelopes are supported, but the generic upload route deliberately does not expose ballot creation; E20 must supply electorate/phase/uniqueness gates. An organizer or producer does not implicitly read other classes.

All uploads begin quarantined. Only an explicitly issued event-scoped `upload-scanner` service credential with `object.scan` can process quarantine. It can neither impersonate a human nor release a changed/revoked object. Scan completion uses the current generation and ciphertext digest, preventing stale results from releasing different bytes. Failed/unavailable scanning leaves the object quarantined; malicious/invalid content becomes rejected. A scanner is a trusted plaintext processing endpoint, and compromise of its credential/process is not made harmless by the adapter.

The actual ClamAV adapter implements VERSION and framed INSTREAM over a fixed local Unix socket, with bounded replies and deadlines. It accepts only an explicit clean response, records bounded engine/signature-version evidence, and checks declared text/JSON/PDF/PNG/JPEG signatures before scanning. Signature checks are not full file sanitization or proof a file is safe. No caller-supplied remote scanning URL is accepted. No ClamAV daemon/signature database has been provisioned in the cloud; protocol-fixture tests are explicitly not a live malware-engine qualification. Without a configured working scanner, content stays quarantined.

## Durable store and limits

The reference PostgreSQL adapter supports objects from 1 byte to **1 MiB**, up to **64 MiB per owner**, **256 MiB per tenant**, and **10,000 objects per tenant**. These explicit foundation limits are not a video storage design. Larger media and streaming/object-store adapters belong to E17 and deployment qualification. Quota accounting includes quarantined, rejected and revoked objects until a separately authorized retention workflow removes them; revocation is not deletion.

The database checks encoded ciphertext length against byte length and prohibits extra envelope fields, so a runtime credential cannot hide unmeasured payloads in metadata to evade the quota. Upload plus audit are one transaction, with tenant-serialized quota checks. Runtime and identity roles have no direct object/audit-table access. Narrow audited security-definer functions revalidate the live credential, membership, role, ownership and state. Metadata status reads reveal no payload. Audit rows preserve actor principal, database credential identity, generation and operation; ordinary updates/deletes/truncates fail. Database owners remain trusted administrators able to alter the schema.

## Signed access is not public access

A download ticket is HMAC-SHA-256 authenticated using a separate purpose key, lasts at most 60 seconds, and binds principal, current session, principal epoch, tenant, event, object and generation. The actual download still requires the authenticated browser cookie and fresh database authorization. A copied ticket alone does not grant access. Session/membership/key revocation, object revocation, or rotation invalidates subsequent access. Already admitted operations and previously downloaded bytes cannot be recalled.

Responses are attachment-only with no-store, no-referrer, nosniff and a restrictive sandbox CSP. No filename from an upload becomes a path or response header. Application security logs accept only enumerated event/result, UUID request ID and HTTP status; raw errors, URLs, tickets, credentials, filenames and bodies are rejected by the log schema. Durable database auditing is separate from this operational log.

## HTTP and operator use

Enable protected-object routes by supplying `LDE_STORAGE_KEY_FILE` together with the existing verified identity/runtime configuration. It is disabled rather than unencrypted when no key provider is configured.

- `POST /api/tenants/{tenant}/events/{event}/objects/{purpose}`: bounded raw bytes with an allowed exact Content-Type; returns quarantined object ID.
- `GET /api/tenants/{tenant}/objects/{id}/status`: current state and generation only.
- `POST .../{id}/ticket`: JSON `{}`, same-origin authenticated request; returns a session-bound ticket.
- `GET .../{id}/content?ticket=...`: attachment download after fresh checks.
- `POST .../{id}/revoke`: JSON `{}`; owner-authorized revocation invalidates access.

All mutations require the configured origin. Content encoding tricks, oversized bodies, wrong types, duplicate ticket query parameters and unsupported methods fail closed. There is no public scanner-completion endpoint.

After `npm run build`, explicit operator commands use `dist/scripts/storage-admin.js`:

```sh
# In a private shell environment, LDE_STORAGE_KEY_FILE is an absolute path outside Git.
node dist/scripts/storage-admin.js keys-init
node dist/scripts/storage-admin.js keys-rotate identity-document
node --env-file=.env.migrations dist/scripts/storage-admin.js rewrap TENANT_UUID OBJECT_UUID 'Approved rotation reason'
node dist/scripts/storage-admin.js keys-revoke OLD_KEY_ID
# A separate scanner process uses a narrow runtime DB role and event-scoped credential.
node --env-file=.env dist/scripts/storage-admin.js scan TENANT_UUID OBJECT_UUID
```

Scan configuration also requires `LDE_CLAMAV_SOCKET` and privately injected `LDE_SCANNER_CREDENTIAL`. Never pass credentials in command arguments, commit the key file, or load the migration/operator credential into the serving process. Key file writes are private and atomic; concurrent maintenance uses a lock file. A crash-left maintenance lock needs deliberate operator inspection, not automatic deletion. Key rotation must be backed by recoverable, access-controlled key and ciphertext backups before revoking old versions. No recurring job is created by these commands.

## Verification and remaining release gates

Local strict build/lint/roadmap/migration checks, 128 unit/API/contract cases and 46 real PostgreSQL 18 cases passed. Tests include crypto tampering/context swaps, purpose separation, key file safety, rotation/revocation, ticket authentication/expiry, scanner framing/timeout/rejection, actual HTTP upload/quarantine/download, real provider sessions and MFA, cross-tenant/role denial, current session/membership revocation, stale scanning, audit immutability and SQL quota-evasion regressions. Final exact-head hosted CI and a separate security review are still required before merge.

Cloud storage, production HTTPS/ingress, a real scanner deployment with current signatures, KMS separation, backup/restore, deletion/retention workflows, media-scale storage and independent production review remain their explicit later gates. No source document, production database, cloud service, key or unrelated Debate-Engine resource was changed.

Primary references consulted: Node 22 crypto API (`https://nodejs.org/docs/latest-v22.x/api/crypto.html`), OWASP File Upload and Cryptographic Storage Cheat Sheets, and PostgreSQL 18 row security. The user's End-To-End-Everywhere standard remains the architecture basis; its development tree is not a production certificate.
