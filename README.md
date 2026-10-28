# Visualy

**English** | [Français](README.fr.md)

Self-hosted digital signage for your local network. Create content, schedule playback, and manage your screens from a web interface hosted on your own server.

Visualy includes an administration app, a full-screen browser player, an API, PostgreSQL 18, and an isolated media converter. It runs without a cloud account or external services at runtime. Internet access is needed initially to download Docker images and dependencies; built images can then be transferred to an isolated server.

![Visualy dashboard in English and dark mode — demonstration data](docs/screenshots/dashboard-dark-en.png)

> **Upgrading from Screnzly?** Keep your existing `.env` and Docker volumes. The application is now called Visualy, while persistent identifiers remain compatible with existing installations. Read the [upgrade notes (French)](docs/deployment.md#passage-de-screnzly-à-visualy) and [security migration guide (French)](docs/security/hardening.md) before restarting. For an existing PostgreSQL 17 installation, follow the [PostgreSQL 18 migration instructions](#migrating-from-postgresql-17) below before starting the new stack.

## Features

- Upload images and browser-compatible videos, convert PDFs into slides, and transcode videos for web playback.
- Compose scenes, assemble programs, and publish fixed revisions.
- Pair screens, organize them into groups, and assign fallback programs.
- Schedule dated or recurring campaigns and monitor player activity.
- Switch between English and French, with light, dark, and system themes.
- Play cached content offline after synchronization over trusted HTTPS.
- Access the server directly by IP, through local DNS names, or on localhost.

## Requirements

- Docker Engine with Docker Compose, or Docker Desktop using Linux containers on Windows/macOS.
- **Docker Compose 2.24.4 or later** for the IP and localhost modes.
- A suggested starting point of 4 CPU cores, 6 GB RAM, and enough storage for your media.
- A browser on each playback device. Video performance depends on the device and its supported codecs.

Run shell scripts through a POSIX shell; on Windows, use WSL or Git Bash. IP detection may need adjustment when run inside WSL, a VM, or a host with multiple interfaces or a VPN.

## Quick start: use your server's existing IP address

Clone the repository and initialize the configuration **on the Docker host**:

```sh
git clone https://github.com/razerman16/Visualy.git
cd Visualy
sh scripts/init-env.sh --ip
```

The script generates missing secrets, detects the server's existing IPv4 address, and selects the IP-based Compose configuration. It does not assign a new IP address or change the host's network settings. Existing secrets, domains, and port settings are preserved. Do not commit `.env`.

Check the detected `SERVER_IP` in `.env`. On hosts with multiple interfaces, a VPN, or WSL, set it to the server's actual LAN address if necessary. If detection fails, set `SERVER_IP` to that existing address and run the command again.

Choose your public ports in `.env`:

```dotenv
CADDY_HTTP_PORT=80
CADDY_HTTPS_PORT=443
CADDY_PLAYER_HTTPS_PORT=8443
```

Then start the stack:

```sh
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps -a
```

The one-time `migrate` service should finish with exit code `0`. Other services should remain running.

For a server at `192.168.1.50`, the default addresses are:

| Application | URL |
| --- | --- |
| Administration | `https://192.168.1.50` |
| Player | `https://192.168.1.50:8443` |

HTTP redirects to the administration HTTPS port. If you choose different ports, include them in the URLs. Use distinct, available ports.

### Trust the local HTTPS certificate

Caddy issues certificates using its local certificate authority. Export the public root certificate:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./visualy-root.crt
```

Install `visualy-root.crt` as a trusted root certificate on each administration and playback device, including the browser's trust store when it is separate from the operating system. Do not distribute the private key. Trusted HTTPS is required for reliable offline caching.

### Create the first administrator

Open the administration URL and enter the **`SETUP_TOKEN`** stored in your server's `.env` to create the first administrator account. Initial setup closes once the account has been created.

PostgreSQL, the API, and the converter do not publish ports on the host. Only Caddy exposes web access in the HTTPS deployment modes.

## Access modes and ports

| Mode | How to enable it | Default access |
| --- | --- | --- |
| Server IP | `sh scripts/init-env.sh --ip` | Admin: `https://SERVER_IP`; player: `https://SERVER_IP:8443` |
| Local DNS | Plain `compose.yaml`, with `ADMIN_DOMAIN` and `PLAYER_DOMAIN` configured | Both domain names use HTTPS port `443` |
| Localhost HTTPS | Select `compose.yaml` and `compose.localhost.yaml` in `.env` | Admin: `https://localhost`; player: `https://localhost:8443` |
| Development HTTP | Explicitly use `-f compose.yaml -f compose.dev.yaml` | Admin: `http://localhost:8080`; player: `http://localhost:8081` |

`BIND_ADDRESS=0.0.0.0` publishes the IP/DNS modes on the host's IPv4 interfaces. `SERVER_IP` identifies the existing server address for its certificate. `CADDY_IP` and `FRONTEND_SUBNET` refer to Docker's internal network, not the address users enter in a browser.

### Add DNS names when ready

The IP mode also supports DNS names. Set these in `.env`, using your own names if preferred:

```dotenv
ADMIN_DOMAIN=admin.visualy.home.arpa
PLAYER_DOMAIN=player.visualy.home.arpa
```

Point both DNS records to the server's LAN IP address, then apply the configuration:

```sh
docker compose up -d --no-deps caddy
```

Both names use `CADDY_HTTPS_PORT`. Direct player access by IP continues to use `CADDY_PLAYER_HTTPS_PORT`.

For a DNS-only installation, run `sh scripts/init-env.sh` without `--ip` and use the base `compose.yaml`. If switching from another mode, remove its `COMPOSE_FILE` and `COMPOSE_PATH_SEPARATOR` lines from `.env` first.

Changing a hostname or HTTPS port changes the browser origin. Sign in and pair screens again at the new address; browser preferences and offline caches are separate for each origin.

### Test on localhost

Add these lines to `.env`:

```dotenv
COMPOSE_PATH_SEPARATOR=|
COMPOSE_FILE=compose.yaml|compose.localhost.yaml
LOCAL_PLAYER_HTTPS_PORT=8443
```

Run `docker compose up -d --build --wait`. Open `https://localhost` for administration and `https://localhost:8443` for the player on the Docker host. The certificate must still be trusted. This mode binds only to `127.0.0.1` and needs no DNS or hosts-file entries.

Development HTTP is a separate, explicitly selected mode. Its ports are controlled by `DEV_ADMIN_PORT` and `DEV_PLAYER_PORT` and bind only to localhost; it is not intended for remote screens. The legacy `compose.https.yaml` override remains supported for older commands.

## Publish your first program

1. Upload a JPEG, PNG, or WebP image, or an MP4/WebM video your browsers can play.
2. Create a scene or assemble media into a program. Set playback durations and publish it.
3. Open the player on a screen and enter its pairing code in the administration app.
4. Assign a fallback program to that screen. Add a dated or recurring campaign if needed.
5. Leave the player open in full-screen mode. It retrieves published updates automatically.

Published programs retain a fixed revision. Editing a draft does not immediately change what is playing; publish again to apply a new version. A screen without assigned content displays a built-in fallback.

Use the interface controls to choose English or French and a light, dark, or system theme. Preferences are saved in the browser separately for administration and player origins. User-entered names and scene content are not translated.

## PDF and video conversion

### PDF imports

In **Media library → PDF documents**, upload a PDF of up to **25 MB and 50 pages**. Background processing creates one PNG image per page for use in scenes and programs. The queue is persisted in PostgreSQL and resumes after restart. The interface shows pending, completed, and failed jobs.

The API coordinates jobs and sends conversion work to the isolated converter service. PDF imports are limited to one active job per API instance; video conversion has its own persistent queue.

### Video conversion

In **Media library → Video conversion**, upload an MP4/MOV, MKV/WebM, or AVI file. Conversion produces an H.264 MP4 with YUV420p pixels, stereo AAC audio when present, and a `faststart` index for web playback. Sources without audio are supported. Only the completed output is added to the media library.

Limits:

- Input: **500 MB**, **1 hour**, and source dimensions up to **8192 pixels**.
- Output: up to **1920 × 1080**, preserving the aspect ratio.
- Processing: two threads per conversion, a 15-minute timeout, and one video job at a time per API instance.

Interrupted jobs resume after restart. Errors appear in the interface, and temporary source files are removed after success or final failure. Direct media upload remains available without conversion.

## Offline playback and device setup

The player caches its interface and synchronized media locally. HTTPS and a certificate trusted by the device are required. Test network loss and browser restarts on your actual playback devices before relying on offline operation; browser storage limits and eviction policies still apply.

Videos play muted by default to comply with browser autoplay rules. Configure kiosk startup, time synchronization, display power, and sleep settings on each device. Playback events describe browser rendering; they do not prove that a physical display is on. Validate hardware compatibility, 4K performance, and offline duration on your target screens.

## Backup and restore

```sh
sh scripts/backup.sh
# On the destination installation, after creating the containers:
sh scripts/restore.sh ../scenzly-backups/YOUR_BACKUP_DIRECTORY --replace-existing-data
```

Backup briefly stops the API to freeze writes and capture PostgreSQL and media together. Restoration replaces existing data. Keep protected copies off the server: backups include application accounts and content. Back up `.env` and Caddy's persistent volumes separately; the application backup script does not include them.

The legacy `scenzly` volume names and backup format are retained for compatibility. See the [operations guide (French)](docs/deployment.md) for the complete procedure.

## Migrating from PostgreSQL 17

New installations use PostgreSQL 18, with `scenzly_postgres18-data` mounted at `/var/lib/postgresql` as required by the PostgreSQL 18 image layout.

**Do not start the new stack directly against an existing PostgreSQL 17 installation.** After fetching the new code, while the old PostgreSQL 17 container is still running, execute:

```sh
sh scripts/migrate-postgres18.sh
```

The script builds images, backs up the database and media, stops writes, starts PostgreSQL 18 with a new volume, and restores the data. It refuses a nonempty target. The PostgreSQL 17 volume and backup are preserved. If restoration fails, the API stays stopped; retain the volumes and backup for recovery. Do not remove old volumes before validating the migration.

## Development and tests

The monorepo uses **Node.js 22+** and npm workspaces:

```sh
npm ci
npm run build
npm test
npm run test:security
```

Conversion tests require FFmpeg, ffprobe, and Poppler on the machine running the tests.

`npm run dev:api`, `npm run dev:admin`, and `npm run dev:player` start the development services. The API needs a valid `DATABASE_URL` and a writable `MEDIA_DIR`; see the deployment configuration for its other environment settings. The Vite servers proxy `/api` to port `3000`. Docker is the simplest way to run the complete stack.

Integration tests create and modify data. Run them only against a dedicated, disposable installation, supplying its test credentials and initial setup token where required:

```sh
SCENZLY_TEST_URL=http://127.0.0.1:8080 npm run test:smoke
# Optional Chromium playback checks:
SCENZLY_CHROMIUM=/usr/bin/chromium npm run test:smoke
```

The `SCENZLY_*` test environment variables retain their original names for compatibility.

| Directory | Purpose |
| --- | --- |
| `apps/admin` | Administration interface |
| `apps/player` | Screen player and offline playback |
| `apps/api` | API, persistence, and conversion services |
| `packages/shared` | Shared types, scheduling, and translations |

## Current scope

Visualy covers local content creation, publishing, screen pairing, scheduling, and playback. It does not yet implement the entire original specification. PowerPoint import, advanced editor grouping and undo/redo, published-version restoration history, email-based account recovery, per-organization quotas, and hardware integrations remain future work.

Logos and fonts are served locally without a CDN. The interface adapts to desktop and mobile layouts.

## Further documentation

The main README is available in English and [French](README.fr.md). The detailed guides below are currently in French:

- [Deployment, networking, HTTPS, and operations](docs/deployment.md)
- [Security hardening and upgrade procedure](docs/security/hardening.md)
- [Internal API contract](docs/api-contract.md)
- [Interface and visual verification](docs/interface.md)
