# E05 protected-object security

Status: implementation in progress. E04 PR #4 is merged at fc40637f2c0af08e7b31e43b1570207922b0e1b7; merged-main CI 38151234814 passed. E05 is not accepted until implementation, adversarial tests, exact-head review and normal merge gates pass.

Scope: versioned encryption envelopes bound to tenant/event/object/data class; isolated key purposes and lifecycle; authenticated protected storage and quarantine; narrowly scoped expiring asset grants; revocation, key rotation and safe audit/log events. Uploaded material must not become available merely because it was accepted or has a signed link.

The temporary read-only toolchain workflow prepares reviewed dependencies and official PostgreSQL binaries for disposable local tests because outbound DNS is unavailable in the working container. It contains no cloud credentials and will be removed before acceptance. It does not deploy anything or test the supplied production databases.

UBC Debates and the separate politician-debate project are untouched. Full-media processing, event-specific ballot workflow and production provider qualification remain their separately approved gates.
