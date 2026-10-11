-- Structural money validation complements the strict application contract parser.
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
