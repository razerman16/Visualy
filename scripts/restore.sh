#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "$#" -ne 2 ] || [ "$2" != '--replace-existing-data' ]; then
    printf '%s\n' 'Usage: sh scripts/restore.sh CHEMIN_SAUVEGARDE --replace-existing-data' >&2
    printf '%s\n' 'Remplace la base et les medias existants. Sauvegardez-les auparavant.' >&2
    exit 2
fi
visualy_restore_dir=$(cd "$1" && pwd)
test -f "$visualy_restore_dir/FORMAT"
. ./scripts/legacy-identifiers.sh
backup_format=$(cat "$visualy_restore_dir/FORMAT")
case "$backup_format" in 'Visualy backup format 1'|"$LEGACY_BACKUP_FORMAT") ;; *) printf '%s\n' 'Unsupported backup format.' >&2; exit 1;; esac
(
    cd "$visualy_restore_dir"
    sha256sum -c checksums.sha256
)
visualy_api_id=$(docker compose ps -a -q api)
if [ -z "$visualy_api_id" ]; then
    printf '%s\n' 'Executez docker compose up -d --build --wait avant la restauration.' >&2
    exit 1
fi
docker compose stop -t 150 api
# Keep the API stopped on any failure; never serve a partially restored database.
docker compose exec -T postgres sh -c 'pg_restore --exit-on-error --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$visualy_restore_dir/database.dump"
docker compose run --rm --no-deps -T --user root --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --entrypoint sh api -c '
  set -eu
  find /data/media -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  tar -xzf - -C /data/media
  chown -R node:node /data/media
' < "$visualy_restore_dir/media.tar.gz"
docker compose run --rm --no-deps migrate
docker compose start api
printf '%s\n' 'Restauration terminee. Verifiez docker compose ps puis reconnectez les ecrans si necessaire.'
