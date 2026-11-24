# Deployment

## Standard Compose

```sh
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8080/healthz
```

The published port defaults to 8080, with all interfaces enabled. Put `COMPAREKIT_PORT=8090` and `COMPAREKIT_BIND=127.0.0.1` in `.env` to customize it. For a specific LAN interface, use that interface's IP for `COMPAREKIT_BIND` and allow access through the host firewall as appropriate.

## Isolated Compose

```sh
docker compose -f compose.hardened.yaml up --build -d --wait
docker compose -f compose.hardened.yaml ps
```

The Nginx proxy publishes port 8080 on loopback by default. All inbound connections go to the proxy. It joins the frontend and backend networks, and resolves the `app` service name through Docker DNS. The application joins only the internal backend network and publishes no host port. Both containers run as UID 101 with a read-only root filesystem, a small temporary filesystem, dropped capabilities and a health check. Access logging is disabled.

```sh
docker network inspect comparekit_backend --format '{{.Internal}}'
docker compose -f compose.hardened.yaml exec app ip route
```

Replace `comparekit_backend` with the network name reported by `docker network ls` if you use a different Compose project name. Build and pull dependencies while online, then use `up -d --no-build --pull never` to start the existing images offline.

Docker network restrictions apply to containers. The user's browser runs outside those networks. CompareKit's runtime code makes no external requests, and its Content Security Policy restricts browser resource loads and connections separately.

## HTTPS and LAN HTTP

To allow Chromium's enhanced directory picker and the system clipboard API, use localhost or a trusted HTTPS origin. If you publish on a LAN address, put the loopback-bound Compose proxy behind a reverse proxy on the host. For example, add this to an existing Nginx HTTPS server block.

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
}
```

Use a certificate trusted by client devices. Plain HTTP on a LAN supports downloads, built-in editor paste, standard directory selection and SHA-256 via bundled JavaScript. The copy action tries the browser's legacy clipboard mechanism when the secure API is unavailable. It offers a download alternative if the browser blocks clipboard access. The standard picker exposes files and relative paths. It omits empty directories.

## Standalone static deployment

`npm ci && npm run build` creates `dist/`. Serve it with `node scripts/serve.mjs` or copy it to your own static server. The server bundled with CompareKit sets security headers, gzip compression and cache policies. For another static host, use the equivalent policies in [docker/security-headers.conf](../docker/security-headers.conf). The inline CSP in `index.html` also restricts scripts, connections and workers. Set the HTTP `frame-ancestors` header when using your own server.

## Release packaging

For GitHub Pages and the public release process, see [Publish CompareKit on GitHub](github-publishing.md).

The GitHub release workflow is manually triggered for a pre-existing tag matching `package.json`. It packages the standalone build with its notices and SHA-256 checksum, then builds and pushes an OCI image for `linux/amd64` and `linux/arm64` to the repository's GHCR namespace. The Docker build runs the architecture-independent browser compilation on the builder's platform and packages the static output into the selected Nginx runtime. No release or image publication is required for local builds.

