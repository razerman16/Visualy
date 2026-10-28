#!/bin/sh
# Rename the Compose project while keeping its database, media and certificate volumes.
# Run on the existing Docker host before starting the new Visualy stack.
set -eu
cd "$(dirname "$0")/.."
umask 077
. ./scripts/legacy-identifiers.sh
old_containers=$(docker ps -a -q --filter label=com.docker.compose.project=$LEGACY_PROJECT)
if [ -z "$old_containers" ]; then
    if [ -f .env ] && grep -q '^COMPOSE_PROJECT_NAME=visualy$' .env && grep -q "^VOLUME_PREFIX=$LEGACY_PROJECT$" .env; then
        printf '%s\n' 'Migration deja configuree : les volumes existants sont conserves pour visualy.'
        exit 0
    fi
    if docker volume inspect "${LEGACY_PROJECT}_postgres18-data" >/dev/null 2>&1; then
        printf '%s\n' 'Anciens volumes historiques presents sans conteneurs. Redemarrez l’ancienne installation avant migration ; ne demarrez pas une nouvelle base vide.' >&2
        exit 1
    fi
    printf '%s\n' 'Aucun ancien projet historique : aucune migration necessaire.'
    exit 0
fi
if [ -n "$(docker ps -a -q --filter label=com.docker.compose.project=visualy)" ]; then
    printf '%s\n' 'Un projet visualy existe deja. Migration arretee pour ne pas melanger les installations.' >&2
    exit 1
fi
# Only migrate the known default installation; custom layouts need explicit review.
for pair in 'postgres postgres18-data /var/lib/postgresql' 'api media-data /data/media'; do
    set -- $pair
    id=$(docker ps -a -q --filter label=com.docker.compose.project=$LEGACY_PROJECT --filter "label=com.docker.compose.service=$1")
    test -n "$id"
    actual=$(docker inspect --format "{{range .Mounts}}{{if eq .Destination \"$3\"}}{{.Name}}{{end}}{{end}}" "$id")
    if [ "$actual" != "${LEGACY_PROJECT}_$2" ]; then
        printf 'Volume inattendu pour %s : migration arretee, donnees inchangees.\n' "$1" >&2
        exit 1
    fi
done
# Back up before stopping the previous project. A failed backup aborts the migration.
COMPOSE_PATH_SEPARATOR='|' COMPOSE_FILE=compose.yaml COMPOSE_PROJECT_NAME="$LEGACY_PROJECT" VOLUME_PREFIX="$LEGACY_PROJECT" sh scripts/backup.sh
mode_tmp=$(mktemp .env.visualy.XXXXXX)
trap 'rm -f "$mode_tmp"' EXIT HUP INT TERM
sed '/^COMPOSE_PROJECT_NAME=/d; /^VOLUME_PREFIX=/d' .env > "$mode_tmp"
printf '\nCOMPOSE_PROJECT_NAME=visualy\nVOLUME_PREFIX=%s\n' "$LEGACY_PROJECT" >> "$mode_tmp"
for identity_key in POSTGRES_USER POSTGRES_DB; do
    if ! grep -q "^${identity_key}=" "$mode_tmp"; then
        printf '%s=%s\n' "$identity_key" "$LEGACY_PROJECT" >> "$mode_tmp"
    fi
done
# No -v: all existing volumes, including the Caddy certificate authority, are retained.
COMPOSE_PROJECT_NAME="$LEGACY_PROJECT" VOLUME_PREFIX="$LEGACY_PROJECT" docker compose -f compose.yaml -f compose.https.yaml down --remove-orphans
mv "$mode_tmp" .env
trap - EXIT HUP INT TERM
printf '%s\n' 'Ancien projet arrete et sauvegarde. Volumes conserves pour visualy.' 'Lancez sh scripts/init-env.sh --http puis docker compose up -d --build --remove-orphans --wait.'
