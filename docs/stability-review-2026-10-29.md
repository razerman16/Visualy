# Stability and interface review — 29 October 2026

This review covers the administration interface, browser player, default HTTP deployment and optional Caddy HTTPS deployment. Tests use disposable data and isolated browser fixtures.

## Corrections

- Keep settings tables inside their horizontal scroll area instead of expanding the page on small phones and tablets. Long account-security button labels wrap within their panel.
- Give the scene name enough room in the mobile editor and prevent the page behind an editor or modal from scrolling.
- Keep Tab and Shift+Tab inside open dialogs and the mobile navigation, support Escape, restore focus on close, and remove the closed mobile navigation from keyboard navigation. Ignore disabled, hidden and inert controls.
- Prevent editing a scene or program while its save is in progress. Retain a newly saved program's ID when publication fails, so retrying updates the draft instead of creating another program.
- Separate loading errors from action errors. Refreshing a list no longer hides an unsuccessful upload, and older refresh responses cannot overwrite newer data.
- Handle failed logout requests without an unhandled promise rejection; clear in-memory installation data after successful logout. Preserve password-reset inputs after an unsuccessful reset.
- Reject malformed successful API responses with a readable error. Limit ordinary administration requests to 30 seconds and multipart uploads to five minutes, releasing the timeout after completion.
- Explain where to find the installation key. Pairing instructions refer to the configured player address instead of assuming port 8081. Both languages include the new messages.
- Derive the production player's service-worker revision from its generated bundles and public assets. Interface, font and logo updates now invalidate the old shell automatically. Media caches and screen identity remain separate.

## Repeatable checks

```sh
npm run build
npm test
npm run test:security
npm run test:deployment
npm run test:branding
npm run test:player-build
npm audit --audit-level=high
```

With built admin and player previews available:

```sh
VISUALY_ADMIN_URL=http://127.0.0.1:8480 node tests/ui/stability.mjs
VISUALY_ADMIN_URL=http://127.0.0.1:8480 VISUALY_PLAYER_URL=http://127.0.0.1:8481 node tests/ui/preferences.mjs
VISUALY_PLAYER_URL=http://127.0.0.1:8481 node tests/ui/offline-shell.mjs
VISUALY_PLAYER_URL=http://127.0.0.1:8481 node tests/ui/legacy-branding.mjs
```

The stability suite checks 200 layouts: five viewport widths (320, 390, 768, 1024 and 1440 pixels), French/English, light/dark, eight administration pages, the editor and the pairing dialog. It also exercises keyboard containment, failed uploads, publication retries, malformed server responses and failed logout. Screenshots are written outside the repository, under `/tmp/visualy-stability` by default; `VISUALY_SCREENSHOTS` overrides this path.

`sh tests/security/run-integration.sh` creates a separate `visualy-security-ci` installation and deletes only its own containers and volumes on exit. It runs the functional and browser tests in the default HTTP mode, then enables Caddy and checks the trusted HTTPS response, redirects on custom ports and Secure session cookies. The account tests verify that HTTP cookies omit Secure while keeping HttpOnly and SameSite=Strict. The normal run builds the images. For locally prepared test images with the expected names, `VISUALY_TEST_PREBUILT=1` skips that build.

## Validation results

- Production compilation and all four Docker image targets completed successfully.
- 36 application tests, 5 security unit tests and 9 deployment-script tests passed, together with the deployment-configuration and branding checks.
- The player-build regression test confirmed that changing a public asset changes the generated worker revision.
- The 200-layout browser matrix and its failure scenarios passed against both production previews and the disposable Docker installation.
- The Docker integration run passed media conversion (including H.264 playback in Chromium), authentication and account controls, publishing, pairing, scheduling, device events, browser security headers, preferences, offline reload and legacy browser-state migration.
- Switching the fixture from HTTP to Caddy HTTPS preserved its data; trusted HTTPS, custom-port redirects and the expected cookie flags passed.
- The npm dependency audit reported zero known vulnerabilities during this review.

The local Docker build supplied this test environment's proxy certificate authority through a temporary build secret. Build caches were cleaned to accommodate the environment's limited disk space. The existing installation's containers and persistent volumes were retained.

## Scope and limits

Browser checks use Chromium. Responsive viewport emulation does not replace testing on real televisions, touchscreens or other browser engines. This is a functional regression review, not a long-duration load test or a claim that every possible failure has been eliminated. Remote HTTP players still require trusted HTTPS for persistent offline browser caching.
