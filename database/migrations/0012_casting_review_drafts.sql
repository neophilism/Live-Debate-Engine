-- E09 draft storage only. These records never grant a role or authorize an event.
CREATE SCHEMA lde_casting AUTHORIZATION lde_guard;
REVOKE ALL ON SCHEMA lde_casting FROM PUBLIC;
GRANT USAGE ON SCHEMA lde_casting TO lde_runtime;
CREATE TABLE lde_casting.commands (
 tenant_id uuid NOT NULL REFERENCES lde.tenants(id), command_id uuid NOT NULL,
 principal_id uuid NOT NULL REFERENCES lde_security.principals(id), intent jsonb NOT NULL, result jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,command_id)
);
CREATE TABLE lde_casting.reviews (
 tenant_id uuid NOT NULL, event_id uuid NOT NULL, candidate_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), eligible boolean NOT NULL, available boolean NOT NULL, conflict_clear boolean NOT NULL,
 expires_at timestamptz NOT NULL, reason text NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 2000),
 reviewed_by uuid NOT NULL REFERENCES lde_security.principals(id), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,event_id,candidate_id,revision),
 FOREIGN KEY(tenant_id,candidate_id) REFERENCES lde_security.memberships(tenant_id,principal_id),
 FOREIGN KEY(tenant_id,event_id) REFERENCES lde.subjects(tenant_id,entity_id)
);
CREATE TABLE lde_casting.drafts (
 tenant_id uuid NOT NULL, event_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 entries jsonb NOT NULL CHECK(jsonb_typeof(entries)='array' AND jsonb_array_length(entries) BETWEEN 3 AND 100),
 reviewed_versions jsonb NOT NULL, recorded_by uuid NOT NULL REFERENCES lde_security.principals(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,event_id,revision),
 FOREIGN KEY(tenant_id,event_id) REFERENCES lde.subjects(tenant_id,entity_id)
);
DO $body$
DECLARE n text;
BEGIN
 FOREACH n IN ARRAY ARRAY['commands','reviews','drafts'] LOOP
  EXECUTE format('ALTER TABLE lde_casting.%I OWNER TO lde_guard',n);
  EXECUTE format('ALTER TABLE lde_casting.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE lde_casting.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON lde_casting.%I FROM PUBLIC,lde_runtime,lde_identity',n);
  EXECUTE format('CREATE POLICY guard_internal ON lde_casting.%I TO lde_guard USING(true) WITH CHECK(true)',n);
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON lde_casting.%I FOR EACH ROW EXECUTE FUNCTION lde.reject_history_change()',n);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON lde_casting.%I FOR EACH STATEMENT EXECUTE FUNCTION lde.reject_history_change()',n);
 END LOOP;
END;
$body$;
CREATE FUNCTION lde_casting.authorize(t uuid,e uuid) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
DECLARE actor uuid;
BEGIN
 PERFORM lde_competition.authorize('tenant.manage',t,NULL);
 actor:=lde_competition.authorize('event.manage',t,e);
 IF NOT EXISTS(SELECT 1 FROM lde.subjects WHERE tenant_id=t AND entity_id=e AND kind='event')
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Casting unavailable'; END IF;
 -- All review/draft commands for the event serialize, before version checks.
 PERFORM pg_advisory_xact_lock(hashtextextended('lde:casting:'||t::text||':'||e::text,0));
 RETURN actor;
