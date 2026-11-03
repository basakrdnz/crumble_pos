-- LOCAL TESTING ONLY. Never apply to a Supabase project.
-- Minimal stand-in for what Supabase provides, so the migrations can be
-- tested on a plain Postgres: roles, auth.users, auth.uid(), auth.jwt() and
-- Supabase's default table grants.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

-- Supabase creates this publication for Realtime.
create publication supabase_realtime;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- pg_net (Supabase extension): http_post only records the request here.
create schema net;
create table net.calls (id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                              headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language sql as $$
  insert into net.calls (url, body, headers) values (url, body, headers) returning id;
$$;
