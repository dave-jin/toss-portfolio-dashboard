create schema if not exists rich_dad_dashboard;

create table if not exists rich_dad_dashboard.dashboard_auth_config (
  id bigint generated always as identity primary key,
  key text not null unique,
  password_hash text not null,
  password_changed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists rich_dad_dashboard.dashboard_asset_profiles (
  symbol text primary key,
  display_name text not null,
  market text,
  market_code text,
  tab_key text not null default 'watchlist',
  role text,
  why_bought jsonb not null default '[]'::jsonb,
  why_sold text not null default '',
  review_triggers jsonb not null default '[]'::jsonb,
  sell_plan jsonb not null default '{}'::jsonb,
  next_best_action text not null default '',
  memo text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists rich_dad_dashboard.dashboard_trade_history (
  trade_id text primary key,
  symbol text not null,
  display_name text not null,
  market text,
  market_code text,
  side text not null,
  status text not null,
  quantity numeric,
  filled_quantity numeric,
  price numeric,
  average_execution_price numeric,
  order_date date,
  submitted_at timestamptz,
  trade_note text not null default '',
  source text not null default 'tossctl',
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists rich_dad_dashboard.dashboard_journal_entries (
  id bigint generated always as identity primary key,
  entry_date date not null default current_date,
  title text not null,
  body text not null,
  tags jsonb not null default '[]'::jsonb,
  related_symbols jsonb not null default '[]'::jsonb,
  mood text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rich_dad_dashboard.dashboard_runtime_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists rich_dad_dashboard.dashboard_snapshots (
  generated_at timestamptz primary key,
  note text not null default '',
  summary jsonb not null default '{}'::jsonb,
  positions jsonb not null default '[]'::jsonb,
  latest jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  advice jsonb not null default '[]'::jsonb,
  cautions jsonb not null default '[]'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  headline jsonb not null default '{}'::jsonb,
  source text not null default 'tossctl',
  updated_at timestamptz not null default now()
);

create table if not exists rich_dad_dashboard.dashboard_market_cache (
  cache_key text primary key,
  symbol text not null,
  market text,
  market_code text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists rich_dad_dashboard.dashboard_news_items (
  id bigint generated always as identity primary key,
  symbol text not null,
  display_name text not null,
  query text not null default '',
  title text not null,
  summary text not null default '',
  source text not null default '',
  url text not null unique,
  published_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into rich_dad_dashboard.dashboard_auth_config (key, password_hash, password_changed)
values ('dashboard_password', 'scrypt$bd977546916af59e14dcbe5e4d42ae5b$dd4e7f83ff1122ce2e0b3293698ac255e8d15ef6da41eaa4c391d2423326bd827b0963597fa0693a7fe511e527ddfd64550f2e58d52919a831ac95c6a305783a', false)
on conflict (key) do nothing;

grant usage on schema rich_dad_dashboard to anon, authenticated, service_role;
grant all on all tables in schema rich_dad_dashboard to anon, authenticated, service_role;
grant all on all routines in schema rich_dad_dashboard to anon, authenticated, service_role;
grant all on all sequences in schema rich_dad_dashboard to anon, authenticated, service_role;
alter default privileges for role postgres in schema rich_dad_dashboard grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema rich_dad_dashboard grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema rich_dad_dashboard grant all on sequences to anon, authenticated, service_role;

alter table rich_dad_dashboard.dashboard_auth_config enable row level security;
alter table rich_dad_dashboard.dashboard_asset_profiles enable row level security;
alter table rich_dad_dashboard.dashboard_trade_history enable row level security;
alter table rich_dad_dashboard.dashboard_journal_entries enable row level security;
alter table rich_dad_dashboard.dashboard_runtime_config enable row level security;
alter table rich_dad_dashboard.dashboard_snapshots enable row level security;
alter table rich_dad_dashboard.dashboard_market_cache enable row level security;
alter table rich_dad_dashboard.dashboard_news_items enable row level security;

drop policy if exists "deny_all_auth_config" on rich_dad_dashboard.dashboard_auth_config;
create policy "deny_all_auth_config"
on rich_dad_dashboard.dashboard_auth_config
for all
using (false)
with check (false);

drop policy if exists "deny_all_asset_profiles" on rich_dad_dashboard.dashboard_asset_profiles;
create policy "deny_all_asset_profiles"
on rich_dad_dashboard.dashboard_asset_profiles
for all
using (false)
with check (false);

drop policy if exists "deny_all_trade_history" on rich_dad_dashboard.dashboard_trade_history;
create policy "deny_all_trade_history"
on rich_dad_dashboard.dashboard_trade_history
for all
using (false)
with check (false);

drop policy if exists "deny_all_journal_entries" on rich_dad_dashboard.dashboard_journal_entries;
create policy "deny_all_journal_entries"
on rich_dad_dashboard.dashboard_journal_entries
for all
using (false)
with check (false);

drop policy if exists "deny_all_runtime_config" on rich_dad_dashboard.dashboard_runtime_config;
create policy "deny_all_runtime_config"
on rich_dad_dashboard.dashboard_runtime_config
for all
using (false)
with check (false);

drop policy if exists "deny_all_snapshots" on rich_dad_dashboard.dashboard_snapshots;
create policy "deny_all_snapshots"
on rich_dad_dashboard.dashboard_snapshots
for all
using (false)
with check (false);

drop policy if exists "deny_all_market_cache" on rich_dad_dashboard.dashboard_market_cache;
create policy "deny_all_market_cache"
on rich_dad_dashboard.dashboard_market_cache
for all
using (false)
with check (false);

drop policy if exists "deny_all_news_items" on rich_dad_dashboard.dashboard_news_items;
create policy "deny_all_news_items"
on rich_dad_dashboard.dashboard_news_items
for all
using (false)
with check (false);
