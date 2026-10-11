-- E03: immutable, typed revision storage. No public domain endpoint is enabled.
CREATE TABLE lde.tenants (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lde.subjects (
  tenant_id uuid NOT NULL REFERENCES lde.tenants(id),
  entity_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('tenant','series','motion','participant','team','ruleset','tournament','event','assignment','contract','session','poll','ballot','scorecard','audience-verdict','judges-verdict','advancement-decision','prize-obligation','tournament-match','dispute')),
  event_id uuid,
  scope_id uuid GENERATED ALWAYS AS (coalesce(event_id, tenant_id)) STORED,
  event_kind text GENERATED ALWAYS AS (CASE WHEN event_id IS NULL THEN NULL ELSE 'event' END) STORED,
  PRIMARY KEY (tenant_id, entity_id),
  UNIQUE (tenant_id, entity_id, kind),
  UNIQUE (tenant_id, entity_id, kind, scope_id),
  FOREIGN KEY (tenant_id, event_id, event_kind) REFERENCES lde.subjects(tenant_id, entity_id, kind),
  CHECK ((kind IN ('tenant','series','motion','participant','team','ruleset','tournament')) = (event_id IS NULL)),
  CHECK (kind <> 'tenant' OR entity_id = tenant_id),
  CHECK (kind <> 'event' OR entity_id = event_id)
);

CREATE TABLE lde.revisions (
  tenant_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  kind text NOT NULL,
  event_id uuid,
  scope_id uuid GENERATED ALWAYS AS (coalesce(event_id, tenant_id)) STORED,
  snapshot_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  previous_snapshot_id uuid,
  previous_revision integer GENERATED ALWAYS AS (nullif(revision - 1, 0)) STORED,
  recorded_at timestamptz NOT NULL,
  canonical_record text NOT NULL CHECK (octet_length(canonical_record) <= 262144),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (tenant_id, snapshot_id),
  UNIQUE (tenant_id, entity_id, revision),
  UNIQUE (tenant_id, entity_id, kind, revision, snapshot_id),
  UNIQUE (tenant_id, entity_id, kind, revision, snapshot_id, scope_id),
  FOREIGN KEY (tenant_id, entity_id, kind, scope_id) REFERENCES lde.subjects(tenant_id, entity_id, kind, scope_id),
  FOREIGN KEY (tenant_id, entity_id, kind, previous_revision, previous_snapshot_id) REFERENCES lde.revisions(tenant_id, entity_id, kind, revision, snapshot_id),
  CHECK ((revision = 1) = (previous_snapshot_id IS NULL)),
  CHECK (previous_snapshot_id IS DISTINCT FROM snapshot_id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_record, 'UTF8')), 'hex')),
  CHECK (coalesce(
    jsonb_typeof(canonical_record::jsonb) = 'object'
    AND canonical_record::jsonb->>'schemaVersion' = '1'
    AND canonical_record::jsonb->>'tenantId' = tenant_id::text
    AND canonical_record::jsonb->>'entityId' = entity_id::text
    AND canonical_record::jsonb->>'kind' = kind
    AND (canonical_record::jsonb->>'eventId') IS NOT DISTINCT FROM event_id::text
    AND canonical_record::jsonb->>'snapshotId' = snapshot_id::text
    AND canonical_record::jsonb->>'revision' = revision::text
    AND (canonical_record::jsonb->>'previousSnapshotId') IS NOT DISTINCT FROM previous_snapshot_id::text
    AND (canonical_record::jsonb->>'recordedAt')::timestamptz = recorded_at
    AND jsonb_typeof(canonical_record::jsonb->'data') = 'object', false)),
  CHECK (coalesce(CASE kind
    WHEN 'audience-verdict' THEN canonical_record::jsonb->'data'->>'basis' = 'audience-swing'
    WHEN 'judges-verdict' THEN canonical_record::jsonb->'data'->>'basis' = 'judges-rubric'
    WHEN 'advancement-decision' THEN canonical_record::jsonb->'data'->>'basis' = 'advancement'
    WHEN 'prize-obligation' THEN canonical_record::jsonb->'data'->>'basis' = 'prize-obligation'
    WHEN 'ballot' THEN canonical_record::jsonb->'data'->>'basis' = 'sealed-ballot'
    ELSE true END, false))
);

CREATE TABLE lde.revision_references (
  tenant_id uuid NOT NULL,
  source_snapshot_id uuid NOT NULL,
  target_snapshot_id uuid NOT NULL,
  target_entity_id uuid NOT NULL,
  target_kind text NOT NULL,
  target_revision integer NOT NULL,
  target_event_id uuid,
  target_scope_id uuid GENERATED ALWAYS AS (coalesce(target_event_id, tenant_id)) STORED,
  PRIMARY KEY (tenant_id, source_snapshot_id, target_snapshot_id),
  FOREIGN KEY (tenant_id, source_snapshot_id) REFERENCES lde.revisions(tenant_id, snapshot_id),
  FOREIGN KEY (tenant_id, target_entity_id, target_kind, target_revision, target_snapshot_id, target_scope_id) REFERENCES lde.revisions(tenant_id, entity_id, kind, revision, snapshot_id, scope_id),
  CHECK (source_snapshot_id <> target_snapshot_id)
);

CREATE TABLE lde.command_receipts (
  tenant_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  principal_id uuid NOT NULL,
  intent_hash text NOT NULL CHECK (intent_hash ~ '^[a-f0-9]{64}$'),
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  snapshot_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision = expected_revision + 1),
  PRIMARY KEY (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, snapshot_id) REFERENCES lde.revisions(tenant_id, snapshot_id)
);

CREATE TABLE lde.domain_events (
  tenant_id uuid NOT NULL,
  message_id uuid NOT NULL,
  message_type text NOT NULL CHECK (message_type = 'snapshot-appended'),
  snapshot_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, message_id),
  UNIQUE (tenant_id, snapshot_id, message_type),
  FOREIGN KEY (tenant_id, snapshot_id) REFERENCES lde.revisions(tenant_id, snapshot_id)
);

CREATE FUNCTION lde.reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'History is immutable; append a revision instead';
END;
$body$;
REVOKE ALL ON FUNCTION lde.reject_history_change() FROM PUBLIC;

DO $body$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['subjects','revisions','revision_references','command_receipts','domain_events'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON lde.%I FOR EACH ROW EXECUTE FUNCTION lde.reject_history_change()', table_name);
    EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON lde.%I FOR EACH STATEMENT EXECUTE FUNCTION lde.reject_history_change()', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['tenants','subjects','revisions','revision_references','command_receipts','domain_events'] LOOP
    EXECUTE format('ALTER TABLE lde.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE lde.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON lde.%I FROM PUBLIC', table_name);
  END LOOP;
END;
$body$;
-- There are intentionally no runtime row policies until E04. Administrators can
-- alter/drop database objects; this is not a claim of tamper-proof storage against them.
