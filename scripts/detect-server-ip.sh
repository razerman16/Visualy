#!/bin/sh
# Print the existing IPv4 address on the default-route interface; no network request.
set -eu
if command -v ip >/dev/null 2>&1; then
    route=$(ip -4 route get 1.1.1.1 2>/dev/null || true)
    printf '%s\n' "$route" | awk '{for(i=1;i<NF;i++) if($i=="src") {print $(i+1);exit}}'
elif command -v route >/dev/null 2>&1 && command -v ipconfig >/dev/null 2>&1; then
    iface=$(route -n get default 2>/dev/null | awk '/interface:/ {print $2;exit}')
    test -n "$iface" && ipconfig getifaddr "$iface"
fi
