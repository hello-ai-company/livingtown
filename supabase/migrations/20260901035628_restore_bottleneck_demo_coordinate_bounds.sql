-- Restore the original demonstration-area integrity boundary after the
-- Phase 8/10 rollout. Existing rows were preflighted before this migration;
-- no out-of-area bottleneck row is rewritten.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bottleneck'::regclass
      and conname = 'bottleneck_demo_coordinate_bounds'
  ) then
    alter table public.bottleneck add constraint bottleneck_demo_coordinate_bounds
      check (lat between 35.67 and 35.69 and lng between 139.75 and 139.77);
  end if;
end $$;
