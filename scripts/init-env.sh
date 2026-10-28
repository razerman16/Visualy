#!/bin/sh
# Idempotent upgrade: never replace existing secrets. No secret is printed.
set -eu
cd "$(dirname "$0")/.."
case "${1:-}" in
    ''|--ip) ;;
    *) printf '%s\n' 'Usage: sh scripts/init-env.sh [--ip]' >&2; exit 1 ;;
esac
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
CADDY_PLAYER_HTTPS_PORT=8443
LOCAL_PLAYER_HTTPS_PORT=8443
DEV_ADMIN_PORT=8080
DEV_PLAYER_PORT=8081
ADMIN_DOMAIN=admin.visualy.home.arpa
PLAYER_DOMAIN=player.visualy.home.arpa
DEFAULTS
unset key value
if [ "${1:-}" = --ip ]; then
    # Detection configures Caddy's certificate, never the host network itself.
    server_ip=$(sed -n 's/^SERVER_IP=//p' .env | tail -n 1)
    if [ -z "$server_ip" ]; then
        server_ip=$(sh scripts/detect-server-ip.sh) || server_ip=
    fi
    if ! printf '%s\n' "$server_ip" | awk -F. 'NF!=4 {exit 1} {for(i=1;i<=4;i++) if($i!~/^[0-9]+$/ || $i>255) exit 1; if($1==0 || $1==127 || $1>=224) exit 1}'; then
        printf '%s\n' 'Adresse IPv4 du serveur introuvable. Renseignez SERVER_IP dans .env avec son IP LAN existante, puis relancez avec --ip.' >&2
        exit 1
    fi
    # Replace only these mode settings; keep secrets, ports and domains intact.
    env_tmp=$(mktemp .env.mode.XXXXXX)
    trap 'rm -f "$env_tmp"' EXIT HUP INT TERM
    sed '/^SERVER_IP=/d; /^COMPOSE_PATH_SEPARATOR=/d; /^COMPOSE_FILE=/d' .env > "$env_tmp"
    printf 'SERVER_IP=%s\nCOMPOSE_PATH_SEPARATOR=|\nCOMPOSE_FILE=compose.yaml|compose.ip.yaml\n' "$server_ip" >> "$env_tmp"
    mv "$env_tmp" .env
    trap - EXIT HUP INT TERM
    printf 'Mode IP active : serveur %s (ports HTTPS dans .env).\n' "$server_ip"
fi
printf '%s\n' '.env prepare (permissions 600). Secrets existants conserves.' 'Pour la premiere installation, utilisez SETUP_TOKEN de .env dans le formulaire.' 'Configurez ADMIN_DOMAIN, PLAYER_DOMAIN, CADDY_HTTP_PORT et CADDY_HTTPS_PORT, puis approuvez le certificat HTTPS local.'
