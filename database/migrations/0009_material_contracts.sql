-- E07: immutable material terms; credential-bound operations, not live registration.
DO $body$ BEGIN IF current_setting('server_encoding')<>'UTF8' THEN RAISE EXCEPTION 'UTF8 database encoding is required for canonical material records'; END IF; END; $body$;
CREATE SCHEMA lde_competition;
REVOKE ALL ON SCHEMA lde_competition FROM PUBLIC;
GRANT USAGE ON SCHEMA lde_competition TO lde_guard,lde_runtime;

CREATE FUNCTION lde_competition.valid_shape(v jsonb,s jsonb,depth integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
DECLARE k text; x jsonb; typ text; txt text; n numeric; text_units integer;
BEGIN
  IF v IS NULL OR depth>32 THEN RETURN false; END IF;
  IF v='null'::jsonb THEN RETURN coalesce((s->>'nullable')::boolean,false); END IF;
  IF s ? 'const' THEN RETURN v=s->'const'; END IF;
  IF s ? 'enum' THEN RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(s->'enum') a WHERE a.value=v); END IF;
  typ:=s->>'type';
  IF typ='object' THEN
    IF jsonb_typeof(v)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v))<>(SELECT count(*) FROM jsonb_object_keys(s->'properties')) THEN RETURN false; END IF;
    FOR k,x IN SELECT key,value FROM jsonb_each(s->'properties') LOOP
      IF NOT lde_competition.valid_shape(v->k,x,depth+1) THEN RETURN false; END IF;
    END LOOP; RETURN true;
  ELSIF typ='array' THEN
    IF jsonb_typeof(v)<>'array' THEN RETURN false; END IF;
    IF jsonb_array_length(v)<(s->>'min')::int OR jsonb_array_length(v)>(s->>'max')::int THEN RETURN false; END IF;
    FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP IF NOT lde_competition.valid_shape(x,s->'items',depth+1) THEN RETURN false; END IF; END LOOP; RETURN true;
  ELSIF typ='integer' THEN
    IF jsonb_typeof(v)<>'number' THEN RETURN false; END IF;
    n:=v::numeric; RETURN n=trunc(n) AND n>=(s->>'min')::numeric AND n<=(s->>'max')::numeric;
  ELSIF typ IN ('string','timestamp') THEN
    IF jsonb_typeof(v)<>'string' THEN RETURN false; END IF;
    txt:=v#>>'{}';
    IF typ='timestamp' THEN
      RETURN txt ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
        AND to_char(txt::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=txt;
    END IF;
    SELECT coalesce(sum(CASE WHEN ch='' THEN 0 WHEN ascii(ch)>65535 THEN 2 ELSE 1 END),0) INTO text_units FROM regexp_split_to_table(txt,'') ch;
    RETURN text_units>=(s->>'min')::int AND text_units<=(s->>'max')::int
      AND length(translate(txt,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF',''))>0
      AND (NOT s ? 'pattern' OR txt ~ (s->>'pattern'));
  END IF; RETURN false;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END;
$body$;

CREATE FUNCTION lde_competition.ruleset_shape(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
 SELECT lde_competition.valid_shape(v,$shape${"type":"object","properties":{"name":{"type":"string","min":1,"max":240},"materialVersion":{"const":2},"profile":{"const":"motion-debate-v1"},"amendmentReason":{"type":"string","min":10,"max":1000,"nullable":true},"rubric":{"type":"array","items":{"type":"object","properties":{"code":{"type":"string","min":1,"max":64,"pattern":"^[a-z][a-z0-9-]*$"},"label":{"type":"string","min":1,"max":120},"weightBps":{"type":"integer","min":1,"max":10000},"minimum":{"type":"integer","min":0,"max":10000},"maximum":{"type":"integer","min":1,"max":10000}}},"min":1,"max":20},"timing":{"type":"object","properties":{"openingPerSideSeconds":{"type":"integer","min":1,"max":7200},"discussionSeconds":{"type":"integer","min":1,"max":14400},"questionsSeconds":{"type":"integer","min":1,"max":14400},"closingPerSideSeconds":{"type":"integer","min":1,"max":7200}}},"electorate":{"type":"object","properties":{"cohort":{"const":"paired-valid"},"denominator":{"const":"all-valid-including-undecided"},"channels":{"enum":["separate","combined"]},"interimDisclosure":{"const":false}}},"judging":{"type":"object","properties":{"mode":{"enum":["human","advisory","hybrid","ai"]},"aggregation":{"enum":["mean","sum","majority"]},"requiredSeats":{"type":"integer","min":1,"max":21}}},"standardPrize":{"type":"object","properties":{"audienceShareBps":{"const":5000},"judgesShareBps":{"const":5000},"tiePolicy":{"enum":["split-share","review"]}}},"advancement":{"type":"object","properties":{"primary":{"const":"audience"},"audienceTie":{"enum":["judges","review","rematch"]}}},"deadlines":{"type":"object","properties":{"aiReviewHours":{"type":"integer","min":1,"max":8760},"outcomeDisputeHours":{"type":"integer","min":1,"max":8760},"paymentTargetDays":{"type":"integer","min":1,"max":3650},"paymentDeadlineDays":{"type":"integer","min":1,"max":3650}}},"voting":{"type":"object","properties":{"preWindowSeconds":{"type":"integer","min":30,"max":3600},"postWindowSeconds":{"type":"integer","min":30,"max":3600},"remoteDelaySeconds":{"type":"integer","min":0,"max":600},"lateArrival":{"const":"spectator-only"},"missingPost":{"const":"exclude-unpaired"},"choices":{"const":["for","against","undecided"]}}},"conduct":{"type":"object","properties":{"graceSeconds":{"type":"integer","min":0,"max":300},"noNewClosingArguments":{"const":true},"noOutsideCoaching":{"const":true}}},"adjustments":{"type":"object","properties":{"penaltyMaxPerFinding":{"type":"integer","min":0,"max":10},"penaltyTotalCap":{"type":"integer","min":0,"max":100},"bonusMaxPerFinding":{"type":"integer","min":0,"max":10},"bonusTotalCap":{"type":"integer","min":0,"max":100},"evidenceRequired":{"const":true},"noDoubleCounting":{"const":true}}},"judgesPrizeAllocation":{"enum":["winner-take-all","proportional"]},"judgeWeighting":{"const":"equal"},"teamPrizeSplit":{"enum":["equal","unanimous-custom"]},"judgesTie":{"enum":["split-share","review"]},"inconclusive":{"const":"hold-for-review"},"allSeatsRequired":{"const":true},"competitorEntryFeeMinorUnits":{"const":"0"}}}$shape$::jsonb);
$body$;

CREATE FUNCTION lde_competition.contract_shape(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
 SELECT lde_competition.valid_shape(v,$shape${"type":"object","properties":{"materialVersion":{"const":2},"eventRef":{"type":"object","properties":{"refType":{"const":"snapshot"},"kind":{"const":"event"},"tenantId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"entityId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"eventId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$","nullable":true},"snapshotId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"revision":{"type":"integer","min":1,"max":2147483647}}},"motionRef":{"type":"object","properties":{"refType":{"const":"snapshot"},"kind":{"const":"motion"},"tenantId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"entityId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"eventId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$","nullable":true},"snapshotId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"revision":{"type":"integer","min":1,"max":2147483647}}},"rulesetRef":{"type":"object","properties":{"refType":{"const":"snapshot"},"kind":{"const":"ruleset"},"tenantId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"entityId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"eventId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$","nullable":true},"snapshotId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"revision":{"type":"integer","min":1,"max":2147483647}}},"forTeamRef":{"type":"object","properties":{"refType":{"const":"snapshot"},"kind":{"const":"team"},"tenantId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"entityId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"eventId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$","nullable":true},"snapshotId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"revision":{"type":"integer","min":1,"max":2147483647}}},"againstTeamRef":{"type":"object","properties":{"refType":{"const":"snapshot"},"kind":{"const":"team"},"tenantId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"entityId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"eventId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$","nullable":true},"snapshotId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"revision":{"type":"integer","min":1,"max":2147483647}}},"prizeBudget":{"type":"object","properties":{"currency":{"type":"string","min":3,"max":3,"pattern":"^[A-Z]{3}$"},"minorUnits":{"type":"string","min":1,"max":19,"pattern":"^(0|[1-9][0-9]*)$"},"exponent":{"type":"integer","min":0,"max":6}}},"startsAt":{"type":"timestamp"},"timeZone":{"enum":["UTC","Africa/Abidjan","Africa/Accra","Africa/Addis_Ababa","Africa/Algiers","Africa/Asmera","Africa/Bamako","Africa/Bangui","Africa/Banjul","Africa/Bissau","Africa/Blantyre","Africa/Brazzaville","Africa/Bujumbura","Africa/Cairo","Africa/Casablanca","Africa/Ceuta","Africa/Conakry","Africa/Dakar","Africa/Dar_es_Salaam","Africa/Djibouti","Africa/Douala","Africa/El_Aaiun","Africa/Freetown","Africa/Gaborone","Africa/Harare","Africa/Johannesburg","Africa/Juba","Africa/Kampala","Africa/Khartoum","Africa/Kigali","Africa/Kinshasa","Africa/Lagos","Africa/Libreville","Africa/Lome","Africa/Luanda","Africa/Lubumbashi","Africa/Lusaka","Africa/Malabo","Africa/Maputo","Africa/Maseru","Africa/Mbabane","Africa/Mogadishu","Africa/Monrovia","Africa/Nairobi","Africa/Ndjamena","Africa/Niamey","Africa/Nouakchott","Africa/Ouagadougou","Africa/Porto-Novo","Africa/Sao_Tome","Africa/Tripoli","Africa/Tunis","Africa/Windhoek","America/Adak","America/Anchorage","America/Anguilla","America/Antigua","America/Araguaina","America/Argentina/La_Rioja","America/Argentina/Rio_Gallegos","America/Argentina/Salta","America/Argentina/San_Juan","America/Argentina/San_Luis","America/Argentina/Tucuman","America/Argentina/Ushuaia","America/Aruba","America/Asuncion","America/Bahia","America/Bahia_Banderas","America/Barbados","America/Belem","America/Belize","America/Blanc-Sablon","America/Boa_Vista","America/Bogota","America/Boise","America/Buenos_Aires","America/Cambridge_Bay","America/Campo_Grande","America/Cancun","America/Caracas","America/Catamarca","America/Cayenne","America/Cayman","America/Chicago","America/Chihuahua","America/Ciudad_Juarez","America/Coral_Harbour","America/Cordoba","America/Costa_Rica","America/Coyhaique","America/Creston","America/Cuiaba","America/Curacao","America/Danmarkshavn","America/Dawson","America/Dawson_Creek","America/Denver","America/Detroit","America/Dominica","America/Edmonton","America/Eirunepe","America/El_Salvador","America/Fort_Nelson","America/Fortaleza","America/Glace_Bay","America/Godthab","America/Goose_Bay","America/Grand_Turk","America/Grenada","America/Guadeloupe","America/Guatemala","America/Guayaquil","America/Guyana","America/Halifax","America/Havana","America/Hermosillo","America/Indiana/Knox","America/Indiana/Marengo","America/Indiana/Petersburg","America/Indiana/Tell_City","America/Indiana/Vevay","America/Indiana/Vincennes","America/Indiana/Winamac","America/Indianapolis","America/Inuvik","America/Iqaluit","America/Jamaica","America/Jujuy","America/Juneau","America/Kentucky/Monticello","America/Kralendijk","America/La_Paz","America/Lima","America/Los_Angeles","America/Louisville","America/Lower_Princes","America/Maceio","America/Managua","America/Manaus","America/Marigot","America/Martinique","America/Matamoros","America/Mazatlan","America/Mendoza","America/Menominee","America/Merida","America/Metlakatla","America/Mexico_City","America/Miquelon","America/Moncton","America/Monterrey","America/Montevideo","America/Montserrat","America/Nassau","America/New_York","America/Nome","America/Noronha","America/North_Dakota/Beulah","America/North_Dakota/Center","America/North_Dakota/New_Salem","America/Ojinaga","America/Panama","America/Paramaribo","America/Phoenix","America/Port-au-Prince","America/Port_of_Spain","America/Porto_Velho","America/Puerto_Rico","America/Punta_Arenas","America/Rankin_Inlet","America/Recife","America/Regina","America/Resolute","America/Rio_Branco","America/Santarem","America/Santiago","America/Santo_Domingo","America/Sao_Paulo","America/Scoresbysund","America/Sitka","America/St_Barthelemy","America/St_Johns","America/St_Kitts","America/St_Lucia","America/St_Thomas","America/St_Vincent","America/Swift_Current","America/Tegucigalpa","America/Thule","America/Tijuana","America/Toronto","America/Tortola","America/Vancouver","America/Whitehorse","America/Winnipeg","America/Yakutat","Antarctica/Casey","Antarctica/Davis","Antarctica/DumontDUrville","Antarctica/Macquarie","Antarctica/Mawson","Antarctica/McMurdo","Antarctica/Palmer","Antarctica/Rothera","Antarctica/Syowa","Antarctica/Troll","Antarctica/Vostok","Arctic/Longyearbyen","Asia/Aden","Asia/Almaty","Asia/Amman","Asia/Anadyr","Asia/Aqtau","Asia/Aqtobe","Asia/Ashgabat","Asia/Atyrau","Asia/Baghdad","Asia/Bahrain","Asia/Baku","Asia/Bangkok","Asia/Barnaul","Asia/Beirut","Asia/Bishkek","Asia/Brunei","Asia/Calcutta","Asia/Chita","Asia/Colombo","Asia/Damascus","Asia/Dhaka","Asia/Dili","Asia/Dubai","Asia/Dushanbe","Asia/Famagusta","Asia/Gaza","Asia/Hebron","Asia/Hong_Kong","Asia/Hovd","Asia/Irkutsk","Asia/Jakarta","Asia/Jayapura","Asia/Jerusalem","Asia/Kabul","Asia/Kamchatka","Asia/Karachi","Asia/Katmandu","Asia/Khandyga","Asia/Krasnoyarsk","Asia/Kuala_Lumpur","Asia/Kuching","Asia/Kuwait","Asia/Macau","Asia/Magadan","Asia/Makassar","Asia/Manila","Asia/Muscat","Asia/Nicosia","Asia/Novokuznetsk","Asia/Novosibirsk","Asia/Omsk","Asia/Oral","Asia/Phnom_Penh","Asia/Pontianak","Asia/Pyongyang","Asia/Qatar","Asia/Qostanay","Asia/Qyzylorda","Asia/Rangoon","Asia/Riyadh","Asia/Saigon","Asia/Sakhalin","Asia/Samarkand","Asia/Seoul","Asia/Shanghai","Asia/Singapore","Asia/Srednekolymsk","Asia/Taipei","Asia/Tashkent","Asia/Tbilisi","Asia/Tehran","Asia/Thimphu","Asia/Tokyo","Asia/Tomsk","Asia/Ulaanbaatar","Asia/Urumqi","Asia/Ust-Nera","Asia/Vientiane","Asia/Vladivostok","Asia/Yakutsk","Asia/Yekaterinburg","Asia/Yerevan","Atlantic/Azores","Atlantic/Bermuda","Atlantic/Canary","Atlantic/Cape_Verde","Atlantic/Faeroe","Atlantic/Madeira","Atlantic/Reykjavik","Atlantic/South_Georgia","Atlantic/St_Helena","Atlantic/Stanley","Australia/Adelaide","Australia/Brisbane","Australia/Broken_Hill","Australia/Darwin","Australia/Eucla","Australia/Hobart","Australia/Lindeman","Australia/Lord_Howe","Australia/Melbourne","Australia/Perth","Australia/Sydney","Europe/Amsterdam","Europe/Andorra","Europe/Astrakhan","Europe/Athens","Europe/Belgrade","Europe/Berlin","Europe/Bratislava","Europe/Brussels","Europe/Bucharest","Europe/Budapest","Europe/Busingen","Europe/Chisinau","Europe/Copenhagen","Europe/Dublin","Europe/Gibraltar","Europe/Guernsey","Europe/Helsinki","Europe/Isle_of_Man","Europe/Istanbul","Europe/Jersey","Europe/Kaliningrad","Europe/Kiev","Europe/Kirov","Europe/Lisbon","Europe/Ljubljana","Europe/London","Europe/Luxembourg","Europe/Madrid","Europe/Malta","Europe/Mariehamn","Europe/Minsk","Europe/Monaco","Europe/Moscow","Europe/Oslo","Europe/Paris","Europe/Podgorica","Europe/Prague","Europe/Riga","Europe/Rome","Europe/Samara","Europe/San_Marino","Europe/Sarajevo","Europe/Saratov","Europe/Simferopol","Europe/Skopje","Europe/Sofia","Europe/Stockholm","Europe/Tallinn","Europe/Tirane","Europe/Ulyanovsk","Europe/Vaduz","Europe/Vatican","Europe/Vienna","Europe/Vilnius","Europe/Volgograd","Europe/Warsaw","Europe/Zagreb","Europe/Zurich","Indian/Antananarivo","Indian/Chagos","Indian/Christmas","Indian/Cocos","Indian/Comoro","Indian/Kerguelen","Indian/Mahe","Indian/Maldives","Indian/Mauritius","Indian/Mayotte","Indian/Reunion","Pacific/Apia","Pacific/Auckland","Pacific/Bougainville","Pacific/Chatham","Pacific/Easter","Pacific/Efate","Pacific/Enderbury","Pacific/Fakaofo","Pacific/Fiji","Pacific/Funafuti","Pacific/Galapagos","Pacific/Gambier","Pacific/Guadalcanal","Pacific/Guam","Pacific/Honolulu","Pacific/Kiritimati","Pacific/Kosrae","Pacific/Kwajalein","Pacific/Majuro","Pacific/Marquesas","Pacific/Midway","Pacific/Nauru","Pacific/Niue","Pacific/Norfolk","Pacific/Noumea","Pacific/Pago_Pago","Pacific/Palau","Pacific/Pitcairn","Pacific/Ponape","Pacific/Port_Moresby","Pacific/Rarotonga","Pacific/Saipan","Pacific/Tahiti","Pacific/Tarawa","Pacific/Tongatapu","Pacific/Truk","Pacific/Wake","Pacific/Wallis"]},"publication":{"enum":["live","embargoed"]},"embargoUntil":{"type":"timestamp","nullable":true},"speakers":{"type":"array","items":{"type":"object","properties":{"assignmentRef":{"type":"object","properties":{"refType":{"const":"snapshot"},"kind":{"const":"assignment"},"tenantId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"entityId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"eventId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$","nullable":true},"snapshotId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"revision":{"type":"integer","min":1,"max":2147483647}}},"participantRef":{"type":"object","properties":{"refType":{"const":"snapshot"},"kind":{"const":"participant"},"tenantId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"entityId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"eventId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$","nullable":true},"snapshotId":{"type":"string","min":36,"max":36,"pattern":"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},"revision":{"type":"integer","min":1,"max":2147483647}}},"side":{"enum":["for","against"]},"order":{"type":"integer","min":1,"max":8},"openingSeconds":{"type":"integer","min":0,"max":7200},"closingSeconds":{"type":"integer","min":0,"max":7200},"prizeShareBps":{"type":"integer","min":1,"max":10000,"nullable":true}}},"min":2,"max":16},"acknowledgmentDeadline":{"type":"timestamp"},"amendmentReason":{"type":"string","min":10,"max":1000,"nullable":true}}}$shape$::jsonb);
$body$;

CREATE TABLE lde_competition.event_contracts (
  tenant_id uuid NOT NULL, event_id uuid NOT NULL, entity_id uuid NOT NULL,
  PRIMARY KEY(tenant_id,event_id), UNIQUE(tenant_id,entity_id),
  FOREIGN KEY(tenant_id,entity_id) REFERENCES lde.subjects(tenant_id,entity_id),
  FOREIGN KEY(tenant_id,event_id) REFERENCES lde.subjects(tenant_id,entity_id)
);
CREATE TABLE lde_competition.publications (
  tenant_id uuid NOT NULL, snapshot_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('ruleset','contract')),
  principal_id uuid NOT NULL REFERENCES lde_security.principals(id), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,snapshot_id), FOREIGN KEY(tenant_id,snapshot_id) REFERENCES lde.revisions(tenant_id,snapshot_id)
);
CREATE TABLE lde_competition.acknowledgments (
  tenant_id uuid NOT NULL, snapshot_id uuid NOT NULL, principal_id uuid NOT NULL REFERENCES lde_security.principals(id),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,snapshot_id,principal_id), FOREIGN KEY(tenant_id,snapshot_id) REFERENCES lde_competition.publications(tenant_id,snapshot_id)
);
CREATE TABLE lde_competition.acceptances (
  tenant_id uuid NOT NULL, snapshot_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,snapshot_id), FOREIGN KEY(tenant_id,snapshot_id) REFERENCES lde_competition.publications(tenant_id,snapshot_id)
);
CREATE TABLE lde_competition.commands (
  tenant_id uuid NOT NULL REFERENCES lde.tenants(id), command_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES lde_security.principals(id), intent jsonb NOT NULL, result jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,command_id)
);
CREATE TABLE lde_competition.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL, command_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES lde_security.principals(id), operation text NOT NULL,
  entity_id uuid NOT NULL, snapshot_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(tenant_id,command_id) REFERENCES lde_competition.commands(tenant_id,command_id),
  FOREIGN KEY(tenant_id,snapshot_id) REFERENCES lde.revisions(tenant_id,snapshot_id)
);
-- Signer bindings support permanent invalidation without disclosing identity lists to peers.
CREATE TABLE lde_competition.contract_signers (
 tenant_id uuid NOT NULL, snapshot_id uuid NOT NULL, principal_id uuid NOT NULL REFERENCES lde_security.principals(id),
 participant_id uuid NOT NULL, assignment_snapshot_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,snapshot_id,principal_id),
 FOREIGN KEY(tenant_id,snapshot_id) REFERENCES lde.revisions(tenant_id,snapshot_id),
 FOREIGN KEY(tenant_id,assignment_snapshot_id) REFERENCES lde.revisions(tenant_id,snapshot_id)
);
CREATE INDEX contract_signer_identity ON lde_competition.contract_signers(principal_id,tenant_id,snapshot_id);
CREATE TABLE lde_competition.invalidations (
 tenant_id uuid NOT NULL, snapshot_id uuid NOT NULL, source_kind text NOT NULL,
 source_id uuid NOT NULL, reason text NOT NULL CHECK(reason IN ('basis-revised','authority-changed')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,snapshot_id,source_kind,source_id),
 FOREIGN KEY(tenant_id,snapshot_id) REFERENCES lde.revisions(tenant_id,snapshot_id)
);

