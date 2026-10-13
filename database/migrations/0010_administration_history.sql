-- E08: immutable series, motion and event administration on the shared snapshot ledger.
CREATE FUNCTION lde_competition.admin_text(v jsonb,k text,minimum integer,maximum integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
DECLARE result text;
BEGIN
  result:=v->>k;
  IF result IS NULL OR length(btrim(result))<minimum OR length(result)>maximum OR result<>normalize(result,NFC)
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid administration text'; END IF;
  RETURN result;
END;
$body$;

CREATE FUNCTION lde_competition.admin_categories(v jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
DECLARE n integer;
BEGIN
  IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)<1 OR jsonb_array_length(v)>12
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid motion categories'; END IF;
  SELECT count(*) INTO n FROM jsonb_array_elements_text(v) item
   WHERE length(btrim(item)) BETWEEN 1 AND 80 AND item=normalize(item,NFC);
  IF n<>jsonb_array_length(v) OR
     (SELECT count(DISTINCT lower(item)) FROM jsonb_array_elements_text(v) item)<>n
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid motion categories'; END IF;
  RETURN v;
END;
$body$;

CREATE FUNCTION lde_competition.admin_envelope(r lde.revisions) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $body$
  SELECT jsonb_build_object('snapshot',r.canonical_record::jsonb,'contentHash',r.content_hash);
$body$;

CREATE FUNCTION lde_competition.save_series(t uuid,entity uuid,expected integer,d jsonb,c uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; intent jsonb:=jsonb_build_object('op','save-series','entity',entity,'expected',expected,'data',d);
 result jsonb; r lde.revisions; start_date date; end_date date; final_data jsonb;
BEGIN
 p:=lde_competition.authorize('tenant.manage',t,NULL); result:=lde_competition.replay(t,c,intent);
 p:=lde_competition.authorize('tenant.manage',t,NULL); IF result IS NOT NULL THEN RETURN result; END IF;
 IF jsonb_typeof(d)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(d) key)
    IS DISTINCT FROM ARRAY['endsOn','name','season','startsOn']::text[]
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid series fields'; END IF;
 PERFORM lde_competition.admin_text(d,'name',1,200);
 PERFORM lde_competition.admin_text(d,'season',1,120);
 BEGIN start_date:=(d->>'startsOn')::date; end_date:=(d->>'endsOn')::date;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid series dates'; END;
 IF start_date::text<>d->>'startsOn' OR end_date::text<>d->>'endsOn' OR end_date<start_date
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid series dates'; END IF;
 IF expected=0 AND (SELECT count(*) FROM lde.subjects WHERE tenant_id=t AND kind='series')>=100
 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='Series limit reached'; END IF;
 final_data:=d||jsonb_build_object('updatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedBy',p);
 r:=lde_competition.append_record(t,NULL,entity,'series',expected,final_data);
 result:=jsonb_build_object('current',lde_competition.admin_envelope(r),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'series-saved',entity,r.snapshot_id);
END;
$body$;

CREATE FUNCTION lde_competition.save_motion(t uuid,entity uuid,expected integer,d jsonb,c uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; intent jsonb:=jsonb_build_object('op','save-motion','entity',entity,'expected',expected,'data',d);
 result jsonb; r lde.revisions; prior lde.revisions; series_id uuid; final_data jsonb;
BEGIN
 p:=lde_competition.authorize('tenant.manage',t,NULL); result:=lde_competition.replay(t,c,intent);
 p:=lde_competition.authorize('tenant.manage',t,NULL); IF result IS NOT NULL THEN RETURN result; END IF;
 IF jsonb_typeof(d)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(d) key)
    IS DISTINCT FROM ARRAY['categories','description','seriesId','wording']::text[]
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid motion fields'; END IF;
 BEGIN series_id:=(d->>'seriesId')::uuid; EXCEPTION WHEN invalid_text_representation THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid series reference'; END;
 PERFORM lde_competition.admin_text(d,'wording',1,2000);
 PERFORM lde_competition.admin_text(d,'description',1,10000);
 PERFORM lde_competition.admin_categories(d->'categories');
 IF NOT EXISTS(SELECT 1 FROM lde.revisions x WHERE x.tenant_id=t AND x.entity_id=series_id AND x.kind='series'
   AND x.revision=(SELECT max(y.revision) FROM lde.revisions y WHERE y.tenant_id=t AND y.entity_id=series_id))
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Series unavailable'; END IF;
 SELECT * INTO prior FROM lde.revisions WHERE tenant_id=t AND entity_id=entity AND kind='motion' ORDER BY revision DESC LIMIT 1;
 IF prior.snapshot_id IS NOT NULL AND prior.canonical_record::jsonb#>>'{data,state}'<>'draft'
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Published motion requires amendment'; END IF;
 final_data:=d||jsonb_build_object('state','draft','amendment',NULL,'updatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedBy',p);
 r:=lde_competition.append_record(t,NULL,entity,'motion',expected,final_data);
 result:=jsonb_build_object('current',lde_competition.admin_envelope(r),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'motion-saved',entity,r.snapshot_id);
END;
$body$;

CREATE FUNCTION lde_competition.publish_motion(t uuid,entity uuid,expected integer,c uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; intent jsonb:=jsonb_build_object('op','publish-motion','entity',entity,'expected',expected);
 result jsonb; prior lde.revisions; r lde.revisions; final_data jsonb;
BEGIN
 p:=lde_competition.authorize('tenant.manage',t,NULL); result:=lde_competition.replay(t,c,intent);
 p:=lde_competition.authorize('tenant.manage',t,NULL); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO prior FROM lde.revisions WHERE tenant_id=t AND entity_id=entity AND kind='motion' ORDER BY revision DESC LIMIT 1 FOR UPDATE;
 IF prior.snapshot_id IS NULL OR prior.revision<>expected OR prior.canonical_record::jsonb#>>'{data,state}'<>'draft'
 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Motion publication conflict'; END IF;
 final_data:=(prior.canonical_record::jsonb->'data')||jsonb_build_object('state','published','updatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedBy',p);
 r:=lde_competition.append_record(t,NULL,entity,'motion',expected,final_data);
 result:=jsonb_build_object('current',lde_competition.admin_envelope(r),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'motion-published',entity,r.snapshot_id);
END;
$body$;

CREATE FUNCTION lde_competition.save_event_admin(t uuid,e uuid,expected integer,d jsonb,c uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; intent jsonb:=jsonb_build_object('op','save-event-admin','event',e,'expected',expected,'data',d);
 result jsonb; r lde.revisions; prior lde.revisions; motion lde.revisions; series_id uuid; motion_id uuid; motion_revision integer; final_data jsonb;
BEGIN
 IF expected=0 THEN p:=lde_competition.authorize('tenant.manage',t,NULL); ELSE p:=lde_competition.authorize('event.manage',t,e); END IF;
 result:=lde_competition.replay(t,c,intent);
 IF expected=0 THEN p:=lde_competition.authorize('tenant.manage',t,NULL); ELSE p:=lde_competition.authorize('event.manage',t,e); END IF;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF jsonb_typeof(d)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(d) key)
    IS DISTINCT FROM ARRAY['broadcastMode','motionId','motionRevision','seriesId','title','venue']::text[]
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid event administration fields'; END IF;
 BEGIN series_id:=(d->>'seriesId')::uuid; motion_id:=(d->>'motionId')::uuid; motion_revision:=(d->>'motionRevision')::integer;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid event references'; END;
 PERFORM lde_competition.admin_text(d,'title',1,240); PERFORM lde_competition.admin_text(d,'venue',1,500);
 IF d->>'broadcastMode' NOT IN ('none','private-stream','public-stream','prerecorded')
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid broadcast mode'; END IF;
 SELECT * INTO motion FROM lde.revisions WHERE tenant_id=t AND entity_id=motion_id AND kind='motion' AND revision=motion_revision;
 IF motion.snapshot_id IS NULL OR motion.canonical_record::jsonb#>>'{data,state}'<>'published'
   OR motion.canonical_record::jsonb#>>'{data,seriesId}'<>series_id::text
   OR EXISTS(SELECT 1 FROM lde.revisions newer WHERE newer.tenant_id=t AND newer.entity_id=motion_id AND newer.revision>motion_revision)
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Published motion revision unavailable'; END IF;
 SELECT * INTO prior FROM lde.revisions WHERE tenant_id=t AND entity_id=e AND kind='event' ORDER BY revision DESC LIMIT 1;
 IF prior.snapshot_id IS NOT NULL AND prior.canonical_record::jsonb#>>'{data,state}'='published'
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Published event is amendment-only'; END IF;
 final_data:=d||jsonb_build_object('state','draft','updatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedBy',p);
 r:=lde_competition.append_record(t,e,e,'event',expected,final_data);
 result:=jsonb_build_object('current',lde_competition.admin_envelope(r),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'event-administration-saved',e,r.snapshot_id);
END;
$body$;

CREATE FUNCTION lde_competition.publish_event_admin(t uuid,e uuid,expected integer,c uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; intent jsonb:=jsonb_build_object('op','publish-event-admin','event',e,'expected',expected);
 result jsonb; prior lde.revisions; r lde.revisions; final_data jsonb;
BEGIN
 p:=lde_competition.authorize('event.manage',t,e); result:=lde_competition.replay(t,c,intent);
 p:=lde_competition.authorize('event.manage',t,e); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO prior FROM lde.revisions WHERE tenant_id=t AND entity_id=e AND kind='event' ORDER BY revision DESC LIMIT 1 FOR UPDATE;
 IF prior.snapshot_id IS NULL OR prior.revision<>expected OR prior.canonical_record::jsonb#>>'{data,state}'<>'draft'
 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Event publication conflict'; END IF;
 final_data:=(prior.canonical_record::jsonb->'data')||jsonb_build_object('state','published','updatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedBy',p);
 r:=lde_competition.append_record(t,e,e,'event',expected,final_data);
 result:=jsonb_build_object('current',lde_competition.admin_envelope(r),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'event-administration-published',e,r.snapshot_id);
END;
$body$;

CREATE FUNCTION lde_competition.amend_published_motion(t uuid,e uuid,motion_id uuid,expected_motion integer,expected_event integer,d jsonb,c uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; intent jsonb:=jsonb_build_object('op','amend-published-motion','event',e,'motion',motion_id,'expectedMotion',expected_motion,'expectedEvent',expected_event,'data',d);
 result jsonb; old_motion lde.revisions; old_event lde.revisions; new_motion lde.revisions; new_event lde.revisions; motion_data jsonb; event_data jsonb; reason text; at_text text;
BEGIN
 PERFORM lde_competition.authorize('tenant.manage',t,NULL); p:=lde_competition.authorize('event.manage',t,e);
 result:=lde_competition.replay(t,c,intent);
 PERFORM lde_competition.authorize('tenant.manage',t,NULL); p:=lde_competition.authorize('event.manage',t,e);
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF jsonb_typeof(d)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(d) key)
    IS DISTINCT FROM ARRAY['categories','description','reason','wording']::text[]
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid amendment fields'; END IF;
 reason:=lde_competition.admin_text(d,'reason',10,2000);
 PERFORM lde_competition.admin_text(d,'wording',1,2000); PERFORM lde_competition.admin_text(d,'description',1,10000);
 PERFORM lde_competition.admin_categories(d->'categories');
 SELECT * INTO old_motion FROM lde.revisions WHERE tenant_id=t AND entity_id=motion_id AND kind='motion' ORDER BY revision DESC LIMIT 1 FOR UPDATE;
 SELECT * INTO old_event FROM lde.revisions WHERE tenant_id=t AND entity_id=e AND kind='event' ORDER BY revision DESC LIMIT 1 FOR UPDATE;
 IF old_motion.revision IS DISTINCT FROM expected_motion OR old_event.revision IS DISTINCT FROM expected_event
   OR old_motion.canonical_record::jsonb#>>'{data,state}'<>'published' OR old_event.canonical_record::jsonb#>>'{data,state}'<>'published'
   OR old_event.canonical_record::jsonb#>>'{data,motionId}'<>motion_id::text
   OR (old_event.canonical_record::jsonb#>>'{data,motionRevision}')::integer<>expected_motion
 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Amendment revision conflict'; END IF;
 IF old_motion.canonical_record::jsonb#>>'{data,wording}'=d->>'wording'
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Amendment must change wording'; END IF;
 at_text:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 motion_data:=(old_motion.canonical_record::jsonb->'data')||jsonb_build_object(
   'wording',d->>'wording','description',d->>'description','categories',d->'categories','state','published',
   'amendment',jsonb_build_object('reason',reason,'previousRevision',expected_motion),'updatedAt',at_text,'updatedBy',p);
 new_motion:=lde_competition.append_record(t,NULL,motion_id,'motion',expected_motion,motion_data);
 event_data:=(old_event.canonical_record::jsonb->'data')||jsonb_build_object('motionRevision',new_motion.revision,'updatedAt',at_text,'updatedBy',p);
 new_event:=lde_competition.append_record(t,e,e,'event',expected_event,event_data);
 result:=jsonb_build_object('motion',lde_competition.admin_envelope(new_motion),'event',lde_competition.admin_envelope(new_event),
   'amendment',jsonb_build_object('eventId',e,'fromRevision',expected_motion,'toRevision',new_motion.revision,
   'previousWording',old_motion.canonical_record::jsonb#>>'{data,wording}','replacementWording',d->>'wording',
   'reason',reason,'amendedAt',at_text,'amendedBy',p),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'published-motion-amended',e,new_event.snapshot_id);
END;
$body$;

DO $body$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='lde_competition' AND p.proname IN ('admin_text','admin_categories','admin_envelope','save_series','save_motion','publish_motion','save_event_admin','publish_event_admin','amend_published_motion')
 LOOP
   EXECUTE format('ALTER FUNCTION %s OWNER TO lde_guard',f.signature);
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
 END LOOP;
END;
$body$;
GRANT EXECUTE ON FUNCTION lde_competition.save_series(uuid,uuid,integer,jsonb,uuid),
 lde_competition.save_motion(uuid,uuid,integer,jsonb,uuid),
 lde_competition.publish_motion(uuid,uuid,integer,uuid),
 lde_competition.save_event_admin(uuid,uuid,integer,jsonb,uuid),
 lde_competition.publish_event_admin(uuid,uuid,integer,uuid),
 lde_competition.amend_published_motion(uuid,uuid,uuid,integer,integer,jsonb,uuid) TO lde_runtime;
