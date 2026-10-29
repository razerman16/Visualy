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
ADMIN_DOMAIN=admin.visualy.test
PLAYER_DOMAIN=player.visualy.test
CADDY_IP=172.30.242.2
FRONTEND_SUBNET=172.30.242.0/24
FRONTEND_DYNAMIC_RANGE=172.30.242.128/25
ENV
https=0
compose(){
    if [ "$https" = 1 ]; then
        VOLUME_PREFIX=visualy-security-ci docker compose --env-file "$fixture_dir/env" -p visualy-security-ci -f compose.yaml -f compose.https.yaml -f tests/security/compose.yaml "$@"
    else
        VOLUME_PREFIX=visualy-security-ci docker compose --env-file "$fixture_dir/env" -p visualy-security-ci -f compose.yaml -f tests/security/compose.http.yaml "$@"
    fi
}
cleanup(){
    result=$?
    trap - EXIT
    if [ "$result" -ne 0 ]; then
        compose ps -a || true
        compose logs --no-color --tail=100 postgres api migrate converter admin-web player-web || true
        if [ "$https" = 1 ]; then compose logs --no-color --tail=100 caddy || true; fi
    fi
    compose down --volumes >/dev/null 2>&1 || true
    rm -rf "$fixture_dir"
    exit "$result"
}
trap cleanup EXIT
if [ "${VISUALY_TEST_PREBUILT:-0}" = 1 ]; then
    compose up -d --no-build --wait
else
    compose up -d --build --wait
fi
export VISUALY_TEST_URL=http://127.0.0.1:18380
export VISUALY_TEST_EMAIL=ci-admin@example.test
export VISUALY_TEST_PASSWORD='Disposable CI password 2026!'
export VISUALY_SETUP_TOKEN=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
node tests/smoke.mjs
node tests/security/content-http.mjs
compose exec -T api node --input-type=module < tests/security/content-budget-db.mjs
compose exec -T api node --input-type=module < tests/security/database.mjs
VISUALY_EXPECT_SECURE_COOKIE=false node tests/security/accounts.mjs
node tests/security/player-events.mjs
node tests/security/browser.mjs
VISUALY_ADMIN_URL=$VISUALY_TEST_URL VISUALY_PLAYER_URL=http://127.0.0.1:18381 node tests/ui/preferences.mjs
VISUALY_PLAYER_URL=http://127.0.0.1:18381 node tests/ui/offline-shell.mjs
VISUALY_PLAYER_URL=http://127.0.0.1:18381 node tests/ui/legacy-branding.mjs
VISUALY_ADMIN_URL=$VISUALY_TEST_URL VISUALY_PLAYER_URL=http://127.0.0.1:18381 node tests/ui/visual-check.mjs
VISUALY_ADMIN_URL=$VISUALY_TEST_URL node tests/ui/stability.mjs
VISUALY_ADMIN_URL=$VISUALY_TEST_URL node tests/ui/session-security.mjs
VISUALY_ADMIN_URL=$VISUALY_TEST_URL node tests/ui/content-recovery.mjs
# Exercise optional HTTPS after the default HTTP installation and its data work.
https=1
if [ "${VISUALY_TEST_PREBUILT:-0}" = 1 ]; then
    compose up -d --no-build --wait
else
    compose up -d --build --wait
fi
compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$fixture_dir/root.crt"
curl --fail --noproxy '*' --resolve admin.visualy.test:18443:127.0.0.1 --cacert "$fixture_dir/root.crt" -sI https://admin.visualy.test:18443/
# A published nonstandard HTTPS port must survive the HTTP redirect.
for interface in admin player; do
    redirect=$(curl --noproxy '*' --resolve "$interface.visualy.test:18080:127.0.0.1" -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://$interface.visualy.test:18080/screens/test?name=a%20b")
    test "$redirect" = "301 https://$interface.visualy.test:18443/screens/test?name=a%20b"
done

VISUALY_EXPECT_SECURE_COOKIE=true node tests/security/accounts.mjs
printf '%s\n' 'PASS: default HTTP deployment, optional HTTPS upgrade, secure cookies and custom-port redirects.'
