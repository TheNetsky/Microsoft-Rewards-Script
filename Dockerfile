###############################################################################
# Stage 1: Builder (compile TypeScript)
###############################################################################
FROM node:22-slim AS builder

WORKDIR /usr/src/microsoft-rewards-script

# Install minimal tooling if needed
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json tsconfig.json ./

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

# Install tzdata noninteractively (keep image slim)
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      tzdata \
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

# No cron/entrypoint needed when using built-in scheduler

# Default TZ (overridden by user via environment)
ENV TZ=UTC

# Default command runs the built-in scheduler; can be overridden by docker-compose
CMD ["npm", "run", "start:schedule"]
