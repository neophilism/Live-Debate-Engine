-- Structural money, scope and receipt validation complements the application parser.
CREATE FUNCTION lde.valid_money(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $body$
  SELECT coalesce(
    jsonb_typeof(value) = 'object'
    AND jsonb_typeof(value->'currency') = 'string'
    AND value->>'currency' ~ '^[A-Z]{3}$'
    AND jsonb_typeof(value->'minorUnits') = 'string'
    AND CASE WHEN value->>'minorUnits' ~ '^(0|[1-9][0-9]{0,18})$'
      THEN (value->>'minorUnits')::numeric <= 9223372036854775807
      ELSE false END
    AND jsonb_typeof(value->'exponent') = 'number'
    AND value->>'exponent' ~ '^[0-6]$', false);
$body$;
ALTER TABLE lde.revisions ADD CONSTRAINT declared_money_is_exact CHECK (
  CASE kind
    WHEN 'prize-obligation' THEN lde.valid_money(canonical_record::jsonb->'data'->'amount')
    WHEN 'contract' THEN lde.valid_money(canonical_record::jsonb->'data'->'prizeBudget')
    WHEN 'tournament' THEN lde.valid_money(canonical_record::jsonb->'data'->'placementBudget')
    ELSE true END
);
-- NULL and an event equal to the tenant ID must not become interchangeable scope keys.
ALTER TABLE lde.revisions ADD CONSTRAINT revision_scope_kind CHECK (
  (kind IN ('tenant','series','motion','participant','team','ruleset','tournament')) = (event_id IS NULL)
);
ALTER TABLE lde.revision_references ADD CONSTRAINT reference_scope_kind CHECK (
  (target_kind IN ('tenant','series','motion','participant','team','ruleset','tournament')) = (target_event_id IS NULL)
);
ALTER TABLE lde.revisions ADD CONSTRAINT complete_record_header CHECK (
  canonical_record::jsonb ?& ARRAY['schemaVersion','kind','tenantId','entityId','eventId','snapshotId','revision','previousSnapshotId','recordedAt','data']
);
ALTER TABLE lde.revisions ADD CONSTRAINT receipt_snapshot_revision UNIQUE (tenant_id,snapshot_id,revision);
ALTER TABLE lde.command_receipts ADD CONSTRAINT receipt_matches_revision
  FOREIGN KEY (tenant_id,snapshot_id,revision) REFERENCES lde.revisions(tenant_id,snapshot_id,revision);
