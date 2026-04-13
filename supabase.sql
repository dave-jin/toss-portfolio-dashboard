create schema if not exists rich_dad_dashboard;

create table if not exists rich_dad_dashboard.dashboard_auth_config (
  id bigint generated always as identity primary key,
  key text not null unique,
  password_hash text not null,
  password_changed boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into rich_dad_dashboard.dashboard_auth_config (key, password_hash, password_changed)
values ('dashboard_password', 'scrypt$placeholder$replace-after-first-run', false)
on conflict (key) do nothing;

alter table rich_dad_dashboard.dashboard_auth_config enable row level security;

drop policy if exists "deny_all_anon_select" on rich_dad_dashboard.dashboard_auth_config;
create policy "deny_all_anon_select"
on rich_dad_dashboard.dashboard_auth_config
for all
using (false)
with check (false);
