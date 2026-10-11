-- Minimal current-user assignment discovery. No client-supplied principal or role.
CREATE FUNCTION lde_security.my_workspaces() RETURNS TABLE(tenant_id uuid,event_id uuid,roles text[],capabilities text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
  WITH actor AS (SELECT * FROM lde_security.current_actor() WHERE kind='human'),
  assigned AS (
    SELECT g.tenant_id,g.event_id,array_agg(DISTINCT g.role ORDER BY g.role) AS roles,a.principal_id
    FROM actor a JOIN lde_security.memberships m ON m.principal_id=a.principal_id
      JOIN lde_security.role_grants g ON g.tenant_id=m.tenant_id AND g.principal_id=a.principal_id
    WHERE m.status='active' AND m.valid_from<=statement_timestamp() AND (m.expires_at IS NULL OR m.expires_at>statement_timestamp())
      AND g.revoked_at IS NULL AND g.valid_from<=statement_timestamp() AND (g.expires_at IS NULL OR g.expires_at>statement_timestamp())
    GROUP BY g.tenant_id,g.event_id,a.principal_id
  )
  SELECT a.tenant_id,a.event_id,a.roles,
    ARRAY(SELECT r.action FROM lde_security.access_rules r
      WHERE lde_security.has_access(r.action,a.tenant_id,a.event_id,a.principal_id) ORDER BY r.action)
  FROM assigned a ORDER BY a.tenant_id,a.event_id NULLS FIRST;
$body$;
ALTER FUNCTION lde_security.my_workspaces() OWNER TO lde_guard;
REVOKE ALL ON FUNCTION lde_security.my_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lde_security.my_workspaces() TO lde_runtime;
