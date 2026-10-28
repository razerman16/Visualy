#!/bin/sh
# The API is briefly stopped so the database snapshot and files agree.
set -eu
cd "$(dirname "$0")/.."
umask 077
visualy_backup_root=${1:-../visualy-backups}
mkdir -p "$visualy_backup_root"
visualy_backup_root=$(cd "$visualy_backup_root" && pwd)
visualy_backup_dir="$visualy_backup_root/visualy-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir "$visualy_backup_dir"
visualy_temp_dir=$(mktemp -d)
visualy_was_running=false
visualy_api_id=$(docker compose ps -a -q api)
if [ -z "$visualy_api_id" ]; then
    printf '%s\n' 'Le conteneur API doit avoir ete cree avant la sauvegarde.' >&2
    rm -rf "$visualy_temp_dir"
    rmdir "$visualy_backup_dir"
    exit 1
fi
visualy_was_running=$(docker inspect --format '{{.State.Running}}' "$visualy_api_id")
cleanup() {
    visualy_exit=$?
    trap - 0 INT TERM
    rm -rf "$visualy_temp_dir"
    if [ "$visualy_was_running" = true ]; then
        docker compose start api >&2 || visualy_exit=1
    fi
    if [ "$visualy_exit" -ne 0 ]; then
        printf 'Sauvegarde incomplete : %s\n' "$visualy_backup_dir" >&2
    fi
    exit "$visualy_exit"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
docker compose stop -t 150 api >&2
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$visualy_backup_dir/database.dump"
mkdir "$visualy_temp_dir/media"
docker compose cp api:/data/media/. "$visualy_temp_dir/media/" >&2
tar -C "$visualy_temp_dir/media" -czf "$visualy_backup_dir/media.tar.gz" .
(
    cd "$visualy_backup_dir"
    sha256sum database.dump media.tar.gz > checksums.sha256
)
printf '%s\n' 'Visualy backup format 1' > "$visualy_backup_dir/FORMAT"
printf 'Sauvegarde terminee : %s\n' "$visualy_backup_dir"
printf '%s\n' 'Conservez aussi .env et, si utilise, le volume Caddy de certificats dans un emplacement protege.'
