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

## Standalone and static hosting

### Use a prebuilt CI artifact

1. Sign in to GitHub and open a successful **CI** run for `main`. Download **comparekit-standalone** under **Artifacts**. [CompareKit CI runs](https://github.com/Astro1247/CompareKit/actions/workflows/ci.yml) · [GitHub artifact documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)
2. Extract the ZIP and run `node scripts/serve.mjs` from the extracted directory with Node.js 22.12 or later.
3. Open [CompareKit on localhost](http://127.0.0.1:8080).

### Build from source

From the project checkout, use Node.js 22.12 or later and npm.

```sh
npm ci
npm run build
node scripts/serve.mjs
```

The server defaults to `127.0.0.1:8080`. Set `HOST` and `PORT` to change the listener. The server works offline once you have the compiled files.

### Serve from an existing web server

Use `dist/` as the document root. The bundled server sets security headers, gzip compression, and cache policies. For another static host, use the equivalent policies in [docker/security-headers.conf](../docker/security-headers.conf). The policy in `index.html` also restricts scripts, connections, and workers. Send `frame-ancestors` as an HTTP header to control embedding. Serve the app over HTTP or HTTPS so the browser can load its modules and workers.

## GitHub Pages

To host your own copy from a GitHub fork with `main` as its default branch, enable the fork's Actions workflows and select **GitHub Actions** as the source under **Settings → Pages**. Run **Deploy demo to GitHub Pages** from the **Actions** tab with `main` selected. The deploy job shows the site URL, and subsequent pushes to `main` rebuild the site. [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

The workflow uploads the static build. Pages serves the browser policy from `index.html`. Use Docker or the standalone server if your deployment requires the bundled HTTP security headers.

