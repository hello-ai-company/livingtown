-- Forward-only fix for the production shared long-distance drill demo.
--
-- The frontend validator snaps household origins to all ten DEMO_GRAPH_NODES
-- (src/sim/graph.ts), but this RPC's trusted server-side snap allowlist still
-- listed only the original six canonical nodes. A client registration on the
-- long-distance origin (long_home) therefore passed client validation and was
-- re-snapped by the server to canonical home, which broke the shared-mode
-- long-distance drill and its idempotent preset.
--
-- The ONLY behavioral change is the trusted snap node list: the four
-- long-distance demo graph nodes are added to the closed allowlist. This is
-- not an arbitrary-coordinate capability — the server keeps snapping to a
-- fixed trusted node set. Signature, language, security marking, identity
-- requirement, validations, scope, expiry, and response shape are unchanged.
create or replace function public.register_household(
  p_label text,
  p_constraints text[],
  p_start_lat double precision,
  p_start_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  snapped_lat double precision;
  snapped_lng double precision;
  created public.household;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authenticated identity is required';
  end if;
  if p_label is not null and (char_length(p_label) > 20 or p_label !~ '^世帯[A-Z0-9]{1,3}$') then
    raise exception 'household label must be an anonymous display label';
  end if;
  if p_constraints is null or not (p_constraints <@ array['wheelchair','infant','elderly','pet']::text[]) then
    raise exception 'household constraints are outside the allowed enum';
  end if;
  if p_start_lat is null or p_start_lng is null
    or p_start_lat not between 35.67 and 35.69
    or p_start_lng not between 139.75 and 139.77 then
    raise exception 'household origin is outside the demo area';
  end if;

  -- Store one of the trusted demo graph nodes, never an arbitrary
  -- address-like coordinate. The client performs the same snap for
  -- deterministic UX; this server-side snap is the trust boundary. The list
  -- mirrors every node in src/sim/graph.ts: the six canonical nodes plus the
  -- four long-distance drill extension nodes.
  select node_lat, node_lng into snapped_lat, snapped_lng
  from (values
    (35.6810::double precision, 139.7600::double precision),
    (35.6804::double precision, 139.7605::double precision),
    (35.6811::double precision, 139.7610::double precision),
    (35.6819::double precision, 139.7611::double precision),
    (35.6809::double precision, 139.7621::double precision),
    (35.6825::double precision, 139.7620::double precision),
    (35.6816::double precision, 139.7524::double precision),
    (35.6812::double precision, 139.7536::double precision),
    (35.6790::double precision, 139.7550::double precision),
    (35.6802::double precision, 139.7580::double precision)
  ) as nodes(node_lat, node_lng)
  order by power(node_lat - p_start_lat, 2) + power(node_lng - p_start_lng, 2)
  limit 1;

  insert into public.household (owner_id, label, constraints, start_lat, start_lng, location_scope, expires_at)
  values (actor, nullif(trim(p_label), ''), p_constraints, snapped_lat, snapped_lng, 'temporary_drill', now() + interval '24 hours')
  returning * into created;

  return jsonb_build_object(
    'id', created.id,
    'label', created.label,
    'constraints', created.constraints,
    'start_lat', created.start_lat,
    'start_lng', created.start_lng,
    'location_scope', created.location_scope,
    'expires_at', created.expires_at,
    'created_at', created.created_at
  );
end;
$$;

revoke all on function public.register_household(text, text[], double precision, double precision) from public;
revoke execute on function public.register_household(text, text[], double precision, double precision) from anon, public;
grant execute on function public.register_household(text, text[], double precision, double precision) to authenticated;
