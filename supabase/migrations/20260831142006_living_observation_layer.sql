-- Phase 10 draft only. Do not apply this migration from the browser, CI, or
-- production. It is intentionally stacked after the Phase 8 ownership CRUD
-- migration and must first be reviewed and exercised against a disposable
-- Supabase database.

alter table public.knowledge
  add column if not exists report_type text,
  add column if not exists observed_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists source_kind text,
  add column if not exists location_precision_m double precision;

-- The initial schema used an unnamed column check for category. Remove only
-- checks whose definition mentions category, then install one named check so
-- future migrations and pgTAP can address it deterministically.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.knowledge'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
      and conname <> 'knowledge_category_allowed'
  loop
    execute format('alter table public.knowledge drop constraint if exists %I', constraint_name);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.knowledge'::regclass
      and conname = 'knowledge_category_allowed'
  ) then
    alter table public.knowledge add constraint knowledge_category_allowed
      check (category in (
        'flood','fire','explosion','road_block','darkness','narrow_path',
        'barrier','safe_spot','theft','harassment','violence','conflict',
        'infrastructure','accessibility','crowding','other'
      ));
  end if;
end $$;

update public.knowledge
set report_type = 'persistent_condition'
where report_type is null;

update public.knowledge
set source_kind = 'community'
where source_kind is null;

update public.knowledge
set location_precision_m = 0
where location_precision_m is null;

