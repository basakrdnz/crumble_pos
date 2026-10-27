#!/usr/bin/env bash
# Runs the migrations and db.test.sql against a throwaway local Postgres
# cluster (no Supabase project involved). Needs Postgres 15+ binaries.
# Usage: supabase/tests/run_local.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../migrations"
pg_bin="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls -d /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
work="$(mktemp -d)"
port="${PG_TEST_PORT:-54329}"

# Postgres refuses to run as root; use the postgres user when we are root.
run() {
  if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi
}
[ "$(id -u)" = 0 ] && chown postgres "$work"

cleanup() {
  run "'$pg_bin/pg_ctl' -D '$work/data' -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

run "'$pg_bin/initdb' -D '$work/data' -U postgres -A trust" >/dev/null
run "'$pg_bin/pg_ctl' -D '$work/data' -o '-p $port -k $work -c listen_addresses=' -l '$work/log' -w start" >/dev/null

psql_cmd="'$pg_bin/psql' -h '$work' -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
run "$psql_cmd -f '$here/supabase_stub.sql'"
for f in "$migrations"/*.sql; do
  echo "migration: $(basename "$f")"
  run "$psql_cmd -f '$f'"
done
run "$psql_cmd -f '$here/db.test.sql'"
