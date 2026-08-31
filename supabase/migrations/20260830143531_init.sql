create extension if not exists pgcrypto;

create table if not exists knowledge (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('flood','darkness','narrow_path','barrier','safe_spot','other')),
  lat double precision not null,
  lng double precision not null,
  condition text not null check (condition in ('always','rain','night','crowded')),
  description text not null check (char_length(description) <= 200),
  confidence text not null check (confidence in ('experienced','heard','guess')),
  agree_count int not null default 0 check (agree_count >= 0),
  disagree_count int not null default 0 check (disagree_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists household (
  id uuid primary key default gen_random_uuid(),
  label text check (label is null or char_length(label) <= 20),
  constraints text[] not null default '{}',
  start_lat double precision not null,
  start_lng double precision not null,
  created_at timestamptz not null default now(),
  constraint household_constraints_are_enum check (
    constraints <@ array['wheelchair','infant','elderly','pet']::text[]
  )
);

create table if not exists bottleneck (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  severity int not null check (severity between 1 and 3),
  description text check (description is null or char_length(description) <= 200),
  household_id uuid references household(id),
  created_at timestamptz not null default now()
);

create table if not exists drill_run (
  id uuid primary key default gen_random_uuid(),
  scenario text not null check (scenario in ('earthquake','flood')),
  weather text not null check (weather in ('clear','rain')),
  routes jsonb not null,
  created_at timestamptz not null default now()
);

comment on table household is 'Privacy boundary: only anonymous label, constraint enums, and approximate demo origin are stored.';
