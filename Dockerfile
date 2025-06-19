###############################################################################
# Stage 1: Builder (compile TypeScript)
###############################################################################
FROM node:18-slim AS builder

WORKDIR /usr/src/microsoft-rewards-script

# Install minimal tooling if needed
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./

# Conditional install: npm ci if lockfile exists, else npm install
RUN if [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy source code
COPY . .

# Build TypeScript
RUN npx rimraf dist \
    && npm run build

###############################################################################
# Stage 2: Runtime (Playwright image)
###############################################################################
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /usr/src/microsoft-rewards-script

# Install cron, gettext-base (for envsubst), tzdata noninteractively
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
         cron gettext-base tzdata \
    && rm -rf /var/lib/apt/lists/*

# Ensure Playwright uses preinstalled browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy built artifacts and package.json
COPY --from=builder /usr/src/microsoft-rewards-script/dist ./dist
COPY --from=builder /usr/src/microsoft-rewards-script/package*.json ./

# Install only production dependencies, with fallback
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --production; \
    fi

# Copy automation script and cron template
COPY src/run_daily.sh ./src/run_daily.sh
RUN chmod +x ./src/run_daily.sh
COPY src/crontab.template /etc/cron.d/microsoft-rewards-cron.template

# Copy entrypoint and make executable
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Default TZ (overridden by user via environment)
ENV TZ=UTC

# Entrypoint handles TZ, initial run toggle, cron templating & launch
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# CMD is a no-op since ENTRYPOINT execs cron; left for clarity
CMD ["sh", "-c", "echo 'Container started; cron is running.'"]
