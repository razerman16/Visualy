# Visualy's Caddy build

The HTTPS service includes Caddy's standard modules. It is rebuilt because the
official Caddy 2.11.7 image available during the security review still embedded
Go and module versions with fixable HIGH advisories.

`../Dockerfile.caddy` pins Go 1.27.3 and Caddy 2.11.7. `go.mod` and `go.sum` lock
the module graph, including go-jose/v4 4.1.6 and x/net 0.60.0. The runtime image
removes the unused curl package and its dependencies. Module checksums remain
enabled; no insecure TLS or checksum bypass is used.

When upgrading, update the Go build image and module requirements together,
build the image, inspect `caddy build-info`, scan it, and run the HTTP-to-HTTPS
integration recipe. CI scans this exact build and retains all advisories,
including findings without an available fix. Do not replace it with an official
image until that image passes the same checks.
