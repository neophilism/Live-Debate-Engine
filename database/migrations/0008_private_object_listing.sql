-- E06 metadata listing for the reusable UI. Never returns ciphertext, keys or another owner's hidden class.
CREATE FUNCTION lde_storage.list_objects(t uuid,e uuid,after_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,purpose text,content_type text,byte_length integer,state text,generation integer,created_at timestamptz,can_revoke boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE cursor_row lde_storage.objects%ROWTYPE;
BEGIN
  IF NOT lde_security.has_access('event.read',t,e) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Object access denied'; END IF;
  IF after_id IS NOT NULL THEN
    SELECT * INTO cursor_row FROM lde_storage.objects o WHERE o.tenant_id=t AND o.event_id=e AND o.id=after_id;
    IF NOT FOUND OR NOT lde_storage.allowed('read',t,e,cursor_row.owner_id,cursor_row.purpose)
      THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Object access denied'; END IF;
  END IF;
  RETURN QUERY SELECT o.id,o.purpose,o.content_type,o.byte_length,o.state,o.generation,o.created_at,
    lde_storage.allowed('revoke',t,e,o.owner_id,o.purpose)
    FROM lde_storage.objects o WHERE o.tenant_id=t AND o.event_id=e
      AND lde_storage.allowed('read',t,e,o.owner_id,o.purpose)
      AND (after_id IS NULL OR (o.created_at,o.id)<(cursor_row.created_at,cursor_row.id))
    ORDER BY o.created_at DESC,o.id DESC LIMIT 101;
END;
$body$;
ALTER FUNCTION lde_storage.list_objects(uuid,uuid,uuid) OWNER TO lde_guard;
REVOKE ALL ON FUNCTION lde_storage.list_objects(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lde_storage.list_objects(uuid,uuid,uuid) TO lde_runtime;
