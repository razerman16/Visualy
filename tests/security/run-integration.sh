#!/bin/sh
# Creates and destroys ONLY the visualy-security-ci fixture installation.
set -eu
cd "$(dirname "$0")/../.."
umask 077
fixture_dir=$(mktemp -d)
cat > "$fixture_dir/env" <<'ENV'
POSTGRES_PASSWORD=disposable-security-test
APP_DB_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
SETUP_TOKEN=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
CONVERTER_TOKEN=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
CADDY_HTTP_PORT=18080
CADDY_HTTPS_PORT=18443
ADMIN_DOMAIN=admin.screnzly.test
PLAYER_DOMAIN=player.screnzly.test
CADDY_IP=172.30.242.2
FRONTEND_SUBNET=172.30.242.0/24
FRONTEND_DYNAMIC_RANGE=172.30.242.128/25
ENV
compose(){ VOLUME_PREFIX=visualy-security-ci docker compose --env-file "$fixture_dir/env" -p visualy-security-ci -f compose.yaml -f compose.https.yaml -f tests/security/compose.yaml "$@"; }
cleanup(){
    result=$?
    trap - EXIT
    if [ "$result" -ne 0 ]; then
        compose ps -a || true
        compose logs --no-color --tail=100 api migrate converter admin-web player-web caddy || true
    fi
    compose down --volumes >/dev/null 2>&1 || true
    rm -rf "$fixture_dir"
    exit "$result"
}
trap cleanup EXIT
compose up -d --build --wait
export SCENZLY_TEST_URL=http://127.0.0.1:18380
export SCENZLY_TEST_EMAIL=ci-admin@example.test
export SCENZLY_TEST_PASSWORD='Disposable CI password 2026!'
export SCENZLY_SETUP_TOKEN=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
node tests/smoke.mjs
node tests/security/accounts.mjs
node tests/security/player-events.mjs
node tests/security/browser.mjs
SCENZLY_ADMIN_URL=$SCENZLY_TEST_URL SCENZLY_PLAYER_URL=http://127.0.0.1:18381 node tests/ui/preferences.mjs
SCENZLY_PLAYER_URL=http://127.0.0.1:18381 node tests/ui/offline-shell.mjs
compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$fixture_dir/root.crt"
curl --fail --noproxy '*' --resolve admin.screnzly.test:18443:127.0.0.1 --cacert "$fixture_dir/root.crt" -sI https://admin.screnzly.test:18443/
# A published nonstandard HTTPS port must survive the HTTP redirect.
for interface in admin player; do
    redirect=$(curl --noproxy '*' --resolve "$interface.screnzly.test:18080:127.0.0.1" -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://$interface.screnzly.test:18080/screens/test?name=a%20b")
    test "$redirect" = "301 https://$interface.screnzly.test:18443/screens/test?name=a%20b"
done
