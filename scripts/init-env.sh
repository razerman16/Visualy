#!/bin/sh
# Idempotent upgrade: never replace existing secrets. No secret is printed.
set -eu
cd "$(dirname "$0")/.."
umask 077
if [ ! -e .env ]; then (set -C; : > .env); fi
chmod 600 .env
for key in POSTGRES_PASSWORD APP_DB_PASSWORD SETUP_TOKEN CONVERTER_TOKEN; do
    if ! grep -q "^${key}=." .env; then
        value=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
        test "${#value}" -eq 64
        printf '\n%s=%s\n' "$key" "$value" >> .env
    fi
done
unset value
printf '%s\n' '.env prepare (permissions 600). Secrets existants conserves.' 'Pour la premiere installation, utilisez SETUP_TOKEN de .env dans le formulaire.' 'Configurez les noms ADMIN_DOMAIN et PLAYER_DOMAIN et approuvez le certificat HTTPS local.'
