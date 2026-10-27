#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -e .env ]; then
    printf '%s\n' '.env existe deja ; aucune modification.'
    exit 0
fi
umask 077
scenzly_password=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
if [ "${#scenzly_password}" -ne 64 ]; then
    printf '%s\n' 'Impossible de generer un secret aleatoire.' >&2
    exit 1
fi
# noclobber also protects a file created between the existence test and this write.
(
    set -C
    cat > .env <<EOF
POSTGRES_PASSWORD=$scenzly_password
BIND_ADDRESS=0.0.0.0
ADMIN_PORT=8080
PLAYER_PORT=8081
COOKIE_SECURE=false
EOF
)
unset scenzly_password
printf '%s\n' '.env cree avec un mot de passe PostgreSQL aleatoire (permissions 600).'
