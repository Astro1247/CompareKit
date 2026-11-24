FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
COPY docker/app.conf /etc/nginx/nginx.conf
COPY docker/security-headers.conf /etc/nginx/comparekit-security.conf
COPY --from=build /work/dist/ /usr/share/nginx/html/
USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]

