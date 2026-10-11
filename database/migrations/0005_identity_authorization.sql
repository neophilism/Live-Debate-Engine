-- E04: identity provider and competition connections use different non-owner roles.
DO $body$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['lde_runtime','lde_identity','lde_guard'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',role_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolcanlogin)) THEN
      RAISE EXCEPTION 'Unsafe existing base role: %',role_name;
    END IF;
  END LOOP;
END;
$body$;

CREATE SCHEMA lde_security;
REVOKE ALL ON SCHEMA lde_security FROM PUBLIC;
REVOKE ALL ON SCHEMA lde_auth FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA lde_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA lde_auth TO lde_identity,lde_guard;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA lde_auth TO lde_identity;
GRANT SELECT ON ALL TABLES IN SCHEMA lde_auth TO lde_guard;
GRANT DELETE ON lde_auth.session TO lde_guard;
GRANT USAGE ON SCHEMA lde_security TO lde_runtime,lde_identity,lde_guard;
GRANT USAGE ON SCHEMA lde TO lde_runtime,lde_guard;
GRANT USAGE ON SCHEMA engine_meta TO lde_runtime;
GRANT SELECT ON engine_meta.schema_migrations TO lde_runtime;

CREATE TABLE lde_security.principals (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('human','service')),
  provider_user_id text UNIQUE REFERENCES lde_auth."user"(id),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  epoch integer NOT NULL DEFAULT 1 CHECK(epoch>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((kind='human')=(provider_user_id IS NOT NULL))
);
CREATE TABLE lde_security.memberships (
  tenant_id uuid NOT NULL REFERENCES lde.tenants(id),
  principal_id uuid NOT NULL REFERENCES lde_security.principals(id),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','revoked')),
  valid_from timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
  PRIMARY KEY(tenant_id,principal_id), CHECK(expires_at IS NULL OR expires_at>valid_from)
);
CREATE TABLE lde_security.role_grants (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL, principal_id uuid NOT NULL, event_id uuid,
  event_kind text GENERATED ALWAYS AS (CASE WHEN event_id IS NULL THEN NULL ELSE 'event' END) STORED,
  role text NOT NULL CHECK(role IN ('organizer','producer','moderator','timekeeper','debater','judge','audience','finance','oversight')),
  valid_from timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, revoked_at timestamptz,
  FOREIGN KEY(tenant_id,principal_id) REFERENCES lde_security.memberships(tenant_id,principal_id),
  FOREIGN KEY(tenant_id,event_id,event_kind) REFERENCES lde.subjects(tenant_id,entity_id,kind),
  UNIQUE NULLS NOT DISTINCT (tenant_id,principal_id,event_id,role),
  CHECK(expires_at IS NULL OR expires_at>valid_from)
);
CREATE TABLE lde_security.session_bindings (
  session_id text PRIMARY KEY REFERENCES lde_auth.session(id) ON DELETE CASCADE,
  principal_id uuid NOT NULL REFERENCES lde_security.principals(id),
  epoch integer NOT NULL CHECK(epoch>0)
);
CREATE TABLE lde_security.mfa_proofs (
  session_id text PRIMARY KEY REFERENCES lde_auth.session(id) ON DELETE CASCADE,
  principal_id uuid NOT NULL REFERENCES lde_security.principals(id),
  epoch integer NOT NULL CHECK(epoch>0), verified_at timestamptz NOT NULL,
  method text NOT NULL CHECK(method IN ('totp','recovery'))
);
CREATE TABLE lde_security.stepup_attempts (
  provider_user_id text PRIMARY KEY REFERENCES lde_auth."user"(id) ON DELETE CASCADE,
  window_started timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts>0)
);
CREATE TABLE lde_security.service_credentials (
  id uuid PRIMARY KEY, secret_digest bytea NOT NULL UNIQUE CHECK(octet_length(secret_digest)=32),
  principal_id uuid NOT NULL, tenant_id uuid NOT NULL, event_id uuid NOT NULL,
  event_kind text GENERATED ALWAYS AS ('event') STORED,
  epoch integer NOT NULL CHECK(epoch>0),
  profile text NOT NULL CHECK(profile IN ('transcription-worker','tally-worker','payout-worker')),
  actions text[] NOT NULL CHECK(cardinality(actions)>0 AND cardinality(actions)<=20),
  valid_from timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
  FOREIGN KEY(tenant_id,principal_id) REFERENCES lde_security.memberships(tenant_id,principal_id),
  FOREIGN KEY(tenant_id,event_id,event_kind) REFERENCES lde.subjects(tenant_id,entity_id,kind),
  CHECK(expires_at>valid_from AND expires_at<=valid_from+interval '24 hours')
);
CREATE TABLE lde_security.resource_owners (
  tenant_id uuid NOT NULL, entity_id uuid NOT NULL, kind text NOT NULL,
  principal_id uuid NOT NULL REFERENCES lde_security.principals(id),
  PRIMARY KEY(tenant_id,entity_id),
  FOREIGN KEY(tenant_id,entity_id,kind) REFERENCES lde.subjects(tenant_id,entity_id,kind),
  CHECK(kind IN ('scorecard','assignment','dispute','participant'))
);
CREATE TABLE lde_security.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  principal_id uuid REFERENCES lde_security.principals(id),
  event_code text NOT NULL CHECK(event_code IN ('mfa-verified','recovery-verified','identity-revoked','principal-created')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_audit_rows BEFORE UPDATE OR DELETE ON lde_security.audit_events
  FOR EACH ROW EXECUTE FUNCTION lde.reject_history_change();
CREATE TRIGGER immutable_audit_truncate BEFORE TRUNCATE ON lde_security.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION lde.reject_history_change();

CREATE TABLE lde_security.access_rules (
  action text PRIMARY KEY, scope text NOT NULL CHECK(scope IN ('tenant','event')),
  roles text[] NOT NULL, profiles text[] NOT NULL, ownership boolean NOT NULL, sensitive boolean NOT NULL
);
INSERT INTO lde_security.access_rules VALUES
('tenant.manage','tenant',ARRAY['organizer'],ARRAY[]::text[],false,true),
('event.read','event',ARRAY['organizer','producer','moderator','timekeeper','debater','judge','audience','finance','oversight'],ARRAY[]::text[],false,false),
('event.manage','event',ARRAY['organizer','producer'],ARRAY[]::text[],false,false),
('session.control','event',ARRAY['moderator'],ARRAY[]::text[],false,false),
('timer.control','event',ARRAY['moderator','timekeeper'],ARRAY[]::text[],false,false),
('media.control','event',ARRAY['producer'],ARRAY[]::text[],false,false),
('question.submit','event',ARRAY['audience'],ARRAY[]::text[],false,false),
('question.moderate','event',ARRAY['moderator','producer'],ARRAY[]::text[],false,false),
('ballot.cast-own','event',ARRAY['audience'],ARRAY[]::text[],true,false),
('scorecard.read-own','event',ARRAY['judge'],ARRAY[]::text[],true,false),
('scorecard.write-own','event',ARRAY['judge'],ARRAY[]::text[],true,false),
('result.verify','event',ARRAY['producer','oversight'],ARRAY[]::text[],false,true),
('result.publish','event',ARRAY['producer'],ARRAY[]::text[],false,true),
('prize.manage','event',ARRAY['finance'],ARRAY[]::text[],false,false),
('payout.approve','event',ARRAY['finance'],ARRAY[]::text[],false,true),
('dispute.review','event',ARRAY['oversight'],ARRAY[]::text[],false,true),
('ballot.read-sealed','event',ARRAY[]::text[],ARRAY['tally-worker'],false,false),
('tally.write','event',ARRAY[]::text[],ARRAY['tally-worker'],false,false),
('transcript.append','event',ARRAY[]::text[],ARRAY['transcription-worker'],false,false),
('payout.execute','event',ARRAY[]::text[],ARRAY['payout-worker'],false,false);

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA lde_security TO lde_guard;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA lde_security TO lde_guard;
DO $body$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='lde_security' LOOP
    EXECUTE format('ALTER TABLE lde_security.%I ENABLE ROW LEVEL SECURITY',item.tablename);
    EXECUTE format('ALTER TABLE lde_security.%I FORCE ROW LEVEL SECURITY',item.tablename);
    EXECUTE format('REVOKE ALL ON lde_security.%I FROM PUBLIC',item.tablename);
    EXECUTE format('CREATE POLICY guard_internal ON lde_security.%I TO lde_guard USING (true) WITH CHECK (true)',item.tablename);
  END LOOP;
END;
$body$;

CREATE FUNCTION lde_security.on_provider_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
BEGIN
  INSERT INTO lde_security.principals(id,kind,provider_user_id) VALUES(NEW.id::uuid,'human',NEW.id);
  INSERT INTO lde_security.audit_events(principal_id,event_code) VALUES(NEW.id::uuid,'principal-created');
  RETURN NEW;
END;
$body$;
CREATE FUNCTION lde_security.on_provider_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE p lde_security.principals;
BEGIN
  SELECT * INTO STRICT p FROM lde_security.principals WHERE provider_user_id=NEW."userId" AND kind='human' AND status='active';
  INSERT INTO lde_security.session_bindings(session_id,principal_id,epoch) VALUES(NEW.id,p.id,p.epoch);
  RETURN NEW;
END;
$body$;
CREATE TRIGGER bind_provider_user AFTER INSERT ON lde_auth."user" FOR EACH ROW EXECUTE FUNCTION lde_security.on_provider_user();
CREATE TRIGGER bind_provider_session AFTER INSERT ON lde_auth.session FOR EACH ROW EXECUTE FUNCTION lde_security.on_provider_session();

CREATE FUNCTION lde_security.provider_identity_enabled(user_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
 SELECT EXISTS(SELECT 1 FROM lde_security.principals WHERE provider_user_id=user_id AND kind='human' AND status='active');
$body$;
CREATE FUNCTION lde_security.provider_recent_proof(sid text,uid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
 SELECT EXISTS(SELECT 1 FROM lde_security.mfa_proofs f JOIN lde_security.principals p ON p.id=f.principal_id
 JOIN lde_auth.session s ON s.id=f.session_id JOIN lde_security.session_bindings b ON b.session_id=s.id
 WHERE f.session_id=sid AND s."userId"=uid AND p.provider_user_id=uid AND p.status='active'
 AND f.epoch=p.epoch AND b.epoch=p.epoch AND s."expiresAt">statement_timestamp()
 AND f.verified_at<=statement_timestamp() AND f.verified_at>statement_timestamp()-interval '15 minutes');
$body$;
CREATE FUNCTION lde_security.provider_attempt(uid text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE n integer;
BEGIN
  IF NOT lde_security.provider_identity_enabled(uid) THEN RETURN false; END IF;
  INSERT INTO lde_security.stepup_attempts(provider_user_id,window_started,attempts) VALUES(uid,clock_timestamp(),1)
  ON CONFLICT(provider_user_id) DO UPDATE SET
    attempts=CASE WHEN lde_security.stepup_attempts.window_started<=clock_timestamp()-interval '60 seconds' THEN 1 ELSE lde_security.stepup_attempts.attempts+1 END,
    window_started=CASE WHEN lde_security.stepup_attempts.window_started<=clock_timestamp()-interval '60 seconds' THEN clock_timestamp() ELSE lde_security.stepup_attempts.window_started END
  RETURNING attempts INTO n;
  RETURN n<=10;
END;
$body$;
CREATE FUNCTION lde_security.provider_revoke_identity(uid text,keep_session text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE p lde_security.principals;
BEGIN
  SELECT * INTO STRICT p FROM lde_security.principals WHERE provider_user_id=uid AND kind='human' FOR UPDATE;
  IF keep_session IS NOT NULL AND NOT EXISTS(SELECT 1 FROM lde_auth.session WHERE id=keep_session AND "userId"=uid AND "expiresAt">clock_timestamp()) THEN
    RAISE EXCEPTION 'Invalid retained session' USING ERRCODE='28000';
  END IF;
  UPDATE lde_security.principals SET epoch=epoch+1 WHERE id=p.id;
  DELETE FROM lde_auth.session WHERE "userId"=uid AND (keep_session IS NULL OR id<>keep_session);
  DELETE FROM lde_security.mfa_proofs WHERE principal_id=p.id;
  IF keep_session IS NOT NULL THEN UPDATE lde_security.session_bindings SET epoch=p.epoch+1 WHERE session_id=keep_session; END IF;
  INSERT INTO lde_security.audit_events(principal_id,event_code) VALUES(p.id,'identity-revoked');
END;
$body$;
CREATE FUNCTION lde_security.provider_record_proof(sid text,uid text,proof_method text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE p lde_security.principals;
BEGIN
  IF proof_method NOT IN ('totp','recovery') THEN RAISE EXCEPTION 'Invalid proof method'; END IF;
  SELECT * INTO STRICT p FROM lde_security.principals WHERE provider_user_id=uid AND status='active' AND kind='human' FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM lde_auth.session s JOIN lde_security.session_bindings b ON b.session_id=s.id
    JOIN lde_auth."user" u ON u.id=s."userId" WHERE s.id=sid AND s."userId"=uid
    AND s."expiresAt">clock_timestamp() AND b.epoch=p.epoch AND b.principal_id=p.id AND u."emailVerified"=true) THEN
    RAISE EXCEPTION 'Invalid proof session' USING ERRCODE='28000';
  END IF;
  IF proof_method='recovery' THEN
    PERFORM lde_security.provider_revoke_identity(uid,sid);
    SELECT * INTO STRICT p FROM lde_security.principals WHERE id=p.id;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM lde_auth."user" u JOIN lde_auth."twoFactor" f ON f."userId"=u.id
      WHERE u.id=uid AND u."twoFactorEnabled"=true AND f.verified=true) THEN
      RAISE EXCEPTION 'Unverified enrollment' USING ERRCODE='28000';
    END IF;
  END IF;
  INSERT INTO lde_security.mfa_proofs(session_id,principal_id,epoch,verified_at,method) VALUES(sid,p.id,p.epoch,clock_timestamp(),proof_method)
    ON CONFLICT(session_id) DO UPDATE SET principal_id=excluded.principal_id,epoch=excluded.epoch,verified_at=excluded.verified_at,method=excluded.method;
  DELETE FROM lde_security.stepup_attempts WHERE provider_user_id=uid;
  INSERT INTO lde_security.audit_events(principal_id,event_code) VALUES(p.id,CASE proof_method WHEN 'totp' THEN 'mfa-verified' ELSE 'recovery-verified' END);
END;
$body$;

-- A caller can SET arbitrary GUCs, so identity is NEVER read from an asserted user/tenant/role.
-- Only a live provider-session secret or a hashed, scoped service credential establishes identity.
CREATE FUNCTION lde_security.current_actor() RETURNS TABLE(
  principal_id uuid, kind text, session_id text, epoch integer, authenticated_at timestamptz,
  expires_at timestamptz, mfa_at timestamptz, service_tenant uuid, service_event uuid,
  service_profile text, service_actions text[]
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE credential text:=current_setting('lde.credential',true);
BEGIN
  IF credential IS NULL OR length(credential)<20 OR length(credential)>256 THEN RETURN; END IF;
  IF left(credential,4)='svc_' THEN
    RETURN QUERY SELECT p.id,p.kind,NULL::text,p.epoch,c.valid_from,c.expires_at,NULL::timestamptz,c.tenant_id,c.event_id,c.profile,c.actions
      FROM lde_security.service_credentials c JOIN lde_security.principals p ON p.id=c.principal_id
      WHERE c.secret_digest=sha256(convert_to(credential,'UTF8')) AND p.kind='service' AND p.status='active'
      AND c.epoch=p.epoch AND c.revoked_at IS NULL AND c.valid_from<=statement_timestamp() AND c.expires_at>statement_timestamp();
  ELSE
    RETURN QUERY SELECT p.id,p.kind,s.id,p.epoch,s."createdAt",s."expiresAt",
      CASE WHEN f.method='totp' AND f.epoch=p.epoch AND u."twoFactorEnabled"=true AND f.verified_at>=s."createdAt" AND f.verified_at<=statement_timestamp() THEN f.verified_at ELSE NULL END,
      NULL::uuid,NULL::uuid,NULL::text,ARRAY[]::text[]
      FROM lde_auth.session s JOIN lde_auth."user" u ON u.id=s."userId"
      JOIN lde_security.session_bindings b ON b.session_id=s.id JOIN lde_security.principals p ON p.id=b.principal_id
      LEFT JOIN lde_security.mfa_proofs f ON f.session_id=s.id AND f.principal_id=p.id
      WHERE s.token=credential AND p.provider_user_id=u.id AND p.kind='human' AND p.status='active'
      AND b.epoch=p.epoch AND u."emailVerified"=true AND s."createdAt"<=statement_timestamp() AND s."expiresAt">statement_timestamp();
  END IF;
END;
$body$;
CREATE FUNCTION lde_security.is_member(target_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
 SELECT EXISTS(SELECT 1 FROM lde_security.current_actor() a JOIN lde_security.memberships m ON m.principal_id=a.principal_id
 WHERE m.tenant_id=target_tenant AND m.status='active' AND m.valid_from<=statement_timestamp() AND (m.expires_at IS NULL OR m.expires_at>statement_timestamp())
 AND (a.kind='human' OR a.service_tenant=target_tenant));
$body$;
CREATE FUNCTION lde_security.has_access(requested_action text,target_tenant uuid,target_event uuid,owner_principal uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE a record; r lde_security.access_rules;
BEGIN
  SELECT * INTO a FROM lde_security.current_actor();
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO r FROM lde_security.access_rules WHERE action=requested_action;
  IF NOT FOUND OR NOT lde_security.is_member(target_tenant) OR ((r.scope='tenant')<>(target_event IS NULL)) THEN RETURN false; END IF;
  IF r.ownership AND owner_principal IS DISTINCT FROM a.principal_id THEN RETURN false; END IF;
  IF a.kind='service' THEN
    RETURN a.service_tenant=target_tenant AND a.service_event=target_event
      AND a.service_profile=ANY(r.profiles) AND requested_action=ANY(a.service_actions);
  END IF;
  RETURN EXISTS(SELECT 1 FROM lde_security.role_grants g WHERE g.principal_id=a.principal_id AND g.tenant_id=target_tenant
    AND g.event_id IS NOT DISTINCT FROM target_event AND g.role=ANY(r.roles) AND g.revoked_at IS NULL
    AND g.valid_from<=statement_timestamp() AND (g.expires_at IS NULL OR g.expires_at>statement_timestamp())
    AND (g.role IN ('audience','debater') OR (a.mfa_at IS NOT NULL AND a.mfa_at>statement_timestamp()-(CASE WHEN r.sensitive THEN interval '15 minutes' ELSE interval '8 hours' END))));
END;
$body$;
CREATE FUNCTION lde_security.can_read_entity(t uuid,e uuid,entity uuid,entity_kind text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE own uuid;
BEGIN
  CASE
    WHEN entity_kind IN ('tenant','series','motion','participant','team','ruleset','tournament') THEN RETURN lde_security.has_access('tenant.manage',t,NULL);
    WHEN entity_kind IN ('event','contract','session','poll','tournament-match') THEN RETURN lde_security.has_access('event.read',t,e);
    WHEN entity_kind='ballot' THEN RETURN lde_security.has_access('ballot.read-sealed',t,e);
    WHEN entity_kind IN ('audience-verdict','judges-verdict') THEN RETURN lde_security.has_access('result.verify',t,e);
    WHEN entity_kind='prize-obligation' THEN RETURN lde_security.has_access('prize.manage',t,e);
    WHEN entity_kind='dispute' THEN RETURN lde_security.has_access('dispute.review',t,e);
    WHEN entity_kind='assignment' THEN RETURN lde_security.has_access('event.manage',t,e);
    WHEN entity_kind='scorecard' THEN
      SELECT principal_id INTO own FROM lde_security.resource_owners WHERE tenant_id=t AND entity_id=entity AND kind='scorecard';
      RETURN own IS NOT NULL AND lde_security.has_access('scorecard.read-own',t,e,own);
    ELSE RETURN false;
  END CASE;
END;
$body$;

-- Function ownership and search paths are a reviewed privilege boundary, not a runtime bypass role.
DO $body$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lde_security' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO lde_guard',f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  END LOOP;
END;
$body$;
GRANT EXECUTE ON FUNCTION lde_security.provider_identity_enabled(text),lde_security.provider_recent_proof(text,text),
  lde_security.provider_attempt(text),lde_security.provider_record_proof(text,text,text),lde_security.provider_revoke_identity(text,text) TO lde_identity;
GRANT EXECUTE ON FUNCTION lde_security.current_actor(),lde_security.is_member(uuid),
  lde_security.has_access(text,uuid,uuid,uuid),lde_security.can_read_entity(uuid,uuid,uuid,text) TO lde_runtime;
GRANT SELECT ON lde.tenants,lde.subjects,lde.revisions,lde.revision_references TO lde_runtime;
CREATE POLICY member_tenant ON lde.tenants FOR SELECT TO lde_runtime USING(lde_security.is_member(id));
CREATE POLICY scoped_subject ON lde.subjects FOR SELECT TO lde_runtime USING(lde_security.can_read_entity(tenant_id,event_id,entity_id,kind));
CREATE POLICY scoped_revision ON lde.revisions FOR SELECT TO lde_runtime USING(lde_security.can_read_entity(tenant_id,event_id,entity_id,kind));
CREATE POLICY scoped_reference ON lde.revision_references FOR SELECT TO lde_runtime USING(EXISTS(
  SELECT 1 FROM lde.revisions r WHERE r.tenant_id=revision_references.tenant_id AND r.snapshot_id=revision_references.source_snapshot_id));
-- No generic domain write policies. Feature handlers must add narrowly scoped, tested write operations.
