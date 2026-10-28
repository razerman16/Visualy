#!/bin/sh
# Run using the new checkout while the PostgreSQL 17 container is still running.
set -eu
cd "$(dirname "$0")/.."
version=$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SHOW server_version_num"' )
case "$version" in 17????) ;; *) printf '%s\n' 'Migration attendue depuis PostgreSQL 17 uniquement.' >&2; exit 1;; esac
# Build first; keep existing installation running on build failure.
docker compose build
docker compose pull postgres
backup_root=$(mktemp -d "${PWD}/../visualy-pg17-backup.XXXXXX")
sh scripts/backup.sh "$backup_root"
backup=$(find "$backup_root" -name database.dump -type f)
test -n "$backup"
docker compose stop -t 150 api
docker compose up -d --wait postgres
# A nonempty target is never overwritten by this migration.
count=$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' sh "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
test "$count" = 0 || { printf '%s\n' 'Base cible non vide. API arretee ; sauvegarde conservee.' >&2; exit 1; }
docker compose exec -T postgres sh -c 'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"'  < "$backup"
docker compose up -d --wait
printf 'Migration terminee. Sauvegarde : %s\nAncien volume PostgreSQL 17 conserve.\n' "$backup_root"
