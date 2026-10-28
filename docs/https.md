# Optional HTTPS with Caddy

Visualy starts in **direct HTTP mode**, without Caddy. This guide enables HTTPS when you need encrypted connections or persistent offline playback on remote screens. Docker Compose **2.24.4 or newer** is required for these overrides.

Keep your existing `.env`, secrets, and volumes. Each HTTPS mode automatically enables Secure session cookies, removes the direct HTTP ports from the web services, and publishes only Caddy's ports. PostgreSQL, the API, and the converter stay internal.

## 1. Choose an HTTPS mode

Run one of the following commands from the repository on the Docker host. These commands select the Compose files in `.env`; they do not modify the host network or start containers.

### DNS names

```sh
sh scripts/init-env.sh --https
```

Configure `.env`:

```dotenv
ADMIN_DOMAIN=admin.visualy.home.arpa
PLAYER_DOMAIN=player.visualy.home.arpa
CADDY_HTTP_PORT=80
CADDY_HTTPS_PORT=443
```

Point both names to the server's existing LAN IP in your DNS. A hosts-file entry on each client can also be used. Open `https://admin.visualy.home.arpa` and `https://player.visualy.home.arpa`, adding the HTTPS port if it is not 443. Domains must not contain a scheme, port, or path.

### Existing server IP, without DNS

```sh
sh scripts/init-env.sh --ip
```

The script detects the host's existing IPv4 address and records it as `SERVER_IP`. Check that address on machines with multiple interfaces, VPNs, or WSL. On Docker Desktop for Windows, use the Windows host's actual LAN address, not a virtual WSL address. If detection fails, set `SERVER_IP` yourself and rerun the command. This identifies the certificate address; it does not assign a new IP.

```dotenv
# Example only: use your server's actual address.
SERVER_IP=192.168.1.50
CADDY_HTTP_PORT=80
CADDY_HTTPS_PORT=443
CADDY_PLAYER_HTTPS_PORT=8443
```

Administration: `https://192.168.1.50`. Player: `https://192.168.1.50:8443`. The configured DNS names also remain available on `CADDY_HTTPS_PORT` if you add DNS records later.

### Localhost

```sh
sh scripts/init-env.sh --localhost
```

```dotenv
CADDY_HTTP_PORT=80
CADDY_HTTPS_PORT=443
LOCAL_PLAYER_HTTPS_PORT=8443
```

Open `https://localhost` and `https://localhost:8443` **on the Docker host**. Ports bind only to `127.0.0.1`; no DNS is required. Localhost on another computer refers to that other computer.

## 2. Apply the configuration

Use distinct, available ports. `ADMIN_PORT` and `PLAYER_PORT` apply only to direct HTTP and are not published in HTTPS mode. `BIND_ADDRESS` controls Caddy's host binding in DNS/IP mode; localhost mode always binds to loopback.

```sh
docker compose config --quiet
docker compose up -d --build --remove-orphans --wait
docker compose ps -a
```

Recreate the API and web services along with Caddy when switching modes: their cookie and port settings change. A simple `docker compose restart` does not apply changed environment variables or port mappings.

The selected settings are stored as:

| Mode | `COMPOSE_FILE` |
| --- | --- |
| HTTP | `compose.yaml` |
| HTTPS with DNS | `compose.yaml\|compose.https.yaml` |
| HTTPS with IP | `compose.yaml\|compose.ip.yaml` |
| HTTPS on localhost | `compose.yaml\|compose.localhost.yaml` |

The script also sets `COMPOSE_PATH_SEPARATOR=|`. You can edit these values directly in `.env` instead. Do not combine HTTPS modes with `compose.dev.yaml`. Explicit `-f` flags override `COMPOSE_FILE`; make sure a deployment tool loads both files if it supplies its own file list.

## 3. Trust the certificate

Caddy uses a local certificate authority, with no public ACME service. Export its public root certificate:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./visualy-root.crt
```

Install it as a trusted root on each administration/player device, including the browser trust store if separate. On Windows, use the **Trusted Root Certification Authorities** store. Never share `root.key`. Open both URLs without certificate errors before testing offline playback.

Preserve the `caddy-data` and `caddy-config` volumes to retain this authority. Back them up securely when moving servers; the application backup script does not include them.

## Switching from an earlier Caddy installation back to HTTP

```sh
git pull --ff-only
sh scripts/migrate-visualy.sh
sh scripts/init-env.sh --http
# Set ADMIN_PORT and PLAYER_PORT in .env if needed.
docker compose up -d --build --remove-orphans --wait
```

The script replaces the old Compose mode selection and preserves secrets and domains. `--remove-orphans` removes the old Caddy container from this project's active stack; it does not delete its volumes. The HTTP configuration contains no Caddy service. Open `http://SERVER_IP:8080` and `http://SERVER_IP:8081` with your chosen ports.

HTTP traffic is not encrypted. Session cookies remain HttpOnly and SameSite=Strict, but cannot use Secure on a remote HTTP origin. Use this mode on a trusted local network. Remote HTTP players can play online, but browsers do not provide the service worker and persistent offline cache available over trusted HTTPS.

Changing scheme, hostname, or port changes the browser origin. Sign in and pair screens again on the new player origin. A browser that remembers HSTS from a previous HTTPS visit may automatically upgrade HTTP on the same hostname, even on another port. If this occurs, use the server IP for HTTP, or remove that site's remembered HSTS policy where the browser allows it. HSTS policies may outlive clearing ordinary browsing data.

## Troubleshooting

```sh
docker compose ps -a
docker compose logs --tail=80 caddy admin-web player-web api
```

Check that the mode actually loaded: an IP-mode Caddy startup should manage a certificate for `SERVER_IP`, not just the two DNS names. Check the host firewall and published ports if the connection times out. Do not post `.env` or full `docker compose config` output: they contain secrets. `docker compose config --quiet` validates it without printing them.
