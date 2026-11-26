# Production image: the Next.js standalone server, run as a non-root user.
# Built and pushed to GHCR by .github/workflows/deploy.yml; see docs/deployment.md.
# The image holds no secrets: .dockerignore keeps .env* and local settings out.

ARG NODE_IMAGE=node:26-trixie-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The commit this image was built from, reported by GET /api/health.
ARG APP_COMMIT_SHA=unknown
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}
LABEL org.opencontainers.image.source="https://github.com/lethalwombat/maestro-de-espanol" \
      org.opencontainers.image.revision="${APP_COMMIT_SHA}"

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# The official Node images ship an unprivileged "node" user (uid 1000).
USER node
# Must match the container app's ingress targetPort in infra/main.bicep.
EXPOSE 3000
CMD ["node", "server.js"]
