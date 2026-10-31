FROM node:24-bookworm-slim AS builder

WORKDIR /usr/src/microsoft-rewards-script
ENV PLAYWRIGHT_BROWSERS_PATH=0

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --include=dev --ignore-scripts
COPY . .
RUN npm run build
RUN rm -rf node_modules \
    && npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

FROM node:24-bookworm-slim AS runtime

WORKDIR /usr/src/microsoft-rewards-script
ENV NODE_ENV=production \
    TZ=UTC \
    PLAYWRIGHT_BROWSERS_PATH=0 \
    FORCE_HEADLESS=1 \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

RUN apt-get update && apt-get install -y --no-install-recommends \
    cron tzdata ca-certificates procps util-linux tini \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

COPY --from=builder /usr/src/microsoft-rewards-script/dist ./dist
COPY --from=builder /usr/src/microsoft-rewards-script/package*.json ./
COPY --from=builder /usr/src/microsoft-rewards-script/node_modules ./node_modules

# Install the lockfile's matching Chromium, headless shell and system libraries.
RUN ./node_modules/.bin/patchright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# The entrypoint prepares config/config.json from built-in defaults in the persisted config volume.
COPY --chmod=755 scripts/docker/run_daily.sh ./scripts/docker/run_daily.sh
COPY --chmod=755 scripts/docker/healthcheck.sh ./scripts/docker/healthcheck.sh
COPY scripts/lib/ ./scripts/lib/
COPY scripts/main/ ./scripts/main/
COPY --chmod=644 scripts/package.json ./scripts/package.json
COPY --chmod=644 src/crontab.template /etc/cron.d/microsoft-rewards-cron.template
COPY --chmod=755 scripts/docker/entrypoint.sh /usr/local/bin/entrypoint.sh

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
    CMD ["scripts/docker/healthcheck.sh"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
