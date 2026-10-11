# E06 reusable interfaces and accessibility

In development; not accepted. Depends on E04 PR #4 and E05 PR #6, which are merged with passing exact-head/main checks. E05 exact-head run 38160338358, merged-main run 38160444377 and separate security self-review 5484260096 are recorded in PR #6. The current main revision 86d3601c264d5c9256f6a8483784ef0a27c827f4 passed CI 38161332759 and its source artifact matched tree 01ef40bedca65bc986944748e354e6db902eefd5 locally.

Scope: shared React components, shell/navigation, forms, tables, status and timing displays, accessible authentication/account flows wired to E04, and role-aware workspace navigation. Two neutral brands must use the same engine components. UBC Debates stays untouched. Client-side visibility is never authorization.

The temporary read-only toolchain preparation workflow resolves candidate exact versions and downloads public dependency/browser/PostgreSQL binaries for this network-restricted local environment. Its artifacts contain no cloud data or secrets, are retained for two days, and are not merge acceptance. Review and commit the candidate lockfile, run actual browser/backend tests, remove this workflow and perform final exact-head CI and separate review before merge. No production resources are provisioned.
