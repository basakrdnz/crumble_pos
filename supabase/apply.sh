#!/usr/bin/env bash
# Applies the migrations the database does not have yet, in name order, each in
# its own transaction together with its row in private.schema_migrations.
# Usage: SUPABASE_DB_URL=postgresql://... supabase/apply.sh
#
# Migrations up to BASELINE were applied by hand in the SQL Editor (setup.sql
# and the single files given to the user); the first run only records them.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
BASELINE=20261103000011

psql_db() { psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -q "$@"; }

if [ "$(psql_db -tAc "select to_regclass('private.schema_migrations') is not null")" != t ]; then
  echo "First run: recording the migrations applied by hand (up to $BASELINE)."
  {
    echo "create table private.schema_migrations (version text primary key, name text not null, applied_at timestamptz not null default now());"
    echo "revoke all on private.schema_migrations from public;"
    for f in "$here"/migrations/*.sql; do
      name="$(basename "$f" .sql)"
      version="${name%%_*}"
      if [ "$version" -le "$BASELINE" ]; then
        echo "insert into private.schema_migrations (version, name) values ('$version', '$name');"
      fi
    done
  } | psql_db -1 -f -
fi

applied="$(psql_db -tAc "select version from private.schema_migrations")"
count=0
for f in "$here"/migrations/*.sql; do
  name="$(basename "$f" .sql)"
  version="${name%%_*}"
  if grep -qx "$version" <<<"$applied"; then
    continue
  fi
  echo "Applying $name"
  psql_db -1 -f "$f" -c "insert into private.schema_migrations (version, name) values ('$version', '$name');"
  count=$((count + 1))
done
echo "Done: $count new migration(s)."
psql_db -tAc "select version || '  ' || name from private.schema_migrations order by version desc limit 3"
