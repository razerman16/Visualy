#!/bin/sh
# The API is briefly stopped so the database snapshot and files agree.
set -eu
cd "$(dirname "$0")/.."
umask 077
scenzly_backup_root=${1:-../scenzly-backups}
mkdir -p "$scenzly_backup_root"
scenzly_backup_root=$(cd "$scenzly_backup_root" && pwd)
scenzly_backup_dir="$scenzly_backup_root/scenzly-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir "$scenzly_backup_dir"
scenzly_temp_dir=$(mktemp -d)
scenzly_was_running=false
scenzly_api_id=$(docker compose ps -a -q api)
if [ -z "$scenzly_api_id" ]; then
    printf '%s\n' 'Le conteneur API doit avoir ete cree avant la sauvegarde.' >&2
    rm -rf "$scenzly_temp_dir"
    rmdir "$scenzly_backup_dir"
    exit 1
fi
scenzly_was_running=$(docker inspect --format '{{.State.Running}}' "$scenzly_api_id")
cleanup() {
    scenzly_exit=$?
    trap - 0 INT TERM
    rm -rf "$scenzly_temp_dir"
    if [ "$scenzly_was_running" = true ]; then
        docker compose start api >&2 || scenzly_exit=1
    fi
    if [ "$scenzly_exit" -ne 0 ]; then
        printf 'Sauvegarde incomplete : %s\n' "$scenzly_backup_dir" >&2
    fi
    exit "$scenzly_exit"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
docker compose stop -t 150 api >&2
docker compose exec -T postgres pg_dump -U scenzly -d scenzly --format=custom > "$scenzly_backup_dir/database.dump"
mkdir "$scenzly_temp_dir/media"
docker compose cp api:/data/media/. "$scenzly_temp_dir/media/" >&2
tar -C "$scenzly_temp_dir/media" -czf "$scenzly_backup_dir/media.tar.gz" .
(
    cd "$scenzly_backup_dir"
    sha256sum database.dump media.tar.gz > checksums.sha256
)
printf '%s\n' 'Scenzly backup format 1' > "$scenzly_backup_dir/FORMAT"
printf 'Sauvegarde terminee : %s\n' "$scenzly_backup_dir"
printf '%s\n' 'Conservez aussi .env et, si utilise, le volume Caddy de certificats dans un emplacement protege.'
