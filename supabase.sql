create schema if not exists rich_dad_dashboard;

create table if not exists rich_dad_dashboard.dashboard_auth_config (
  id bigint generated always as identity primary key,
  key text not null unique,
  password_hash text not null,
  password_changed boolean not null default false,
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

drop policy if exists "deny_all_anon_select" on rich_dad_dashboard.dashboard_auth_config;
create policy "deny_all_anon_select"
on rich_dad_dashboard.dashboard_auth_config
for all
using (false)
with check (false);