alter table public.knowledge
  alter column report_type set default 'persistent_condition',
  alter column report_type set not null,
  alter column source_kind set default 'community',
  alter column source_kind set not null,
  alter column location_precision_m set default 0,
  alter column location_precision_m set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_report_type_allowed') then
    alter table public.knowledge add constraint knowledge_report_type_allowed
      check (report_type in ('persistent_condition','incident'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_source_kind_allowed') then
    alter table public.knowledge add constraint knowledge_source_kind_allowed
      check (source_kind in ('community','official'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_location_precision_allowed') then
    alter table public.knowledge add constraint knowledge_location_precision_allowed
      check (location_precision_m between 0 and 10000);
  end if;
end $$;

-- Existing rows must cross the same public boundary as new writes. Sensitive
-- categories and suspicious text are reduced to a category-level summary and
-- their stored coordinates are coarsened before the public privacy check is
-- installed. This intentionally discards raw sensitive wording.
with normalized as (
  select
    k.id,
    case
      when k.category in ('theft','harassment') then 150::double precision
      when k.category = 'violence' then 200::double precision
      when k.category = 'explosion' then 500::double precision
      when k.category = 'conflict' then 2000::double precision
      when k.description ~* '(\m(stole|stolen|theft|robbed|harassment|molest|stalking|assault|attacked|attack|violence|hit|punched|conflict|war|fighting|shelling|battle|military|soldier|troop|unit|weapon|tank|artillery|base|operation|explosion|blast)\M|\mgrop(e|ed|ing)\M|unwanted[[:space:]]+(touch|touching|contact)|sexual[[:space:]]+(harassment|contact|assault)|盗まれ|盗難|窃盗|痴漢|触られ|触った|性的接触|嫌がらせ|つきまとい|暴力|殴ら|襲わ|トラブル|紛争|戦闘|衝突|武力|砲撃|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備|爆発|爆発音|大きな衝撃)' then 2000::double precision
      else coalesce(k.location_precision_m, 0)::double precision
    end as precision_m,
    case
      when k.category = 'theft' then 'Community report: possible theft reported nearby.'
      when k.category = 'harassment' then 'Community report: possible harassment reported nearby.'
      when k.category = 'violence' then 'Community report: a possible violence-related event was reported nearby.'
      when k.category = 'conflict' then 'Community report: a possible conflict-related event was reported nearby.'
      when k.category = 'explosion' then 'Community report: a possible explosion or impact was reported nearby.'
      when k.description ~* '(\m(stole|stolen|theft|robbed|harassment|molest|stalking|assault|attacked|attack|violence|hit|punched|conflict|war|fighting|shelling|battle|military|soldier|troop|unit|weapon|tank|artillery|base|operation|explosion|blast)\M|\mgrop(e|ed|ing)\M|unwanted[[:space:]]+(touch|touching|contact)|sexual[[:space:]]+(harassment|contact|assault)|盗まれ|盗難|窃盗|痴漢|触られ|触った|性的接触|嫌がらせ|つきまとい|暴力|殴ら|襲わ|トラブル|紛争|戦闘|衝突|武力|砲撃|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備|爆発|爆発音|大きな衝撃)' then 'Community report: a sensitive safety concern was reported nearby.'
      else k.description
    end as public_description
  from public.knowledge as k
)
update public.knowledge as k
set description = normalized.public_description,
    location_precision_m = normalized.precision_m,
    lat = case
      when normalized.precision_m = 0 then k.lat
      else round(k.lat / (normalized.precision_m / 110540.0)) * (normalized.precision_m / 110540.0)
    end,
    lng = case
      when normalized.precision_m = 0 then k.lng
      else round(k.lng / (normalized.precision_m / (111320.0 * greatest(abs(cos(radians(k.lat))), 0.01::double precision)))) * (normalized.precision_m / (111320.0 * greatest(abs(cos(radians(k.lat))), 0.01::double precision)))
    end
from normalized
where k.id = normalized.id;

-- Expand-phase compatibility boundary. Phase 8 clients can still INSERT the
-- six legacy domain columns for a short window, but no raw sensitive wording
-- or caller-controlled metadata may reach the public row. The trigger is a
-- SECURITY DEFINER helper with an empty search_path and is not a browser API.
create or replace function public.normalize_knowledge_public_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_description text := trim(new.description);
  potentially_sensitive boolean;
  resolved_precision double precision;
  legacy_insert boolean;
  resolved_report_type text;
  resolved_observed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authenticated identity is required';
  end if;
  if raw_description is null or char_length(raw_description) not between 1 and 200 then
    raise exception 'knowledge description must be 1-200 characters';
  end if;
  if raw_description ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    or raw_description ~* 'https?://'
    or raw_description ~ '[0-9][0-9 ()-]{7,}[0-9]' then
    raise exception 'report may contain identifying information';
  end if;
  if raw_description ~* '(\m(military|soldier|troop|unit|weapon|tank|artillery|base|operation)\M|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備)'
    and raw_description ~* '(coordinate|coordinates|latitude|longitude|\blat\b|\blng\b|exact|precise|location|at[[:space:]]+[0-9]|座標|緯度|経度|正確|位置|地点|番地|丁目|東口|西口|南口|北口|[0-9]{2,})' then
    raise exception 'precise tactical information is not publishable';
  end if;

  potentially_sensitive := raw_description ~* '(\m(stole|stolen|theft|robbed|harassment|molest|stalking|assault|attacked|attack|violence|hit|punched|conflict|war|fighting|shelling|battle|military|soldier|troop|unit|weapon|tank|artillery|base|operation|explosion|blast)\M|\mgrop(e|ed|ing)\M|unwanted[[:space:]]+(touch|touching|contact)|sexual[[:space:]]+(harassment|contact|assault)|盗まれ|盗難|窃盗|痴漢|触られ|触った|性的接触|嫌がらせ|つきまとい|暴力|殴ら|襲わ|トラブル|紛争|戦闘|衝突|武力|砲撃|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備|爆発|爆発音|大きな衝撃)';
  resolved_precision := case
    when new.category in ('theft','harassment') then 150
    when new.category = 'violence' then 200
    when new.category = 'explosion' then 500
    when new.category = 'conflict' then 2000
    when potentially_sensitive then 2000
    else greatest(coalesce(new.location_precision_m, 0::double precision), 0::double precision)
  end;
  legacy_insert := tg_op = 'INSERT'
    and new.observed_at is null
    and new.expires_at is null
    and coalesce(new.location_precision_m, 0) = 0;

  new.description := case
    when new.category = 'theft' then 'Community report: possible theft reported nearby.'
    when new.category = 'harassment' then 'Community report: possible harassment reported nearby.'
    when new.category = 'violence' then 'Community report: a possible violence-related event was reported nearby.'
    when new.category = 'conflict' then 'Community report: a possible conflict-related event was reported nearby.'
    when new.category = 'explosion' then 'Community report: a possible explosion or impact was reported nearby.'
    when potentially_sensitive then 'Community report: a sensitive safety concern was reported nearby.'
    else raw_description
  end;
  new.location_precision_m := resolved_precision;
  new.source_kind := 'community';

  -- Legacy INSERTs arrive with only the six Phase 8 domain columns. New
  -- RPC writes carry observation metadata, so preserve their explicit report
  -- type while deriving a safe default for the old path.
  resolved_report_type := case
    when legacy_insert and new.category in ('road_block','crowding','fire','explosion','theft','harassment','violence','conflict') then 'incident'
    when legacy_insert then 'persistent_condition'
    else coalesce(new.report_type, case when new.category in ('road_block','crowding','fire','explosion','theft','harassment','violence','conflict') then 'incident' else 'persistent_condition' end)
  end;
  new.report_type := resolved_report_type;
  resolved_observed_at := case when resolved_report_type = 'incident' then coalesce(new.observed_at, pg_catalog.now()) else new.observed_at end;
  if resolved_observed_at is not null and resolved_observed_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'observed_at cannot be materially in the future';
  end if;
  new.observed_at := resolved_observed_at;
  new.expires_at := case
    when resolved_report_type <> 'incident' then null
    when new.category = 'road_block' then coalesce(resolved_observed_at, pg_catalog.now()) + interval '12 hours'
    when new.category in ('fire','explosion','conflict') then coalesce(resolved_observed_at, pg_catalog.now()) + interval '24 hours'
    when new.category = 'crowding' then coalesce(resolved_observed_at, pg_catalog.now()) + interval '6 hours'
    when new.category in ('theft','harassment') then coalesce(resolved_observed_at, pg_catalog.now()) + interval '30 days'
    when new.category = 'violence' then coalesce(resolved_observed_at, pg_catalog.now()) + interval '7 days'
    else null
  end;
  if resolved_precision > 0 then
    new.lat := pg_catalog.round(new.lat / (resolved_precision / 110540.0)) * (resolved_precision / 110540.0);
    new.lng := pg_catalog.round(new.lng / (resolved_precision / (111320.0 * greatest(pg_catalog.abs(pg_catalog.cos(pg_catalog.radians(new.lat))), 0.01::double precision)))) * (resolved_precision / (111320.0 * greatest(pg_catalog.abs(pg_catalog.cos(pg_catalog.radians(new.lat))), 0.01::double precision)));
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_knowledge_public_write() from public, anon, authenticated;
drop trigger if exists knowledge_normalize_public_write on public.knowledge;
create trigger knowledge_normalize_public_write
  before insert or update on public.knowledge
  for each row execute function public.normalize_knowledge_public_write();

-- This is a minimum database-side guard. The client has a richer localized
-- guard, but the trusted RPC repeats the check so a hand-written RPC caller
-- cannot bypass the publish boundary.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.knowledge'::regclass and conname = 'knowledge_description_basic_privacy') then
    alter table public.knowledge add constraint knowledge_description_basic_privacy
      check (
        description !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
        and description !~* 'https?://'
        and description !~ '[0-9][0-9 ()-]{7,}[0-9]'
      );
  end if;
end $$;

create index if not exists knowledge_observation_expiry_idx on public.knowledge (expires_at);
create index if not exists knowledge_observation_category_idx on public.knowledge (category, report_type);
create index if not exists knowledge_observation_source_idx on public.knowledge (source_kind);

create or replace function public.create_knowledge(
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_condition text,
  p_description text,
  p_confidence text,
  p_report_type text default null,
  p_observed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  resolved_report_type text;
  resolved_observed_at timestamptz;
  resolved_expires_at timestamptz;
  resolved_precision double precision;
  resolved_description text;
  potentially_sensitive boolean;
  stored_lat double precision;
  stored_lng double precision;
  inserted public.knowledge;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authenticated identity is required';
  end if;
  if p_category not in (
    'flood','fire','explosion','road_block','darkness','narrow_path',
    'barrier','safe_spot','theft','harassment','violence','conflict',
    'infrastructure','accessibility','crowding','other'
  ) then
    raise exception 'invalid knowledge category';
  end if;
  if p_condition not in ('always','rain','night','crowded') then
    raise exception 'invalid knowledge condition';
  end if;
  if p_confidence not in ('experienced','heard','guess') then
    raise exception 'invalid knowledge confidence';
  end if;
  if p_report_type is not null and p_report_type not in ('persistent_condition','incident') then
    raise exception 'invalid knowledge report type';
  end if;
  if p_lat is null or p_lng is null
    or p_lat not between -85.051129 and 85.051129
    or p_lng not between -180 and 180 then
    raise exception 'knowledge coordinate is outside the supported world bounds';
  end if;
  if p_description is null or char_length(trim(p_description)) not between 1 and 200 then
    raise exception 'knowledge description must be 1-200 characters';
  end if;
  if p_description ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    or p_description ~* 'https?://'
    or p_description ~ '[0-9][0-9 ()-]{7,}[0-9]' then
    raise exception 'report may contain identifying information';
  end if;
  if p_description ~* '(\m(military|soldier|troop|unit|weapon|tank|artillery|base|operation)\M|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備)'
    and p_description ~* '(coordinate|coordinates|latitude|longitude|\blat\b|\blng\b|exact|precise|location|at[[:space:]]+[0-9]|座標|緯度|経度|正確|位置|地点|番地|丁目|東口|西口|南口|北口|[0-9]{2,})' then
    raise exception 'precise tactical information is not publishable';
  end if;
  if p_observed_at is not null and p_observed_at > now() + interval '5 minutes' then
    raise exception 'observed_at cannot be materially in the future';
  end if;

  potentially_sensitive := p_description ~* '(\m(stole|stolen|theft|robbed|harassment|molest|stalking|assault|attacked|attack|violence|hit|punched|conflict|war|fighting|shelling|battle|military|soldier|troop|unit|weapon|tank|artillery|base|operation|explosion|blast)\M|\mgrop(e|ed|ing)\M|unwanted[[:space:]]+(touch|touching|contact)|sexual[[:space:]]+(harassment|contact|assault)|盗まれ|盗難|窃盗|痴漢|触られ|触った|性的接触|嫌がらせ|つきまとい|暴力|殴ら|襲わ|トラブル|紛争|戦闘|衝突|武力|砲撃|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備|爆発|爆発音|大きな衝撃)';

  resolved_report_type := coalesce(p_report_type, case when p_category in ('road_block','crowding','fire','explosion','theft','harassment','violence','conflict') then 'incident' else 'persistent_condition' end);
  resolved_observed_at := case when resolved_report_type = 'incident' then coalesce(p_observed_at, now()) else p_observed_at end;
  resolved_expires_at := case
    when resolved_report_type <> 'incident' then null
    when p_category = 'road_block' then coalesce(resolved_observed_at, now()) + interval '12 hours'
    when p_category in ('fire','explosion','conflict') then coalesce(resolved_observed_at, now()) + interval '24 hours'
    when p_category = 'crowding' then coalesce(resolved_observed_at, now()) + interval '6 hours'
    when p_category in ('theft','harassment') then coalesce(resolved_observed_at, now()) + interval '30 days'
    when p_category = 'violence' then coalesce(resolved_observed_at, now()) + interval '7 days'
    else null
  end;
  resolved_precision := case
    when p_category in ('theft','harassment') then 150
    when p_category = 'violence' then 200
    when p_category = 'explosion' then 500
    when p_category = 'conflict' then 2000
    when potentially_sensitive then 2000
    else 0
  end;
  resolved_description := case
    when p_category = 'theft' then 'Community report: possible theft reported nearby.'
    when p_category = 'harassment' then 'Community report: possible harassment reported nearby.'
    when p_category = 'violence' then 'Community report: a possible violence-related event was reported nearby.'
    when p_category = 'conflict' then 'Community report: a possible conflict-related event was reported nearby.'
    when p_category = 'explosion' then 'Community report: a possible explosion or impact was reported nearby.'
    when potentially_sensitive then 'Community report: a sensitive safety concern was reported nearby.'
    else trim(p_description)
  end;
  stored_lat := case when resolved_precision = 0 then p_lat else round(p_lat / (resolved_precision / 110540.0)) * (resolved_precision / 110540.0) end;
  stored_lng := case when resolved_precision = 0 then p_lng else round(p_lng / (resolved_precision / (111320.0 * greatest(abs(cos(radians(p_lat))), 0.01::double precision)))) * (resolved_precision / (111320.0 * greatest(abs(cos(radians(p_lat))), 0.01::double precision))) end;

  insert into public.knowledge (
    category, lat, lng, condition, description, confidence,
    report_type, observed_at, expires_at, source_kind, location_precision_m
  ) values (
    p_category, stored_lat, stored_lng, p_condition, resolved_description, p_confidence,
    resolved_report_type, resolved_observed_at, resolved_expires_at, 'community', resolved_precision
  ) returning * into inserted;

  return jsonb_build_object(
    'id', inserted.id,
    'category', inserted.category,
    'lat', inserted.lat,
    'lng', inserted.lng,
    'condition', inserted.condition,
    'description', inserted.description,
    'confidence', inserted.confidence,
    'agree_count', inserted.agree_count,
    'disagree_count', inserted.disagree_count,
    'created_at', inserted.created_at,
    'updated_at', inserted.updated_at,
    'report_type', inserted.report_type,
    'observed_at', inserted.observed_at,
    'expires_at', inserted.expires_at,
    'source_kind', inserted.source_kind,
    'location_precision_m', inserted.location_precision_m
  );
end;
$$;

revoke all on function public.create_knowledge(text, double precision, double precision, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_knowledge(text, double precision, double precision, text, text, text, text, timestamptz) to authenticated;

-- TEMPORARY LEGACY INSERT COMPATIBILITY WINDOW
-- Phase 8 temporarily granted authenticated INSERT on domain columns. Keep
-- those six columns during expand so an old client is not cut off before the
-- new app is deployed; the BEFORE trigger above is the safety boundary. The
-- post-deploy contract in docs/sql/POST_DEPLOY_RPC_ONLY_KNOWLEDGE_WRITE.sql
-- revokes this grant after the new RPC path is proven in production.
revoke insert, update, delete on table public.knowledge from anon, authenticated;
grant insert (category, lat, lng, condition, description, confidence)
  on table public.knowledge to authenticated;

drop function if exists public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean);

create function public.update_knowledge(
  p_knowledge_id uuid,
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_condition text,
  p_description text,
  p_confidence text,
  p_confirm_reverification_reset boolean,
  p_report_type text,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  locked public.knowledge;
  resolved_report_type text;
  resolved_observed_at timestamptz;
  resolved_expires_at timestamptz;
  resolved_precision double precision;
  resolved_description text;
  potentially_sensitive boolean;
  stored_lat double precision;
  stored_lng double precision;
  has_votes boolean;
  updated public.knowledge;
begin
  actor := auth.uid();
  if actor is null then raise exception 'authenticated identity is required'; end if;
  if p_category not in ('flood','fire','explosion','road_block','darkness','narrow_path','barrier','safe_spot','theft','harassment','violence','conflict','infrastructure','accessibility','crowding','other') then raise exception 'invalid knowledge category'; end if;
  if p_condition not in ('always','rain','night','crowded') then raise exception 'invalid knowledge condition'; end if;
  if p_confidence not in ('experienced','heard','guess') then raise exception 'invalid knowledge confidence'; end if;
  if p_report_type is not null and p_report_type not in ('persistent_condition','incident') then raise exception 'invalid knowledge report type'; end if;
  if p_lat is null or p_lng is null or p_lat not between -85.051129 and 85.051129 or p_lng not between -180 and 180 then raise exception 'knowledge coordinate is outside the supported world bounds'; end if;
  if p_description is null or char_length(trim(p_description)) not between 1 and 200 then raise exception 'knowledge description must be 1-200 characters'; end if;
  if p_description ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' or p_description ~* 'https?://' or p_description ~ '[0-9][0-9 ()-]{7,}[0-9]' then raise exception 'report may contain identifying information'; end if;
  if p_description ~* '(\m(military|soldier|troop|unit|weapon|tank|artillery|base|operation)\M|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備)' and p_description ~* '(coordinate|coordinates|latitude|longitude|\blat\b|\blng\b|exact|precise|location|at[[:space:]]+[0-9]|座標|緯度|経度|正確|位置|地点|番地|丁目|東口|西口|南口|北口|[0-9]{2,})' then raise exception 'precise tactical information is not publishable'; end if;
  if p_observed_at is not null and p_observed_at > now() + interval '5 minutes' then raise exception 'observed_at cannot be materially in the future'; end if;
  potentially_sensitive := p_description ~* '(\m(stole|stolen|theft|robbed|harassment|molest|stalking|assault|attacked|attack|violence|hit|punched|conflict|war|fighting|shelling|battle|military|soldier|troop|unit|weapon|tank|artillery|base|operation|explosion|blast)\M|\mgrop(e|ed|ing)\M|unwanted[[:space:]]+(touch|touching|contact)|sexual[[:space:]]+(harassment|contact|assault)|盗まれ|盗難|窃盗|痴漢|触られ|触った|性的接触|嫌がらせ|つきまとい|暴力|殴ら|襲わ|トラブル|紛争|戦闘|衝突|武力|砲撃|軍人|兵士|部隊|武器|戦車|砲|基地|作戦|装備|爆発|爆発音|大きな衝撃)';

  select k.* into locked
  from public.knowledge as k
  join public.knowledge_owner as ko on ko.knowledge_id = k.id and ko.owner_id = actor
  where k.id = p_knowledge_id
  for update;
  if not found then raise exception 'knowledge not found or not owned by the current identity'; end if;
  has_votes := locked.agree_count + locked.disagree_count > 0;
  if has_votes and p_confirm_reverification_reset is not true then raise exception 'reverification confirmation is required'; end if;

  resolved_report_type := coalesce(p_report_type, case when p_category = locked.category then locked.report_type else case when p_category in ('road_block','crowding','fire','explosion','theft','harassment','violence','conflict') then 'incident' else 'persistent_condition' end end);
  resolved_observed_at := case when resolved_report_type = 'incident' then coalesce(p_observed_at, case when p_category = locked.category then locked.observed_at end, now()) else p_observed_at end;
  if resolved_observed_at is not null and resolved_observed_at > now() + interval '5 minutes' then raise exception 'observed_at cannot be materially in the future'; end if;
  resolved_expires_at := case
    when resolved_report_type <> 'incident' then null
    when p_category = 'road_block' then coalesce(resolved_observed_at, now()) + interval '12 hours'
    when p_category in ('fire','explosion','conflict') then coalesce(resolved_observed_at, now()) + interval '24 hours'
    when p_category = 'crowding' then coalesce(resolved_observed_at, now()) + interval '6 hours'
    when p_category in ('theft','harassment') then coalesce(resolved_observed_at, now()) + interval '30 days'
    when p_category = 'violence' then coalesce(resolved_observed_at, now()) + interval '7 days'
    else null
  end;
  resolved_precision := case when p_category in ('theft','harassment') then 150 when p_category = 'violence' then 200 when p_category = 'explosion' then 500 when p_category = 'conflict' then 2000 when potentially_sensitive then 2000 else 0 end;
  resolved_description := case
    when p_category = 'theft' then 'Community report: possible theft reported nearby.'
    when p_category = 'harassment' then 'Community report: possible harassment reported nearby.'
    when p_category = 'violence' then 'Community report: a possible violence-related event was reported nearby.'
    when p_category = 'conflict' then 'Community report: a possible conflict-related event was reported nearby.'
    when p_category = 'explosion' then 'Community report: a possible explosion or impact was reported nearby.'
    when potentially_sensitive then 'Community report: a sensitive safety concern was reported nearby.'
    else trim(p_description)
  end;
  stored_lat := case when resolved_precision = 0 then p_lat else round(p_lat / (resolved_precision / 110540.0)) * (resolved_precision / 110540.0) end;
  stored_lng := case when resolved_precision = 0 then p_lng else round(p_lng / (resolved_precision / (111320.0 * greatest(abs(cos(radians(p_lat))), 0.01::double precision)))) * (resolved_precision / (111320.0 * greatest(abs(cos(radians(p_lat))), 0.01::double precision))) end;

  if has_votes then delete from public.verification where knowledge_id = p_knowledge_id; end if;
  update public.knowledge set
    category = p_category, lat = stored_lat, lng = stored_lng, condition = p_condition,
    description = resolved_description, confidence = p_confidence,
    report_type = resolved_report_type, observed_at = resolved_observed_at,
    expires_at = resolved_expires_at, source_kind = 'community', location_precision_m = resolved_precision,
    agree_count = case when has_votes then 0 else agree_count end,
    disagree_count = case when has_votes then 0 else disagree_count end,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_knowledge_id returning * into updated;

  return jsonb_build_object(
    'id', updated.id, 'category', updated.category, 'lat', updated.lat, 'lng', updated.lng,
    'condition', updated.condition, 'description', updated.description, 'confidence', updated.confidence,
    'agree_count', updated.agree_count, 'disagree_count', updated.disagree_count,
    'created_at', updated.created_at, 'updated_at', updated.updated_at,
    'report_type', updated.report_type, 'observed_at', updated.observed_at, 'expires_at', updated.expires_at,
    'source_kind', updated.source_kind, 'location_precision_m', updated.location_precision_m,
    'reverification_required', has_votes, 'route_invalidated', true
  );
end;
$$;

-- Preserve the pre-Phase-10 positional RPC for old clients while routing it
-- through the same trusted implementation and new metadata defaults.
create function public.update_knowledge(
  p_knowledge_id uuid,
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_condition text,
  p_description text,
  p_confidence text,
  p_confirm_reverification_reset boolean
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.update_knowledge($1,$2,$3,$4,$5,$6,$7,$8,null,null);
$$;

revoke all on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean, text, timestamptz) to authenticated;
revoke all on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) to authenticated;

comment on table public.knowledge is 'Community observations and local knowledge. User reports remain community-sourced until the existing verification threshold is reached; official source rows are not writable by browser roles.';
comment on column public.knowledge.report_type is 'persistent_condition or incident; incident rows receive a category-specific current-map expiry.';
comment on column public.knowledge.observed_at is 'When the community observation was seen or reported; incident writes default to now.';
comment on column public.knowledge.expires_at is 'Current-map visibility expiry for incidents. Expiry does not erase historical occurrence.';
comment on column public.knowledge.source_kind is 'Trusted source label. Browser-created rows are always community.';
comment on column public.knowledge.location_precision_m is 'Approximate precision applied before storing sensitive community coordinates.';
comment on function public.create_knowledge(text, double precision, double precision, text, text, text, text, timestamptz) is 'Authenticated-only community observation write boundary. Derives ownership, source, privacy precision, counters, timestamps, and expiry.';
comment on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean, text, timestamptz) is 'Owner-only observation update. Reapplies geoprivacy and resets verification only with explicit confirmation.';
comment on function public.normalize_knowledge_public_write() is 'Expand-phase trigger boundary. Sanitizes legacy direct inserts and RPC writes before a public Knowledge row is stored; not executable by browser roles.';

-- Realtime remains limited to public Knowledge rows. No new table or channel
-- is introduced for observations; the existing adapter refetches Knowledge.