DO $body$
DECLARE n text;
BEGIN
  FOREACH n IN ARRAY ARRAY['event_contracts','publications','acknowledgments','acceptances','commands','audit','contract_signers','invalidations'] LOOP
    EXECUTE format('ALTER TABLE lde_competition.%I ENABLE ROW LEVEL SECURITY',n);
    EXECUTE format('ALTER TABLE lde_competition.%I FORCE ROW LEVEL SECURITY',n);
    EXECUTE format('REVOKE ALL ON lde_competition.%I FROM PUBLIC',n);
    EXECUTE format('GRANT SELECT,INSERT ON lde_competition.%I TO lde_guard',n);
    EXECUTE format('CREATE POLICY guard_internal ON lde_competition.%I TO lde_guard USING(true) WITH CHECK(true)',n);
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON lde_competition.%I FOR EACH ROW EXECUTE FUNCTION lde.reject_history_change()',n);
    EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON lde_competition.%I FOR EACH STATEMENT EXECUTE FUNCTION lde.reject_history_change()',n);
  END LOOP;
  FOREACH n IN ARRAY ARRAY['subjects','revisions','revision_references','domain_events'] LOOP
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON lde.%I TO lde_guard',n);
    EXECUTE format('CREATE POLICY material_guard ON lde.%I TO lde_guard USING(true) WITH CHECK(true)',n);
  END LOOP;
