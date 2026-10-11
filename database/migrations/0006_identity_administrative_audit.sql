-- Operator actions are not application-level authorizations; record the credential identity.
CREATE TABLE lde_security.administrative_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL CHECK(action IN ('membership','role','principal','issue-service','revoke-service')),
  principal_id uuid REFERENCES lde_security.principals(id),
  tenant_id uuid REFERENCES lde.tenants(id), event_id uuid,
  reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON lde_security.administrative_audit FROM PUBLIC,lde_identity,lde_runtime;
ALTER TABLE lde_security.administrative_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_security.administrative_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_operator ON lde_security.administrative_audit TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE TRIGGER immutable_administrative_rows BEFORE UPDATE OR DELETE ON lde_security.administrative_audit
FOR EACH ROW EXECUTE FUNCTION lde.reject_history_change();
CREATE TRIGGER immutable_administrative_truncate BEFORE TRUNCATE ON lde_security.administrative_audit
FOR EACH STATEMENT EXECUTE FUNCTION lde.reject_history_change();
