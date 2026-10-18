-- Fixed, credential-bound organizer reads; no generic table grants.
CREATE FUNCTION lde_competition.administration_records(t uuid,k text,entity uuid,before_id uuid,before_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE records jsonb; more boolean; next_id uuid; next_revision integer;
BEGIN
 PERFORM lde_competition.authorize('tenant.manage',t,NULL);
 IF k IS NULL OR k NOT IN ('series','motion','event') OR before_revision IS NULL OR before_revision<1
   OR (entity IS NOT NULL AND before_id IS NOT NULL)
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administration page'; END IF;
 IF entity IS NULL THEN
   WITH latest AS (
     SELECT DISTINCT ON (r.entity_id) r.* FROM lde.revisions r
     WHERE r.tenant_id=t AND r.kind=k AND (before_id IS NULL OR r.entity_id<before_id)
     ORDER BY r.entity_id DESC,r.revision DESC
   ), page AS (SELECT * FROM latest WHERE (canonical_record::jsonb->'data') ? 'updatedBy' ORDER BY entity_id DESC LIMIT 51),
   visible AS (SELECT * FROM page ORDER BY entity_id DESC LIMIT 50)
   SELECT COALESCE((SELECT jsonb_agg(lde_competition.admin_envelope(v::lde.revisions) ORDER BY v.entity_id DESC) FROM visible v),'[]'::jsonb),
     (SELECT count(*)>50 FROM page),(SELECT v.entity_id FROM visible v ORDER BY v.entity_id LIMIT 1)
   INTO records,more,next_id;
   RETURN jsonb_build_object('records',records,'nextCursor',CASE WHEN more THEN next_id ELSE NULL END,'nextRevision',NULL);
 END IF;
 WITH page AS (
   SELECT r.* FROM lde.revisions r WHERE r.tenant_id=t AND r.kind=k AND r.entity_id=entity AND r.revision<before_revision AND (r.canonical_record::jsonb->'data') ? 'updatedBy'
   ORDER BY r.revision DESC LIMIT 51
 ), visible AS (SELECT * FROM page ORDER BY revision DESC LIMIT 50)
 SELECT COALESCE((SELECT jsonb_agg(lde_competition.admin_envelope(v::lde.revisions) ORDER BY v.revision DESC) FROM visible v),'[]'::jsonb),
   (SELECT count(*)>50 FROM page),(SELECT min(v.revision) FROM visible v)
 INTO records,more,next_revision;
 RETURN jsonb_build_object('records',records,'nextCursor',NULL,'nextRevision',CASE WHEN more THEN next_revision ELSE NULL END);
END;
$body$;
ALTER FUNCTION lde_competition.administration_records(uuid,text,uuid,uuid,integer) OWNER TO lde_guard;
REVOKE ALL ON FUNCTION lde_competition.administration_records(uuid,text,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lde_competition.administration_records(uuid,text,uuid,uuid,integer) TO lde_runtime;
