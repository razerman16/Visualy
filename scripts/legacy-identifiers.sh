# Upgrade-only identifiers. New installations and newly written state use Visualy.
LEGACY_PROJECT=scenzly
LEGACY_APP_ROLE=screnzly_app
LEGACY_BACKUP_FORMAT='Scenzly backup format 1'

# Preserve an existing PostgreSQL cluster's user/database in .env; never reset it.
# Called from the repository root. Only these two non-secret values are inspected.
preserve_database_identity() {
    legacy_database_container=
    if command -v docker >/dev/null 2>&1; then
        legacy_database_container=$(docker compose -f compose.yaml ps -a -q postgres 2>/dev/null || true)
    fi
    for identity_key in POSTGRES_USER POSTGRES_DB; do
        if grep -q "^${identity_key}=." .env; then continue; fi
        identity_value=
        if [ -n "$legacy_database_container" ]; then
            identity_value=$(docker inspect --format "{{range .Config.Env}}{{if eq (index (split . \"=\") 0) \"$identity_key\"}}{{index (split . \"=\") 1}}{{end}}{{end}}" "$legacy_database_container" 2>/dev/null || true)
        fi
        if [ -z "$identity_value" ] && grep -q "^VOLUME_PREFIX=$LEGACY_PROJECT$" .env; then
            identity_value=$LEGACY_PROJECT
        fi
        if [ -n "$identity_value" ]; then
            # Names become URI components; reject unexpected custom identifiers rather than corrupting URLs.
            case "$identity_value" in *[!a-zA-Z0-9_]*) printf '%s\n' 'Unsupported PostgreSQL identifier; set POSTGRES_USER and POSTGRES_DB explicitly.' >&2; return 1;; esac
            identity_tmp=$(mktemp .env.identity.XXXXXX)
            if sed "/^${identity_key}=$/d" .env > "$identity_tmp"; then
                printf '\n%s=%s\n' "$identity_key" "$identity_value" >> "$identity_tmp"
                mv "$identity_tmp" .env
            else
                rm -f "$identity_tmp"
                return 1
            fi
        fi
    done
}
