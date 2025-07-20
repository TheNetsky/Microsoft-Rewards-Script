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
RUN npm run build

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

# Copy package files first for better caching
COPY --from=builder /usr/src/microsoft-rewards-script/package*.json ./

# Install only production dependencies, with fallback
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --ignore-scripts; \
    else \
      npm install --production --ignore-scripts; \
    fi

# Copy built application
COPY --from=builder /usr/src/microsoft-rewards-script/dist ./dist

# Copy runtime scripts with proper permissions from the start
COPY --chmod=755 src/run_daily.sh ./src/run_daily.sh
COPY --chmod=644 src/crontab.template /etc/cron.d/microsoft-rewards-cron.template
COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh

# Default TZ (overridden by user via environment)
ENV TZ=UTC

# Entrypoint handles TZ, initial run toggle, cron templating & launch
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sh", "-c", "echo 'Container started; cron is running.'"]