END;
$body$;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA lde_competition TO lde_guard;
-- PostgreSQL requires UPDATE privilege to take share locks. These roles cannot log in;
-- runtime/identity receive no corresponding table privileges or generic writer.
GRANT UPDATE ON lde_auth.session,lde_auth."user" TO lde_guard;
INSERT INTO lde_security.access_rules VALUES
('ruleset.manage','tenant',ARRAY['organizer'],ARRAY[]::text[],false,true),
('contract.manage','event',ARRAY['organizer'],ARRAY[]::text[],false,true),
('contract.acknowledge','event',ARRAY['debater'],ARRAY[]::text[],true,false);

-- Private helpers are never granted to the application role.
-- Recheck real time after a contended lock; statement_timestamp alone can age while waiting.
CREATE FUNCTION lde_competition.has_current_access(action_name text,t uuid,e uuid,p uuid) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $body$
 SELECT lde_security.has_access(action_name,t,e,p) AND EXISTS(
 SELECT 1 FROM lde_security.current_actor() a
 JOIN lde_security.memberships m ON m.principal_id=a.principal_id AND m.tenant_id=t
 JOIN lde_security.role_grants g ON g.principal_id=a.principal_id AND g.tenant_id=t AND g.event_id IS NOT DISTINCT FROM e
 JOIN lde_security.access_rules r ON r.action=action_name AND g.role=ANY(r.roles)
 WHERE a.kind='human' AND a.principal_id=p AND a.expires_at>clock_timestamp()
 AND m.status='active' AND m.valid_from<=clock_timestamp() AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AND (g.expires_at IS NULL OR g.expires_at>clock_timestamp())
 AND (g.role IN ('audience','debater') OR (a.mfa_at IS NOT NULL AND a.mfa_at>clock_timestamp()-(CASE WHEN r.sensitive THEN interval '15 minutes' ELSE interval '8 hours' END))));
