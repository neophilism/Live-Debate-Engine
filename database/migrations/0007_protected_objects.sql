-- E05 bounded protected-object store. Ciphertext only; keys stay outside PostgreSQL.
ALTER TABLE lde_security.service_credentials DROP CONSTRAINT service_credentials_profile_check;
ALTER TABLE lde_security.service_credentials ADD CONSTRAINT service_credentials_profile_check
  CHECK(profile IN ('transcription-worker','tally-worker','payout-worker','upload-scanner'));
INSERT INTO lde_security.access_rules(action,scope,roles,profiles,ownership,sensitive)
  VALUES('object.scan','event','{}',ARRAY['upload-scanner'],false,false);
CREATE SCHEMA lde_storage;
REVOKE ALL ON SCHEMA lde_storage FROM PUBLIC;
GRANT USAGE ON SCHEMA lde_storage TO lde_guard,lde_runtime;
CREATE TABLE lde_storage.objects (
  tenant_id uuid NOT NULL REFERENCES lde.tenants(id),
  event_id uuid NOT NULL, event_kind text GENERATED ALWAYS AS ('event') STORED,
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES lde_security.principals(id),
  purpose text NOT NULL CHECK(purpose IN ('identity-document','judge-note','finance-document','production-asset','sealed-ballot')),
  content_type text NOT NULL CHECK(content_type IN ('text/plain','application/json','application/pdf','image/png','image/jpeg')),
  byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 1048576),
  context jsonb NOT NULL,
  envelope jsonb NOT NULL CHECK(jsonb_typeof(envelope)='object' AND octet_length(envelope::text)<1500000),
  ciphertext_digest text NOT NULL CHECK(ciphertext_digest=encode(sha256(convert_to(envelope->'payload'->>'ciphertext','UTF8')),'hex')),
  state text NOT NULL DEFAULT 'quarantined' CHECK(state IN ('quarantined','released','rejected','revoked')),
  generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY(tenant_id,event_id,event_kind) REFERENCES lde.subjects(tenant_id,entity_id,kind),
  CHECK(coalesce(context->>'version'='1' AND context->>'tenantId'=tenant_id::text
    AND context->>'eventId'=event_id::text AND context->>'objectId'=id::text
    AND context->>'ownerId'=owner_id::text AND context->>'purpose'=purpose
    AND context->>'contentType'=content_type AND context->>'byteLength'=byte_length::text,false)),
  CHECK(coalesce(envelope->>'version'='1' AND envelope->>'algorithm'='A256GCM-envelope-v1'
    AND envelope->>'keyId' ~ '^[a-z0-9][a-z0-9-]{0,79}$'
    AND envelope->'payload'->>'iv' ~ '^[A-Za-z0-9_-]{16}$'
    AND envelope->'payload'->>'tag' ~ '^[A-Za-z0-9_-]{22}$'
    AND envelope->'payload'->>'ciphertext' ~ '^[A-Za-z0-9_-]+$'
    AND length(envelope->'payload'->>'ciphertext')=(byte_length*4+2)/3
    AND envelope-ARRAY['version','algorithm','keyId','payload','wrappedKey']='{}'::jsonb
    AND (envelope->'payload')-ARRAY['iv','tag','ciphertext']='{}'::jsonb
    AND (envelope->'wrappedKey')-ARRAY['iv','tag','ciphertext']='{}'::jsonb
    AND context-ARRAY['version','tenantId','eventId','objectId','ownerId','purpose','contentType','byteLength']='{}'::jsonb
    AND envelope->'wrappedKey'->>'iv' ~ '^[A-Za-z0-9_-]{16}$'
    AND envelope->'wrappedKey'->>'tag' ~ '^[A-Za-z0-9_-]{22}$'
    AND envelope->'wrappedKey'->>'ciphertext' ~ '^[A-Za-z0-9_-]{43}$',false))
);
CREATE INDEX objects_by_event ON lde_storage.objects(tenant_id,event_id,state,created_at);
CREATE TABLE lde_storage.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL, object_id uuid NOT NULL, principal_id uuid,
  database_actor text NOT NULL DEFAULT session_user,
  actor_kind text NOT NULL CHECK(actor_kind IN ('human','service','operator')),
  operation text NOT NULL CHECK(operation IN ('uploaded','read','ticket-issued','scan-read','scan-clean','scan-rejected','scan-unavailable','revoked','key-rotated')),
  generation integer NOT NULL CHECK(generation>0),
  detail text CHECK(detail IS NULL OR length(detail) BETWEEN 1 AND 160),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,object_id) REFERENCES lde_storage.objects(tenant_id,id)
);
CREATE TRIGGER immutable_storage_audit BEFORE UPDATE OR DELETE ON lde_storage.audit
  FOR EACH ROW EXECUTE FUNCTION lde.reject_history_change();