END;
$body$;
CREATE FUNCTION lde_casting.member(t uuid,p uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
BEGIN
 PERFORM 1 FROM lde_security.memberships m JOIN lde_security.principals a ON a.id=m.principal_id
 WHERE m.tenant_id=t AND m.principal_id=p AND m.status='active' AND a.status='active' AND a.kind='human'
  AND m.valid_from<=clock_timestamp() AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE OF m,a;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Candidate unavailable'; END IF;
END;
$body$;
CREATE FUNCTION lde_casting.replay(t uuid,c uuid,p uuid,i jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
DECLARE prior lde_casting.commands;
BEGIN
 IF c IS NULL OR c::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid casting command'; END IF;
 -- A command ID cannot race across two different events in the same tenant.
 PERFORM pg_advisory_xact_lock(hashtextextended('lde:casting-command:'||t::text||':'||c::text,0));
 SELECT * INTO prior FROM lde_casting.commands WHERE tenant_id=t AND command_id=c;
 IF FOUND THEN
  IF prior.principal_id IS DISTINCT FROM p OR prior.intent IS DISTINCT FROM i THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Casting command conflict'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 RETURN NULL;
END;
$body$;
CREATE FUNCTION lde_casting.review(t uuid,e uuid,candidate uuid,expected integer,d jsonb,c uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; prior integer; expires timestamptz; intent jsonb; result jsonb; row lde_casting.reviews;
BEGIN
 p:=lde_casting.authorize(t,e); PERFORM lde_casting.member(t,candidate);
 IF p=candidate THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Another organizer must review this candidate'; END IF;
 intent:=jsonb_build_object('op','review','event',e,'candidate',candidate,'expected',expected,'data',d);
 result:=lde_casting.replay(t,c,p,intent); IF result IS NOT NULL THEN RETURN result; END IF;
 IF expected IS NULL OR expected<0 OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR
  (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(d) key) IS DISTINCT FROM ARRAY['available','conflictClear','eligible','expiresAt','reason']::text[]
  OR jsonb_typeof(d->'eligible') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'available') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(d->'conflictClear') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string'
  OR char_length(d->>'reason') NOT BETWEEN 10 AND 2000 OR btrim(d->>'reason')='' OR jsonb_typeof(d->'expiresAt') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid casting review'; END IF;
 expires:=(d->>'expiresAt')::timestamptz;
 IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '366 days'
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid review expiry'; END IF;
 SELECT COALESCE(max(revision),0) INTO prior FROM lde_casting.reviews WHERE tenant_id=t AND event_id=e AND candidate_id=candidate;
 IF prior<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Review revision conflict'; END IF;
 INSERT INTO lde_casting.reviews VALUES(t,e,candidate,prior+1,(d->>'eligible')::boolean,(d->>'available')::boolean,(d->>'conflictClear')::boolean,expires,d->>'reason',p,clock_timestamp()) RETURNING * INTO row;
 result:=jsonb_build_object('review',to_jsonb(row),'replayed',false,'operational',false);
 INSERT INTO lde_casting.commands(tenant_id,command_id,principal_id,intent,result) VALUES(t,c,p,intent,result);
 RETURN result;
END;
$body$;
CREATE FUNCTION lde_casting.save_draft(t uuid,e uuid,expected integer,items jsonb,c uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; intent jsonb; result jsonb; item jsonb; candidate uuid; team uuid; review lde_casting.reviews;
 prior integer; seen uuid[]:='{}'; for_team uuid; against_team uuid; judges integer:=0; moderators integer:=0; idx integer; side_count integer; versions jsonb:='{}'; role text; pos integer; positions text[]:='{}'; slot text;
BEGIN
 p:=lde_casting.authorize(t,e); intent:=jsonb_build_object('op','draft','event',e,'expected',expected,'entries',items);
 result:=lde_casting.replay(t,c,p,intent); IF result IS NOT NULL THEN RETURN result; END IF;
 IF expected IS NULL OR expected<0 OR jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items) NOT BETWEEN 3 AND 100
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid roster draft'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) ORDER BY value->>'principalId' LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR
    (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item) key) IS DISTINCT FROM ARRAY['position','principalId','role','side','teamId']::text[]
   THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid roster entry'; END IF;
  candidate:=(item->>'principalId')::uuid; role:=item->>'role'; team:=(item->>'teamId')::uuid;
  IF candidate IS NULL OR candidate=ANY(seen) OR role IS NULL OR role NOT IN ('debater','judge','moderator')
   THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid roster identity or role'; END IF;
  seen:=array_append(seen,candidate); PERFORM lde_casting.member(t,candidate);
  SELECT * INTO review FROM lde_casting.reviews WHERE tenant_id=t AND event_id=e AND candidate_id=candidate ORDER BY revision DESC LIMIT 1;
  IF review.revision IS NULL OR NOT review.eligible OR NOT review.available OR NOT review.conflict_clear OR review.expires_at<=clock_timestamp()
   THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Current candidate review required'; END IF;
  versions:=versions||jsonb_build_object(candidate::text,review.revision);
  IF role='debater' THEN
   IF team IS NULL OR item->>'side' IS NULL OR item->>'side' NOT IN ('for','against') OR jsonb_typeof(item->'position') IS DISTINCT FROM 'number'
    THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid speaker slot'; END IF;
   pos:=(item->>'position')::integer; IF pos NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid speaker position'; END IF;
   slot:=(item->>'side')||':'||pos::text;
   IF slot=ANY(positions) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate speaker position'; END IF; positions:=array_append(positions,slot);
   IF NOT EXISTS(SELECT 1 FROM lde.subjects WHERE tenant_id=t AND entity_id=team AND kind='team') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Team unavailable'; END IF;
   PERFORM 1 FROM lde.subjects WHERE tenant_id=t AND entity_id=team FOR SHARE;
   PERFORM 1 FROM lde_security.resource_owners WHERE tenant_id=t AND principal_id=candidate AND kind='participant' FOR SHARE;
   IF NOT EXISTS(
     SELECT 1 FROM lde_security.resource_owners o JOIN LATERAL (
       SELECT canonical_record::jsonb->'data' AS data FROM lde.revisions WHERE tenant_id=t AND entity_id=team AND kind='team' ORDER BY revision DESC LIMIT 1
     ) r ON true
     WHERE o.tenant_id=t AND o.principal_id=candidate AND o.kind='participant'
       AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.data->'members') member WHERE member->>'entityId'=o.entity_id::text)
   ) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Speaker is not a verified team member'; END IF;
   IF item->>'side'='for' THEN
    IF for_team IS NOT NULL AND for_team<>team THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Inconsistent team'; END IF; for_team:=team;
   ELSE
    IF against_team IS NOT NULL AND against_team<>team THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Inconsistent team'; END IF; against_team:=team;
   END IF;
  ELSE
   IF item->'teamId' IS DISTINCT FROM 'null'::jsonb OR item->'side' IS DISTINCT FROM 'null'::jsonb OR item->'position' IS DISTINCT FROM 'null'::jsonb
    THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Non-speakers cannot occupy team slots'; END IF;
   IF role='judge' THEN judges:=judges+1; ELSE moderators:=moderators+1; END IF;
  END IF;
 END LOOP;
 IF for_team IS NULL OR against_team IS NULL OR for_team=against_team OR judges NOT BETWEEN 1 AND 21 OR moderators>1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Two sides and a judge are required'; END IF;
 FOREACH role IN ARRAY ARRAY['for','against'] LOOP
  SELECT count(*)::integer INTO side_count FROM jsonb_array_elements(items) i WHERE i->>'role'='debater' AND i->>'side'=role;
  FOR idx IN 1..side_count LOOP
   IF NOT (role||':'||idx::text)=ANY(positions) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Speaking positions must be consecutive'; END IF;
  END LOOP;
 END LOOP;
 SELECT COALESCE(max(revision),0) INTO prior FROM lde_casting.drafts WHERE tenant_id=t AND event_id=e;
 IF prior<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Roster draft revision conflict'; END IF;
 INSERT INTO lde_casting.drafts VALUES(t,e,prior+1,items,versions,p,clock_timestamp());
 result:=jsonb_build_object('revision',prior+1,'entries',items,'reviewVersions',versions,'operational',false,'replayed',false);
 INSERT INTO lde_casting.commands(tenant_id,command_id,principal_id,intent,result) VALUES(t,c,p,intent,result);
 RETURN result;