$body$;
CREATE FUNCTION lde_competition.authorize(a text,t uuid,e uuid) RETURNS uuid LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; sid text;
BEGIN
 SELECT principal_id,session_id INTO p,sid FROM lde_security.current_actor() WHERE kind='human';
 IF p IS NULL OR t IS NULL OR NOT lde_security.has_access(a,t,e,p) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Material access denied'; END IF;
 -- Linearize writes/readiness with role, membership, session and MFA revocation.
 PERFORM 1 FROM lde_security.principals WHERE id=p FOR SHARE;
 PERFORM 1 FROM lde_auth.session WHERE id=sid FOR SHARE;
 PERFORM 1 FROM lde_auth."user" WHERE id=(SELECT provider_user_id FROM lde_security.principals WHERE id=p) FOR SHARE;
 PERFORM 1 FROM lde_security.session_bindings WHERE session_id=sid FOR SHARE;
 PERFORM 1 FROM lde_security.mfa_proofs WHERE session_id=sid FOR SHARE;
 PERFORM 1 FROM lde_security.memberships WHERE tenant_id=t AND principal_id=p FOR SHARE;
 PERFORM 1 FROM lde_security.role_grants WHERE tenant_id=t AND principal_id=p AND event_id IS NOT DISTINCT FROM e FOR SHARE;
 IF NOT lde_competition.has_current_access(a,t,e,p) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Material access denied'; END IF;
 RETURN p;
