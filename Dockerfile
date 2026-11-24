FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --no-fund
COPY . .
RUN npm run build

FROM nginx/nginx-unprivileged:1.30.8-alpine@sha256:637c35e46af7bc0dd3d3bcf7162e004e13ab3b370fde7cd416e2ac410b5a985a
COPY docker/app.conf /etc/nginx/nginx.conf
COPY docker/security-headers.conf /etc/nginx/comparekit-security.conf
COPY --from=build /work/dist/ /usr/share/nginx/html/
USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]