CREATE TRIGGER immutable_storage_audit_truncate BEFORE TRUNCATE ON lde_storage.audit
  FOR EACH STATEMENT EXECUTE FUNCTION lde.reject_history_change();
-- No runtime table privileges: even reads must pass audited functions.
REVOKE ALL ON ALL TABLES IN SCHEMA lde_storage FROM PUBLIC,lde_runtime,lde_identity;
GRANT SELECT,INSERT,UPDATE ON lde_storage.objects TO lde_guard;
GRANT SELECT,INSERT ON lde_storage.audit TO lde_guard;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA lde_storage TO lde_guard;
ALTER TABLE lde_storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_storage.objects FORCE ROW LEVEL SECURITY;
ALTER TABLE lde_storage.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_storage.audit FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_guard ON lde_storage.objects TO lde_guard USING(true) WITH CHECK(true);
CREATE POLICY audit_guard ON lde_storage.audit TO lde_guard USING(true) WITH CHECK(true);
CREATE POLICY storage_operator ON lde_storage.objects TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY audit_operator ON lde_storage.audit TO CURRENT_USER USING(true) WITH CHECK(true);

CREATE FUNCTION lde_storage.allowed(op text,t uuid,e uuid,owner uuid,p text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM lde_security.current_actor();
  IF NOT FOUND OR NOT lde_security.is_member(t) THEN RETURN false; END IF;
  IF op='scan' THEN RETURN p<>'sealed-ballot' AND lde_security.has_access('object.scan',t,e); END IF;
  IF op NOT IN ('upload','read','revoke') THEN RETURN false; END IF;
  IF p='sealed-ballot' THEN RETURN op='read' AND lde_security.has_access('ballot.read-sealed',t,e); END IF;
  IF a.kind<>'human' THEN RETURN false; END IF;
  IF op IN ('upload','revoke') AND a.principal_id<>owner THEN RETURN false; END IF;
  CASE p
    WHEN 'identity-document' THEN RETURN a.principal_id=owner AND lde_security.has_access('event.read',t,e);
    WHEN 'judge-note' THEN RETURN lde_security.has_access(CASE WHEN op='read' THEN 'scorecard.read-own' ELSE 'scorecard.write-own' END,t,e,owner);
    WHEN 'finance-document' THEN RETURN (a.principal_id=owner AND lde_security.has_access('event.read',t,e))
      OR (op='read' AND lde_security.has_access('prize.manage',t,e));
    WHEN 'production-asset' THEN RETURN lde_security.has_access('media.control',t,e);
    ELSE RETURN false;
  END CASE;
END;
$body$;
CREATE FUNCTION lde_storage.put_object(c jsonb,encrypted jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE t uuid; e uuid; own uuid; obj uuid; p text; a record;
BEGIN
  t:=(c->>'tenantId')::uuid; e:=(c->>'eventId')::uuid; own:=(c->>'ownerId')::uuid;
  obj:=(c->>'objectId')::uuid; p:=c->>'purpose';
  IF NOT lde_storage.allowed('upload',t,e,own,p) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Object access denied'; END IF;
  SELECT * INTO a FROM lde_security.current_actor();
  PERFORM pg_advisory_xact_lock(hashtextextended('lde:storage:'||t::text,0));
  IF (SELECT count(*) FROM lde_storage.objects WHERE tenant_id=t)>=10000
    OR (SELECT coalesce(sum(byte_length),0) FROM lde_storage.objects WHERE tenant_id=t)+(c->>'byteLength')::integer>268435456
    OR (SELECT coalesce(sum(byte_length),0) FROM lde_storage.objects WHERE tenant_id=t AND owner_id=own)+(c->>'byteLength')::integer>67108864
  THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='Protected storage quota exceeded'; END IF;
  INSERT INTO lde_storage.objects(tenant_id,event_id,id,owner_id,purpose,content_type,byte_length,context,envelope,ciphertext_digest)
    VALUES(t,e,obj,own,p,c->>'contentType',(c->>'byteLength')::integer,c,encrypted,encode(sha256(convert_to(encrypted->'payload'->>'ciphertext','UTF8')),'hex'));
  INSERT INTO lde_storage.audit(tenant_id,object_id,principal_id,actor_kind,operation,generation)
    VALUES(t,obj,a.principal_id,a.kind,'uploaded',1);
  RETURN obj;
END;
$body$;
CREATE FUNCTION lde_storage.read_object(t uuid,obj uuid,operation text)
RETURNS TABLE(context jsonb,envelope jsonb,generation integer,state text,ciphertext_digest text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE item lde_storage.objects%ROWTYPE; a record;
BEGIN
  IF operation NOT IN ('read','ticket-issued','scan-read') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Object access denied'; END IF;
  SELECT * INTO item FROM lde_storage.objects o WHERE o.tenant_id=t AND o.id=obj FOR SHARE;
  IF NOT FOUND OR NOT lde_storage.allowed(CASE WHEN operation='scan-read' THEN 'scan' ELSE 'read' END,t,item.event_id,item.owner_id,item.purpose)
    OR (CASE WHEN operation='scan-read' THEN item.state<>'quarantined' ELSE item.state<>'released' END)
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Object access denied'; END IF;
  SELECT * INTO a FROM lde_security.current_actor();
  INSERT INTO lde_storage.audit(tenant_id,object_id,principal_id,actor_kind,operation,generation)
    VALUES(t,obj,a.principal_id,a.kind,operation,item.generation);
  RETURN QUERY SELECT item.context,item.envelope,item.generation,item.state,item.ciphertext_digest;
END;
$body$;
CREATE FUNCTION lde_storage.scan_result(t uuid,obj uuid,expected integer,cipher_digest text,verdict text,scanner text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE item lde_storage.objects%ROWTYPE; a record; new_state text;
BEGIN
  IF verdict IS NULL OR expected IS NULL OR expected<1 OR cipher_digest IS NULL OR cipher_digest !~ '^[a-f0-9]{64}$'
    OR verdict NOT IN ('clean','rejected','unavailable') OR scanner !~ '^[a-zA-Z0-9][a-zA-Z0-9 .:_-]{0,159}$'
    OR scanner IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid scan result'; END IF;
  SELECT * INTO item FROM lde_storage.objects o WHERE o.tenant_id=t AND o.id=obj FOR UPDATE;
  IF NOT FOUND OR NOT lde_storage.allowed('scan',t,item.event_id,item.owner_id,item.purpose)
    OR item.state<>'quarantined' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Object access denied'; END IF;
  IF item.generation<>expected OR item.ciphertext_digest<>cipher_digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Stale scan result'; END IF;
  SELECT * INTO a FROM lde_security.current_actor();
  new_state:=CASE verdict WHEN 'clean' THEN 'released' WHEN 'rejected' THEN 'rejected' ELSE 'quarantined' END;
  UPDATE lde_storage.objects SET state=new_state,generation=objects.generation+1,updated_at=now() WHERE tenant_id=t AND id=obj;
  INSERT INTO lde_storage.audit(tenant_id,object_id,principal_id,actor_kind,operation,generation,detail)
    VALUES(t,obj,a.principal_id,a.kind,'scan-'||CASE WHEN verdict='clean' THEN 'clean' WHEN verdict='rejected' THEN 'rejected' ELSE 'unavailable' END,item.generation+1,scanner);
  RETURN new_state;
END;
$body$;
CREATE FUNCTION lde_storage.revoke_object(t uuid,obj uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE item lde_storage.objects%ROWTYPE; a record;
BEGIN
  SELECT * INTO item FROM lde_storage.objects o WHERE o.tenant_id=t AND o.id=obj FOR UPDATE;
  IF NOT FOUND OR NOT lde_storage.allowed('revoke',t,item.event_id,item.owner_id,item.purpose)
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Object access denied'; END IF;
  IF item.state='revoked' THEN RETURN true; END IF;
  SELECT * INTO a FROM lde_security.current_actor();
  UPDATE lde_storage.objects SET state='revoked',generation=objects.generation+1,updated_at=now() WHERE tenant_id=t AND id=obj;
  INSERT INTO lde_storage.audit(tenant_id,object_id,principal_id,actor_kind,operation,generation)
    VALUES(t,obj,a.principal_id,a.kind,'revoked',item.generation+1);
  RETURN true;
END;
$body$;
CREATE FUNCTION lde_storage.object_status(t uuid,obj uuid) RETURNS TABLE(state text,generation integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE item lde_storage.objects%ROWTYPE;
BEGIN
  SELECT * INTO item FROM lde_storage.objects o WHERE o.tenant_id=t AND o.id=obj;
  IF NOT FOUND OR NOT lde_storage.allowed('read',t,item.event_id,item.owner_id,item.purpose)
    THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Object access denied'; END IF;
  RETURN QUERY SELECT item.state,item.generation;
END;
$body$;
DO $body$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lde_storage' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO lde_guard',f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  END LOOP;
END;
$body$;
GRANT EXECUTE ON FUNCTION lde_storage.allowed(text,uuid,uuid,uuid,text),lde_storage.put_object(jsonb,jsonb),
  lde_storage.read_object(uuid,uuid,text),lde_storage.scan_result(uuid,uuid,integer,text,text,text),
  lde_storage.revoke_object(uuid,uuid),lde_storage.object_status(uuid,uuid) TO lde_runtime;
-- Runtime has no key-rotation or audit-table modification permission. Rotation uses the
-- release/operator credential through a separate process and always records operator identity.
