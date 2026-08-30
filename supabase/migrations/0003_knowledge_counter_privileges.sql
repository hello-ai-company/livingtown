-- Counter hardening follows 0002_verification_privacy_rls.sql.
-- A knowledge INSERT must start at zero; verification INSERT is the only
-- authenticated write path that is allowed to change the denormalized counts.

create or replace function public.initialize_knowledge_counters()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.agree_count := 0;
  new.disagree_count := 0;
  return new;
end;
$$;

drop trigger if exists knowledge_initialize_counters on public.knowledge;
create trigger knowledge_initialize_counters
  before insert on public.knowledge
  for each row execute function public.initialize_knowledge_counters();

-- Remove the broad INSERT privilege granted by 0002, then grant only the
-- columns supplied by the knowledge domain. Defaults provide id, counters,
-- and created_at. No browser role receives UPDATE on knowledge at all.
revoke insert, update, delete on table public.knowledge from anon, authenticated;
grant insert (category, lat, lng, condition, description, confidence)
  on table public.knowledge to authenticated;

comment on function public.initialize_knowledge_counters() is
  'Force new knowledge counters to zero before insert; verification trigger owns later counter changes.';