END;
$body$;
CREATE FUNCTION lde_casting.workspace(t uuid,e uuid,before_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE result jsonb; reviews jsonb; next_candidate uuid; more boolean;
BEGIN
 PERFORM lde_casting.authorize(t,e);
 SELECT jsonb_build_object('draft',to_jsonb(d),'operational',false) INTO result FROM lde_casting.drafts d WHERE tenant_id=t AND event_id=e ORDER BY revision DESC LIMIT 1;
 WITH latest AS (
   SELECT DISTINCT ON(candidate_id) * FROM lde_casting.reviews WHERE tenant_id=t AND event_id=e AND (before_id IS NULL OR candidate_id<before_id)
   ORDER BY candidate_id DESC,revision DESC
 ), page AS (SELECT * FROM latest ORDER BY candidate_id DESC LIMIT 51), visible AS (SELECT * FROM page ORDER BY candidate_id DESC LIMIT 50)
 SELECT COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY candidate_id DESC) FROM visible v),'[]'::jsonb),
  (SELECT count(*)>50 FROM page),(SELECT candidate_id FROM visible ORDER BY candidate_id LIMIT 1)
 INTO reviews,more,next_candidate;
 RETURN COALESCE(result,jsonb_build_object('draft',NULL,'operational',false))||jsonb_build_object('reviews',reviews,'nextCandidate',CASE WHEN more THEN next_candidate ELSE NULL END);
END;
$body$;
DO $body$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lde_casting' LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO lde_guard',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,lde_runtime,lde_identity',f.signature);
 END LOOP;
END;
$body$;
GRANT EXECUTE ON FUNCTION lde_casting.review(uuid,uuid,uuid,integer,jsonb,uuid),lde_casting.save_draft(uuid,uuid,integer,jsonb,uuid),lde_casting.workspace(uuid,uuid,uuid) TO lde_runtime;
