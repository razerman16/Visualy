# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/player/package.json apps/player/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --no-audit --no-fund
COPY apps ./apps
COPY packages ./packages
RUN npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 MEDIA_DIR=/data/media
RUN rm -rf /usr/local/lib/node_modules /opt/yarn* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack && mkdir -p /data/media /data/work && chown node:node /data/media /data/work
WORKDIR /app
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=build /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=build /app/packages/shared ./packages/shared
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]

FROM api AS converter
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg poppler-utils && rm -rf /var/lib/apt/lists/*
USER node
CMD ["node", "apps/api/dist/converter.js"]

FROM nginx:1.30-alpine AS web-base
# Static serving/proxy only: no HTTP client or server-side image decoder required.
RUN apk del --no-network curl nginx-module-image-filter

FROM web-base AS admin
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY docker/nginx-admin.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80

FROM web-base AS player
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY docker/nginx-player.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/player/dist /usr/share/nginx/html
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
