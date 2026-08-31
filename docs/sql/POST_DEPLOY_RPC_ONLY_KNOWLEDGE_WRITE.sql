-- POST-DEPLOY CONTRACT DRAFT — DO NOT APPLY DURING EXPAND
--
-- Apply this contract only after the Phase 10.2 app is deployed, the shared
-- browser write/read gate is green, and the new RPC path has been observed in
-- production. It intentionally lives outside supabase/migrations so a normal
-- migration run cannot revoke the temporary Phase 8 compatibility grant early.
--
-- Prerequisites:
--   1. 20260831075455_real_map_knowledge_ownership_crud.sql is applied.
--   2. 20260831142006_living_observation_layer.sql is applied and the
--      knowledge_normalize_public_write trigger remains installed.
--   3. Existing clients no longer rely on direct domain-column INSERT.
--   4. create_knowledge/update_knowledge/delete_knowledge and
--      submit_verification have passed the hosted security gate.

begin;

-- RPC-only write boundary. The expand migration deliberately leaves the
-- six-column INSERT grant in place until this explicit post-deploy step.
revoke insert, update, delete on table public.knowledge from anon, authenticated;

revoke all on function public.create_knowledge(text, double precision, double precision, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_knowledge(text, double precision, double precision, text, text, text, text, timestamptz) to authenticated;

revoke all on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean, text, timestamptz) to authenticated;
revoke all on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.update_knowledge(uuid, text, double precision, double precision, text, text, text, boolean) to authenticated;

-- Keep the trigger as defense in depth for SECURITY DEFINER writes and future
-- operator mistakes. Browser roles must not call it directly.
revoke all on function public.normalize_knowledge_public_write() from public, anon, authenticated;

comment on table public.knowledge is 'Knowledge writes are RPC-only after the Phase 10.2 post-deploy contract. Browser-created rows remain community-sourced and pass the normalization trigger.';

commit;
