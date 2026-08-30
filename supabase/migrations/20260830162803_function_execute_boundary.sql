-- Remove default EXECUTE grants that would expose public-schema functions to
-- browser roles. The three public mutation RPCs remain available only to an
-- authenticated caller; trigger and identity helpers are not browser APIs.

revoke execute on function public.apply_verification_count()
  from anon, authenticated, public;

revoke execute on function public.initialize_knowledge_counters()
  from anon, authenticated, public;

revoke execute on function public.server_verifier_id()
  from anon, authenticated, public;

revoke execute on function public.submit_verification(uuid, text, text)
  from anon, public;

revoke execute on function public.register_household(text, text[], double precision, double precision)
  from anon, public;

revoke execute on function public.report_bottleneck(double precision, double precision, integer, text, uuid)
  from anon, public;

grant execute on function public.submit_verification(uuid, text, text)
  to authenticated;

grant execute on function public.register_household(text, text[], double precision, double precision)
  to authenticated;

grant execute on function public.report_bottleneck(double precision, double precision, integer, text, uuid)
  to authenticated;
