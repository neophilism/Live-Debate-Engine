# Foundation database security limits

Remote connections use verified TLS (`rejectUnauthorized:true`); URI query parameters cannot replace that policy with custom host/certificate settings. Local plaintext requires explicit opt-in on a loopback host and is refused in production.

The pinned pg driver supports `enableChannelBinding:true`, documented at https://node-postgres.com/features/ssl, while the pinned @types/pg declaration omits that property. A narrow intersection type represents the real supported option without `any`, `@ts-ignore` or removing certificate verification.

Enabling channel binding requests it where supported; it is not proof of a mandatory channel-binding guarantee. Consequently `channel_binding=require` and `channel_binding=disable` are rejected rather than silently downgraded. Only absent or `prefer` is accepted at this stage. Production adapter qualification must address any provider-mandated channel-binding requirement; never edit a mandatory policy away merely to make a connection succeed.

Authenticated Neon project/branch metadata reads work; application SQL/TLS and production-role deployment remain untested. E04 exercises actual non-owner identity/runtime roles, secret-derived transaction context and RLS using disposable local/CI PostgreSQL. These unit tests validate configuration construction and failure modes; they do not certify a live TLS handshake, certificate pinning, account isolation or production database roles. Those gates remain explicit later work.
