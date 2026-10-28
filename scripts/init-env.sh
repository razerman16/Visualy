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
# Make supported network settings discoverable in generated and existing files.
# Preserve user choices, including custom ports.
while IFS='=' read -r key value; do
    if ! grep -q "^${key}=" .env; then
        printf '\n%s=%s\n' "$key" "$value" >> .env
    fi
done <<'DEFAULTS'
BIND_ADDRESS=0.0.0.0
CADDY_HTTP_PORT=80
CADDY_HTTPS_PORT=443
DEV_ADMIN_PORT=8080
DEV_PLAYER_PORT=8081
ADMIN_DOMAIN=admin.scenzly.home.arpa
PLAYER_DOMAIN=player.scenzly.home.arpa
DEFAULTS
unset key value
printf '%s\n' '.env prepare (permissions 600). Secrets existants conserves.' 'Pour la premiere installation, utilisez SETUP_TOKEN de .env dans le formulaire.' 'Configurez ADMIN_DOMAIN, PLAYER_DOMAIN, CADDY_HTTP_PORT et CADDY_HTTPS_PORT, puis approuvez le certificat HTTPS local.'