END;
$body$;
CREATE FUNCTION lde_competition.replay(t uuid,c uuid,intent jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
DECLARE prior lde_competition.commands; p uuid;
BEGIN
 IF c IS NULL OR c::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lde:material:'||t::text,0));
 SELECT principal_id INTO p FROM lde_security.current_actor() WHERE kind='human';
 SELECT * INTO prior FROM lde_competition.commands WHERE tenant_id=t AND command_id=c;
 IF FOUND THEN
   IF prior.principal_id IS DISTINCT FROM p OR prior.intent IS DISTINCT FROM intent THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Command conflict'; END IF;
   RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 RETURN NULL;
END;
$body$;
CREATE FUNCTION lde_competition.finish(t uuid,c uuid,intent jsonb,result jsonb,op text,entity uuid,snap uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid;
BEGIN
 SELECT principal_id INTO STRICT p FROM lde_security.current_actor() WHERE kind='human';
 INSERT INTO lde_competition.commands(tenant_id,command_id,principal_id,intent,result) VALUES(t,c,p,intent,result);
 INSERT INTO lde_competition.audit(tenant_id,command_id,principal_id,operation,entity_id,snapshot_id) VALUES(t,c,p,op,entity,snap);
 RETURN result;
END;
$body$;
CREATE FUNCTION lde_competition.canonical(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $body$
DECLARE result text;
BEGIN
 CASE jsonb_typeof(v)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||lde_competition.canonical(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(lde_competition.canonical(value),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY a(value,ord);
 WHEN 'number' THEN result:=(v::numeric)::bigint::text;
 ELSE result:=v::text;
 END CASE; RETURN result;
END;
$body$;
CREATE FUNCTION lde_competition.envelope(r lde.revisions) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $body$
 SELECT jsonb_build_object('snapshot',r.canonical_record::jsonb,'contentHash',r.content_hash,
 'published',EXISTS(SELECT 1 FROM lde_competition.publications p WHERE p.tenant_id=r.tenant_id AND p.snapshot_id=r.snapshot_id),
 'accepted',EXISTS(SELECT 1 FROM lde_competition.acceptances a WHERE a.tenant_id=r.tenant_id AND a.snapshot_id=r.snapshot_id),
 'invalidated',EXISTS(SELECT 1 FROM lde_competition.invalidations i WHERE i.tenant_id=r.tenant_id AND i.snapshot_id=r.snapshot_id));
$body$;
CREATE FUNCTION lde_competition.append_record(t uuid,e uuid,entity uuid,k text,expected int,d jsonb) RETURNS lde.revisions LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
DECLARE prior lde.revisions; result lde.revisions; snap uuid:=gen_random_uuid(); recorded text; raw text; subject lde.subjects;
BEGIN
 IF t IS NULL OR entity IS NULL OR entity::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR expected IS NULL OR expected<0 OR expected>999 OR octet_length(d::text)>131072 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid revision'; END IF;
 INSERT INTO lde.subjects(tenant_id,entity_id,kind,event_id) VALUES(t,entity,k,e) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT subject FROM lde.subjects WHERE tenant_id=t AND entity_id=entity FOR UPDATE;
 IF subject.kind<>k OR subject.event_id IS DISTINCT FROM e THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Subject conflict'; END IF;
 SELECT * INTO prior FROM lde.revisions WHERE tenant_id=t AND entity_id=entity ORDER BY revision DESC LIMIT 1;
 IF coalesce(prior.revision,0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Revision conflict'; END IF;
 recorded:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 raw:=lde_competition.canonical(jsonb_build_object('schemaVersion',1,'tenantId',t,'eventId',e,'entityId',entity,'kind',k,'revision',expected+1,'snapshotId',snap,'previousSnapshotId',prior.snapshot_id,'recordedAt',recorded,'data',d));
 INSERT INTO lde.revisions(tenant_id,entity_id,kind,event_id,snapshot_id,revision,previous_snapshot_id,recorded_at,canonical_record,content_hash)
 VALUES(t,entity,k,e,snap,expected+1,prior.snapshot_id,recorded::timestamptz,raw,encode(sha256(convert_to(raw,'UTF8')),'hex')) RETURNING * INTO result;
 INSERT INTO lde.domain_events(tenant_id,message_id,message_type,snapshot_id) VALUES(t,gen_random_uuid(),'snapshot-appended',snap);
 RETURN result;
END;
$body$;
CREATE FUNCTION lde_competition.validate_rules(d jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
BEGIN
 IF d IS NULL OR octet_length(d::text)>131072 OR lde_competition.ruleset_shape(d) IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid rules'; END IF;
 IF (SELECT sum((v->>'weightBps')::int)<>10000 OR count(*)<>count(DISTINCT v->>'code') OR bool_or((v->>'minimum')::int>=(v->>'maximum')::int) FROM jsonb_array_elements(d->'rubric') v)
 OR (d#>>'{deadlines,paymentTargetDays}')::int>(d#>>'{deadlines,paymentDeadlineDays}')::int
 OR (d#>>'{adjustments,penaltyMaxPerFinding}')::int>(d#>>'{adjustments,penaltyTotalCap}')::int
 OR (d#>>'{adjustments,bonusMaxPerFinding}')::int>(d#>>'{adjustments,bonusTotalCap}')::int
 OR ((d#>>'{adjustments,penaltyMaxPerFinding}')::int=0)<>((d#>>'{adjustments,penaltyTotalCap}')::int=0)
 OR ((d#>>'{adjustments,bonusMaxPerFinding}')::int=0)<>((d#>>'{adjustments,bonusTotalCap}')::int=0)
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Inconsistent rules'; END IF;
END;
$body$;
CREATE FUNCTION lde_competition.reference_data(t uuid,e uuid,ref jsonb,k text,require_current boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
DECLARE r lde.revisions; latest uuid;
BEGIN
 SELECT * INTO r FROM lde.revisions WHERE tenant_id=t AND snapshot_id=(ref->>'snapshotId')::uuid;
 IF NOT FOUND OR r.kind<>k OR r.entity_id::text IS DISTINCT FROM ref->>'entityId' OR r.revision::text IS DISTINCT FROM ref->>'revision'
 OR r.tenant_id::text IS DISTINCT FROM ref->>'tenantId' OR r.event_id::text IS DISTINCT FROM ref->>'eventId'
 OR (r.event_id IS NOT NULL AND r.event_id IS DISTINCT FROM e) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid material reference'; END IF;
 IF require_current THEN
   PERFORM 1 FROM lde.subjects WHERE tenant_id=t AND entity_id=r.entity_id FOR SHARE;
   SELECT snapshot_id INTO latest FROM lde.revisions WHERE tenant_id=t AND entity_id=r.entity_id ORDER BY revision DESC LIMIT 1;
   IF latest<>r.snapshot_id THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Material basis changed'; END IF;
 END IF;
 RETURN r.canonical_record::jsonb->'data';
END;
$body$;
CREATE FUNCTION lde_competition.debater_active(t uuid,e uuid,p uuid) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $body$
 SELECT EXISTS(SELECT 1 FROM lde_security.principals a JOIN lde_security.memberships m ON m.principal_id=a.id
 JOIN lde_security.role_grants g ON g.tenant_id=m.tenant_id AND g.principal_id=a.id
 WHERE a.id=p AND a.kind='human' AND a.status='active' AND m.tenant_id=t AND m.status='active' AND m.valid_from<=clock_timestamp() AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND g.event_id=e AND g.role='debater' AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AND (g.expires_at IS NULL OR g.expires_at>clock_timestamp()));
$body$;
CREATE FUNCTION lde_competition.validate_contract(t uuid,e uuid,d jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
DECLARE ev jsonb; rules jsonb; team jsonb; s jsonb; a jsonb; p uuid; principals uuid[]:='{}'; members jsonb[]; seen jsonb[]; side_name text; team_ref jsonb; rows_count int; n int;
BEGIN
 IF d IS NULL OR octet_length(d::text)>131072 OR lde_competition.contract_shape(d) IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid contract'; END IF;
 IF (d->>'acknowledgmentDeadline')::timestamptz>=(d->>'startsAt')::timestamptz
 OR (d#>>'{prizeBudget,minorUnits}')::numeric>9223372036854775807
 OR d#>>'{forTeamRef,entityId}'=d#>>'{againstTeamRef,entityId}'
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=d->>'timeZone')
 OR (d->>'publication'='live' AND d->'embargoUntil'<>'null'::jsonb)
 OR (d->>'publication'='embargoed' AND (d->'embargoUntil'='null'::jsonb OR (d->>'embargoUntil')::timestamptz<(d->>'startsAt')::timestamptz))
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid material policy'; END IF;
 ev:=lde_competition.reference_data(t,e,d->'eventRef','event',true);
 IF d#>>'{eventRef,entityId}' IS DISTINCT FROM e::text OR ev->'motionRef' IS DISTINCT FROM d->'motionRef' OR ev->'rulesetRef' IS DISTINCT FROM d->'rulesetRef' THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Event basis differs'; END IF;
 PERFORM lde_competition.reference_data(t,e,d->'motionRef','motion',true);
 rules:=lde_competition.reference_data(t,e,d->'rulesetRef','ruleset',false);
 PERFORM lde_competition.validate_rules(rules);
 IF rules#>>'{judging,mode}'<>'human' OR NOT EXISTS(SELECT 1 FROM lde_competition.publications WHERE tenant_id=t AND snapshot_id=(d#>>'{rulesetRef,snapshotId}')::uuid AND kind='ruleset') THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Publish supported material rules first'; END IF;
 FOREACH side_name IN ARRAY ARRAY['for','against'] LOOP
   team_ref:=CASE WHEN side_name='for' THEN d->'forTeamRef' ELSE d->'againstTeamRef' END;
   team:=lde_competition.reference_data(t,e,team_ref,'team',true);
   SELECT array_agg(v ORDER BY v->>'entityId') INTO members FROM jsonb_array_elements(team->'members') v;
   SELECT count(*),array_agg(v->'participantRef' ORDER BY v#>>'{participantRef,entityId}') INTO rows_count,seen FROM jsonb_array_elements(d->'speakers') v WHERE v->>'side'=side_name;
   IF rows_count<1 OR rows_count>8 OR seen IS DISTINCT FROM members THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Every team member needs an allocation'; END IF;
   IF (SELECT count(DISTINCT v->>'order')<>rows_count OR min((v->>'order')::int)<>1 OR max((v->>'order')::int)<>rows_count
      OR sum((v->>'openingSeconds')::int)<>(rules#>>'{timing,openingPerSideSeconds}')::int OR sum((v->>'closingSeconds')::int)<>(rules#>>'{timing,closingPerSideSeconds}')::int
      FROM jsonb_array_elements(d->'speakers') v WHERE v->>'side'=side_name) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid speaking order or time totals'; END IF;
   IF rules->>'teamPrizeSplit'='equal' THEN
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'speakers') v WHERE v->>'side'=side_name AND v->'prizeShareBps'<>'null'::jsonb) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Equal split has no custom shares'; END IF;
   ELSE
     IF (SELECT sum((v->>'prizeShareBps')::int)<>10000 OR count(v->>'prizeShareBps')<>rows_count FROM jsonb_array_elements(d->'speakers') v WHERE v->>'side'=side_name) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Custom shares must total 100 percent'; END IF;
   END IF;
 END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(d->'speakers') LOOP
   a:=lde_competition.reference_data(t,e,s->'assignmentRef','assignment',true);
   PERFORM lde_competition.reference_data(t,e,s->'participantRef','participant',true);
   p:=(a->>'principalId')::uuid;
   -- Serialize acknowledgment with competing membership, grant, ownership and identity updates.
   PERFORM 1 FROM lde_security.principals WHERE id=p FOR SHARE;
   PERFORM 1 FROM lde_security.memberships WHERE tenant_id=t AND principal_id=p FOR SHARE;
   PERFORM 1 FROM lde_security.role_grants WHERE tenant_id=t AND event_id=e AND principal_id=p AND role='debater' FOR SHARE;
   PERFORM 1 FROM lde_security.resource_owners WHERE tenant_id=t AND entity_id=(s#>>'{participantRef,entityId}')::uuid FOR SHARE;
   IF a->>'role'<>'debater' OR a->'teamRef' IS DISTINCT FROM (CASE WHEN s->>'side'='for' THEN d->'forTeamRef' ELSE d->'againstTeamRef' END)
   OR NOT EXISTS(SELECT 1 FROM lde_security.resource_owners WHERE tenant_id=t AND entity_id=(s#>>'{participantRef,entityId}')::uuid AND kind='participant' AND principal_id=p)
   OR NOT lde_competition.debater_active(t,e,p) OR p=ANY(principals)
   THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Speaker identity or assignment is not current'; END IF;
   principals:=array_append(principals,p);

 END LOOP;
 SELECT count(DISTINCT v#>>'{assignmentRef,entityId}') INTO n FROM jsonb_array_elements(d->'speakers') v;
 IF n<>jsonb_array_length(d->'speakers') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate assignment'; END IF;
END;
$body$;
CREATE FUNCTION lde_competition.basis_current(t uuid,e uuid,d jsonb) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $body$
BEGIN PERFORM lde_competition.validate_contract(t,e,d); RETURN true;
EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '55000' OR invalid_text_representation THEN RETURN false;
END;
$body$;

CREATE FUNCTION lde_competition.save_ruleset(t uuid,entity uuid,expected int,d jsonb,c uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE intent jsonb:=jsonb_build_object('op','save-ruleset','entity',entity,'expected',expected,'data',d); result jsonb; r lde.revisions;
BEGIN
 PERFORM lde_competition.authorize('ruleset.manage',t,NULL);
 result:=lde_competition.replay(t,c,intent);
 PERFORM lde_competition.authorize('ruleset.manage',t,NULL);
 IF result IS NOT NULL THEN RETURN result; END IF;
 PERFORM lde_competition.validate_rules(d);
 IF EXISTS(SELECT 1 FROM lde_competition.publications p JOIN lde.revisions published_revision USING(tenant_id,snapshot_id) WHERE p.tenant_id=t AND published_revision.entity_id=entity)
 AND d->'amendmentReason'='null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Published rules require an amendment reason'; END IF;
 IF expected=0 AND (SELECT count(*) FROM lde.subjects WHERE tenant_id=t AND kind='ruleset')>=50 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='Ruleset limit reached'; END IF;
 r:=lde_competition.append_record(t,NULL,entity,'ruleset',expected,d);
 result:=jsonb_build_object('current',lde_competition.envelope(r),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'ruleset-saved',entity,r.snapshot_id);
END;
$body$;
CREATE FUNCTION lde_competition.publish_ruleset(t uuid,entity uuid,snap uuid,c uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE intent jsonb:=jsonb_build_object('op','publish-ruleset','entity',entity,'snapshot',snap); result jsonb; r lde.revisions; p uuid;
BEGIN
 p:=lde_competition.authorize('ruleset.manage',t,NULL); result:=lde_competition.replay(t,c,intent);
 p:=lde_competition.authorize('ruleset.manage',t,NULL); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO r FROM lde.revisions WHERE tenant_id=t AND entity_id=entity AND kind='ruleset' ORDER BY revision DESC LIMIT 1;
 IF r.snapshot_id IS NULL OR r.snapshot_id IS DISTINCT FROM snap THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Only the current ruleset can be published'; END IF;
 PERFORM lde_competition.validate_rules(r.canonical_record::jsonb->'data');
 IF r.canonical_record::jsonb#>>'{data,judging,mode}'<>'human' THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='AI authority is not qualified'; END IF;
 INSERT INTO lde_competition.publications(tenant_id,snapshot_id,kind,principal_id) VALUES(t,snap,'ruleset',p) ON CONFLICT DO NOTHING;
 result:=jsonb_build_object('current',lde_competition.envelope(r),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'ruleset-published',entity,snap);
END;
$body$;
CREATE FUNCTION lde_competition.ruleset_records(t uuid,entity uuid DEFAULT NULL,before_revision int DEFAULT 2147483647) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE result jsonb; current_record lde.revisions;
BEGIN
 PERFORM lde_competition.authorize('ruleset.manage',t,NULL);
 IF before_revision IS NULL OR before_revision<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid cursor'; END IF;
 IF entity IS NULL THEN
 SELECT coalesce(jsonb_agg(lde_competition.envelope(r) ORDER BY r.entity_id),'[]') INTO result FROM lde.revisions r
 WHERE r.tenant_id=t AND r.kind='ruleset' AND r.revision=(SELECT max(x.revision) FROM lde.revisions x WHERE x.tenant_id=t AND x.entity_id=r.entity_id);
 ELSE
 SELECT * INTO current_record FROM lde.revisions WHERE tenant_id=t AND entity_id=entity AND kind='ruleset' ORDER BY revision DESC LIMIT 1;
 IF current_record.snapshot_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Ruleset unavailable'; END IF;
 SELECT coalesce(jsonb_agg(lde_competition.envelope(r) ORDER BY r.revision DESC),'[]') INTO result FROM
 (SELECT * FROM lde.revisions WHERE tenant_id=t AND entity_id=entity AND kind='ruleset' AND revision<before_revision ORDER BY revision DESC LIMIT 50) r;
 END IF;
 RETURN jsonb_build_object('records',result,'pageSize',50,'current',CASE WHEN current_record.snapshot_id IS NULL THEN NULL ELSE lde_competition.envelope(current_record) END);
END;
$body$;
CREATE FUNCTION lde_competition.save_contract(t uuid,e uuid,expected int,d jsonb,c uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE intent jsonb:=jsonb_build_object('op','save-contract','event',e,'expected',expected,'data',d); result jsonb; r lde.revisions; entity uuid; ref jsonb;
BEGIN
 PERFORM lde_competition.authorize('contract.manage',t,e); result:=lde_competition.replay(t,c,intent);
 PERFORM lde_competition.authorize('contract.manage',t,e); IF result IS NOT NULL THEN RETURN result; END IF;
 PERFORM lde_competition.validate_contract(t,e,d);
 SELECT entity_id INTO entity FROM lde_competition.event_contracts WHERE tenant_id=t AND event_id=e;
 IF entity IS NOT NULL AND EXISTS(SELECT 1 FROM lde_competition.publications p JOIN lde.revisions published_revision USING(tenant_id,snapshot_id) WHERE p.tenant_id=t AND published_revision.entity_id=entity)
 AND d->'amendmentReason'='null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Offered contracts require recorded amendments'; END IF;
 IF (d->>'acknowledgmentDeadline')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Acknowledgment deadline has passed'; END IF;
 IF entity IS NULL THEN entity:=gen_random_uuid(); END IF;
 r:=lde_competition.append_record(t,e,entity,'contract',expected,d);
 INSERT INTO lde_competition.event_contracts(tenant_id,event_id,entity_id) VALUES(t,e,entity) ON CONFLICT DO NOTHING;
 FOR ref IN
   SELECT value FROM jsonb_each(d) WHERE key IN ('eventRef','motionRef','rulesetRef','forTeamRef','againstTeamRef')
   UNION SELECT v->'assignmentRef' FROM jsonb_array_elements(d->'speakers') v
   UNION SELECT v->'participantRef' FROM jsonb_array_elements(d->'speakers') v
 LOOP
   INSERT INTO lde.revision_references(tenant_id,source_snapshot_id,target_snapshot_id,target_entity_id,target_kind,target_revision,target_event_id)
   VALUES(t,r.snapshot_id,(ref->>'snapshotId')::uuid,(ref->>'entityId')::uuid,ref->>'kind',(ref->>'revision')::int,(ref->>'eventId')::uuid) ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO lde_competition.contract_signers(tenant_id,snapshot_id,principal_id,participant_id,assignment_snapshot_id)
 SELECT t,r.snapshot_id,(a.canonical_record::jsonb#>>'{data,principalId}')::uuid,(sp#>>'{participantRef,entityId}')::uuid,a.snapshot_id
 FROM jsonb_array_elements(d->'speakers') sp JOIN lde.revisions a ON a.tenant_id=t AND a.snapshot_id=(sp#>>'{assignmentRef,snapshotId}')::uuid;
 result:=jsonb_build_object('current',lde_competition.envelope(r),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'contract-saved',entity,r.snapshot_id);
END;
$body$;
CREATE FUNCTION lde_competition.offer_contract(t uuid,e uuid,snap uuid,c uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE intent jsonb:=jsonb_build_object('op','offer-contract','event',e,'snapshot',snap); result jsonb; r lde.revisions; p uuid;
BEGIN
 p:=lde_competition.authorize('contract.manage',t,e); result:=lde_competition.replay(t,c,intent);
 p:=lde_competition.authorize('contract.manage',t,e); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT r0.* INTO r FROM lde.revisions r0 JOIN lde_competition.event_contracts ec USING(tenant_id,entity_id) WHERE ec.tenant_id=t AND ec.event_id=e ORDER BY r0.revision DESC LIMIT 1;
 IF r.snapshot_id IS NULL OR r.snapshot_id IS DISTINCT FROM snap THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Only current contract can be offered'; END IF;
 PERFORM lde_competition.validate_contract(t,e,r.canonical_record::jsonb->'data');
 IF EXISTS(SELECT 1 FROM lde_competition.invalidations WHERE tenant_id=t AND snapshot_id=r.snapshot_id) THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Amend the invalidated contract before proceeding'; END IF;
 IF (r.canonical_record::jsonb#>>'{data,acknowledgmentDeadline}')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Acknowledgment deadline has passed'; END IF;
 INSERT INTO lde_competition.publications(tenant_id,snapshot_id,kind,principal_id) VALUES(t,snap,'contract',p) ON CONFLICT DO NOTHING;
 result:=jsonb_build_object('current',lde_competition.envelope(r),'replayed',false);
 RETURN lde_competition.finish(t,c,intent,result,'contract-offered',r.entity_id,snap);
END;
$body$;
CREATE FUNCTION lde_competition.acknowledge_contract(t uuid,e uuid,snap uuid,h text,accepted boolean,c uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE intent jsonb:=jsonb_build_object('op','acknowledge','event',e,'snapshot',snap,'hash',h,'accepted',accepted); result jsonb; r lde.revisions; p uuid; count_ack int;
BEGIN
 p:=lde_competition.authorize('contract.acknowledge',t,e); result:=lde_competition.replay(t,c,intent);
 p:=lde_competition.authorize('contract.acknowledge',t,e); IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT r0.* INTO r FROM lde.revisions r0 JOIN lde_competition.event_contracts ec USING(tenant_id,entity_id) WHERE ec.tenant_id=t AND ec.event_id=e ORDER BY r0.revision DESC LIMIT 1;
 IF accepted IS DISTINCT FROM true OR r.snapshot_id IS NULL OR r.snapshot_id IS DISTINCT FROM snap OR r.content_hash IS DISTINCT FROM h
 OR NOT EXISTS(SELECT 1 FROM lde_competition.publications WHERE tenant_id=t AND snapshot_id=snap AND kind='contract') THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Review current offered contract'; END IF;
 PERFORM lde_competition.validate_contract(t,e,r.canonical_record::jsonb->'data');
 IF EXISTS(SELECT 1 FROM lde_competition.invalidations WHERE tenant_id=t AND snapshot_id=r.snapshot_id) THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Amend the invalidated contract before proceeding'; END IF;
 IF (r.canonical_record::jsonb#>>'{data,acknowledgmentDeadline}')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Acknowledgment deadline has passed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.canonical_record::jsonb#>'{data,speakers}') s JOIN lde_security.resource_owners o ON o.tenant_id=t AND o.entity_id=(s#>>'{participantRef,entityId}')::uuid WHERE o.principal_id=p AND o.kind='participant') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Only the assigned individual may acknowledge'; END IF;
 INSERT INTO lde_competition.acknowledgments(tenant_id,snapshot_id,principal_id,content_hash) VALUES(t,snap,p,h) ON CONFLICT DO NOTHING;
 SELECT count(*) INTO count_ack FROM lde_competition.acknowledgments WHERE tenant_id=t AND snapshot_id=snap;
 IF count_ack=jsonb_array_length(r.canonical_record::jsonb#>'{data,speakers}') THEN INSERT INTO lde_competition.acceptances(tenant_id,snapshot_id) VALUES(t,snap) ON CONFLICT DO NOTHING; END IF;
 result:=jsonb_build_object('current',lde_competition.envelope(r),'replayed',false,'acknowledged',true);
 RETURN lde_competition.finish(t,c,intent,result,'contract-acknowledged',r.entity_id,snap);
END;
$body$;

-- Snapshot-level filter also protects raw SELECTs on the previously deployed E04 tables.
CREATE FUNCTION lde_competition.contract_visible(t uuid,e uuid,snap uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
 SELECT lde_security.has_access('contract.manage',t,e) OR
 (lde_security.has_access('event.read',t,e) AND EXISTS(SELECT 1 FROM lde_competition.publications WHERE tenant_id=t AND snapshot_id=snap AND kind='contract'));
$body$;
DROP POLICY scoped_revision ON lde.revisions;
CREATE POLICY scoped_revision ON lde.revisions FOR SELECT TO lde_runtime USING
 (lde_security.can_read_entity(tenant_id,event_id,entity_id,kind) AND (kind<>'contract' OR lde_competition.contract_visible(tenant_id,event_id,snapshot_id)));

CREATE FUNCTION lde_competition.contract_workspace(t uuid,e uuid,before_revision int DEFAULT 2147483647,selected_snapshot uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE p uuid; manage boolean; latest lde.revisions; current_record lde.revisions; history jsonb; choices jsonb:='[]'; links jsonb:='[]'; details jsonb:=NULL; ready boolean:=false;
 offered boolean:=false; accepted boolean:=false; own boolean:=false; fresh boolean:=false; ack_open boolean:=false; n int:=0; required int:=0;
BEGIN
 p:=lde_competition.authorize('event.read',t,e); manage:=lde_competition.has_current_access('contract.manage',t,e,p);
 IF before_revision IS NULL OR before_revision<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid cursor'; END IF;
 SELECT r.* INTO latest FROM lde.revisions r JOIN lde_competition.event_contracts ec USING(tenant_id,entity_id) WHERE ec.tenant_id=t AND ec.event_id=e ORDER BY r.revision DESC LIMIT 1;
 SELECT r.* INTO current_record FROM lde.revisions r WHERE r.tenant_id=t AND r.entity_id=latest.entity_id
 AND (selected_snapshot IS NULL OR r.snapshot_id=selected_snapshot)
 AND (manage OR EXISTS(SELECT 1 FROM lde_competition.publications WHERE tenant_id=t AND snapshot_id=r.snapshot_id)) ORDER BY r.revision DESC LIMIT 1;
 IF selected_snapshot IS NOT NULL AND current_record.snapshot_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Material version unavailable'; END IF;
 SELECT coalesce(jsonb_agg(lde_competition.envelope(r) ORDER BY r.revision DESC),'[]') INTO history FROM
 (SELECT r0.* FROM lde.revisions r0 WHERE r0.tenant_id=t AND r0.entity_id=latest.entity_id AND r0.revision<before_revision
 AND (manage OR EXISTS(SELECT 1 FROM lde_competition.publications WHERE tenant_id=t AND snapshot_id=r0.snapshot_id)) ORDER BY r0.revision DESC LIMIT 50) r;
 IF latest.snapshot_id IS NOT NULL THEN
   offered:=EXISTS(SELECT 1 FROM lde_competition.publications WHERE tenant_id=t AND snapshot_id=latest.snapshot_id);
   accepted:=EXISTS(SELECT 1 FROM lde_competition.acceptances WHERE tenant_id=t AND snapshot_id=latest.snapshot_id);
   fresh:=lde_competition.basis_current(t,e,latest.canonical_record::jsonb->'data') AND NOT EXISTS(SELECT 1 FROM lde_competition.invalidations WHERE tenant_id=t AND snapshot_id=latest.snapshot_id);
   SELECT count(*) INTO n FROM lde_competition.acknowledgments WHERE tenant_id=t AND snapshot_id=latest.snapshot_id;
   required:=jsonb_array_length(latest.canonical_record::jsonb#>'{data,speakers}');
   own:=EXISTS(SELECT 1 FROM lde_competition.acknowledgments WHERE tenant_id=t AND snapshot_id=latest.snapshot_id AND principal_id=p);
   ready:=offered AND accepted AND fresh;
   ack_open:=offered AND fresh AND (latest.canonical_record::jsonb#>>'{data,acknowledgmentDeadline}')::timestamptz>clock_timestamp();
 END IF;
 IF current_record.snapshot_id IS NOT NULL THEN
   SELECT jsonb_build_object('motionRecord',lde_competition.envelope(m),'rulesetRecord',lde_competition.envelope(r)) INTO details
   FROM lde.revisions m,lde.revisions r WHERE m.tenant_id=t AND r.tenant_id=t
   AND m.snapshot_id=(current_record.canonical_record::jsonb#>>'{data,motionRef,snapshotId}')::uuid
   AND r.snapshot_id=(current_record.canonical_record::jsonb#>>'{data,rulesetRef,snapshotId}')::uuid;
 END IF;
 IF manage THEN
   WITH latest_entities AS (SELECT DISTINCT ON(entity_id) r.* FROM lde.revisions r WHERE tenant_id=t ORDER BY entity_id,revision DESC),
   ev AS (SELECT * FROM latest_entities WHERE entity_id=e AND kind='event'),
   assignments AS (SELECT * FROM latest_entities WHERE kind='assignment' AND event_id=e AND canonical_record::jsonb#>>'{data,role}'='debater'),
   teams AS (SELECT r.* FROM latest_entities r WHERE kind='team' AND entity_id IN (SELECT (canonical_record::jsonb#>>'{data,teamRef,entityId}')::uuid FROM assignments)),
   participant_ids AS (SELECT (v->>'entityId')::uuid AS id FROM teams,jsonb_array_elements(canonical_record::jsonb#>'{data,members}') v),
   chosen AS (SELECT * FROM ev UNION SELECT * FROM assignments UNION SELECT * FROM teams
     UNION SELECT * FROM latest_entities WHERE kind='participant' AND entity_id IN (SELECT id FROM participant_ids)
     UNION SELECT r.* FROM lde.revisions r,ev WHERE r.tenant_id=t AND r.snapshot_id IN ((ev.canonical_record::jsonb#>>'{data,motionRef,snapshotId}')::uuid,(ev.canonical_record::jsonb#>>'{data,rulesetRef,snapshotId}')::uuid))
   SELECT coalesce(jsonb_agg(lde_competition.envelope(chosen) ORDER BY chosen.kind,chosen.entity_id),'[]') INTO choices FROM chosen;
   SELECT coalesce(jsonb_agg(jsonb_build_object('entityId',o.entity_id,'principalId',o.principal_id)),'[]') INTO links
   FROM lde_security.resource_owners o WHERE tenant_id=t AND kind='participant' AND entity_id IN (SELECT (v#>>'{snapshot,entityId}')::uuid FROM jsonb_array_elements(choices) v WHERE v#>>'{snapshot,kind}'='participant');
 END IF;
 RETURN jsonb_build_object('canManage',manage,'canAcknowledge',lde_competition.has_current_access('contract.acknowledge',t,e,p),'principalId',p,
 'participantLinks',links,'history',history,'choices',choices,'current',CASE WHEN current_record.snapshot_id IS NULL THEN NULL ELSE lde_competition.envelope(current_record) END,'details',details,
 'pendingAmendment',coalesce(NOT offered AND latest.snapshot_id IS NOT NULL,false),
 'viewingHistory',coalesce(selected_snapshot IS NOT NULL AND selected_snapshot<>latest.snapshot_id,false),'ownAcknowledgment',own,
 'status',jsonb_build_object('offered',offered,'accepted',accepted,'basisCurrent',fresh,'acknowledgments',n,'requiredAcknowledgments',required,'materialReady',ready,'acknowledgmentOpen',ack_open,'registrationOpen',false,'competitionReady',false));
END;
$body$;

-- These internal triggers only append invalidations; they never change accepted bytes.
-- A restored role does not erase an interruption of the recorded authority basis.
CREATE FUNCTION lde_competition.invalidate_reference() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
BEGIN
 IF NEW.kind IN ('event','motion','participant','team','assignment') THEN
   INSERT INTO lde_competition.invalidations(tenant_id,snapshot_id,source_kind,source_id,reason)
   SELECT x.tenant_id,x.source_snapshot_id,NEW.kind,NEW.entity_id,'basis-revised'
   FROM lde.revision_references x JOIN lde.revisions c ON c.tenant_id=x.tenant_id AND c.snapshot_id=x.source_snapshot_id AND c.kind='contract'
   WHERE x.tenant_id=NEW.tenant_id AND x.target_entity_id=NEW.entity_id AND x.target_snapshot_id<>NEW.snapshot_id
   ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER invalidate_material_reference AFTER INSERT ON lde.revisions FOR EACH ROW EXECUTE FUNCTION lde_competition.invalidate_reference();
CREATE FUNCTION lde_competition.invalidate_authority() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
DECLARE old_row jsonb:=to_jsonb(OLD); p uuid; t uuid; e uuid; target_entity uuid;
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(NEW)=old_row THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='principals' THEN p:=(old_row->>'id')::uuid;
 ELSE p:=(old_row->>'principal_id')::uuid; t:=(old_row->>'tenant_id')::uuid;
 END IF;
 IF TG_TABLE_NAME='role_grants' THEN
   IF old_row->>'role'<>'debater' THEN RETURN NULL; END IF;
   e:=(old_row->>'event_id')::uuid;
 END IF;
 IF TG_TABLE_NAME='resource_owners' THEN
   IF old_row->>'kind'<>'participant' THEN RETURN NULL; END IF;
   target_entity:=(old_row->>'entity_id')::uuid;
 END IF;
 INSERT INTO lde_competition.invalidations(tenant_id,snapshot_id,source_kind,source_id,reason)
 SELECT s.tenant_id,s.snapshot_id,TG_TABLE_NAME,p,'authority-changed'
 FROM lde_competition.contract_signers s JOIN lde.revisions c ON c.tenant_id=s.tenant_id AND c.snapshot_id=s.snapshot_id
 WHERE s.principal_id=p AND (t IS NULL OR s.tenant_id=t) AND (e IS NULL OR c.event_id=e) AND (target_entity IS NULL OR s.participant_id=target_entity)
 ON CONFLICT DO NOTHING;
 RETURN NULL;
END;
$body$;
CREATE TRIGGER invalidate_material_principal AFTER UPDATE OR DELETE ON lde_security.principals FOR EACH ROW EXECUTE FUNCTION lde_competition.invalidate_authority();
CREATE TRIGGER invalidate_material_membership AFTER UPDATE OR DELETE ON lde_security.memberships FOR EACH ROW EXECUTE FUNCTION lde_competition.invalidate_authority();
CREATE TRIGGER invalidate_material_grant AFTER UPDATE OR DELETE ON lde_security.role_grants FOR EACH ROW EXECUTE FUNCTION lde_competition.invalidate_authority();
CREATE TRIGGER invalidate_material_owner AFTER UPDATE OR DELETE ON lde_security.resource_owners FOR EACH ROW EXECUTE FUNCTION lde_competition.invalidate_authority();

DO $body$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lde_competition' LOOP
   EXECUTE format('ALTER FUNCTION %s OWNER TO lde_guard',f.signature);
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
 END LOOP;
END;
$body$;
GRANT EXECUTE ON FUNCTION lde_competition.save_ruleset(uuid,uuid,int,jsonb,uuid),lde_competition.publish_ruleset(uuid,uuid,uuid,uuid),lde_competition.ruleset_records(uuid,uuid,int),
 lde_competition.save_contract(uuid,uuid,int,jsonb,uuid),lde_competition.offer_contract(uuid,uuid,uuid,uuid),lde_competition.acknowledge_contract(uuid,uuid,uuid,text,boolean,uuid),
 lde_competition.contract_workspace(uuid,uuid,int,uuid),lde_competition.contract_visible(uuid,uuid,uuid) TO lde_runtime;
