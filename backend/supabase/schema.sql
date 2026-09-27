-- RAKSHA database schema (Supabase / Postgres 15+). Paste into Supabase > SQL Editor > Run.
-- The backend uses the service_role key (server-side only); browsers never talk to Supabase directly,
-- so every table has row-level security ON with no public policies.
create extension if not exists pg_trgm;

create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  install_id text,
  page_domain text,
  page_url text,
  verdict text,
  risk int,
  image_hash text,
  ocr_text text,
  claims jsonb,
  charges jsonb,
  evidence jsonb,
  trace jsonb,
  model text
);
create index if not exists scans_created_idx on scans (created_at desc);
create index if not exists scans_hash_idx on scans (image_hash) where verdict = 'FRAUD';

create table if not exists indicators (
  kind text not null check (kind in ('domain','phone','upi','reg_no','image_hash')),
  value text not null,
  scam_count int not null default 0,
  safe_count int not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (kind, value)
);
create index if not exists indicators_value_trgm on indicators using gin (value gin_trgm_ops);

create table if not exists reports (
  id bigint generated always as identity primary key,
  scan_id uuid references scans(id) on delete cascade,
  install_id text,
  label text not null check (label in ('scam','safe','unsure')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists installs (
  install_id text primary key,
  language text,
  text_size text,
  family_hint text,          -- last 4 digits only; the full number stays in the browser
  created_at timestamptz not null default now()
);

alter table scans enable row level security;
alter table indicators enable row level security;
alter table reports enable row level security;
alter table installs enable row level security;

-- atomic upsert-and-increment used by the backend
create or replace function bump_indicator(p_kind text, p_value text, p_scam int, p_safe int)
returns void language sql security definer as $$
  insert into indicators (kind, value, scam_count, safe_count) values (p_kind, p_value, p_scam, p_safe)
  on conflict (kind, value) do update
    set scam_count = indicators.scam_count + excluded.scam_count,
        safe_count = indicators.safe_count + excluded.safe_count,
        last_seen = now();
$$;
