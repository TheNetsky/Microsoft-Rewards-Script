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
      npm ci --ignore-scripts; \
    else \
      npm install --ignore-scripts; \
    fi

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

###############################################################################
# Stage 2: Runtime (Playwright image)
###############################################################################
FROM node:22-slim AS runtime

WORKDIR /usr/src/microsoft-rewards-script

ENV NODE_ENV=production
ENV TZ=UTC
# Use shared location for Playwright browsers so both 'playwright' and 'rebrowser-playwright' can find them
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Force headless in container to be compatible with Chromium Headless Shell
ENV FORCE_HEADLESS=1

# Copy package files first for better caching
COPY --from=builder /usr/src/microsoft-rewards-script/package*.json ./

# Install only production dependencies, with fallback
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --ignore-scripts; \
    else \
      npm install --production --ignore-scripts; \
    fi

# Install only Chromium Headless Shell and its OS deps (smaller than full browser set)
# This will install required apt packages internally; we clean up afterwards to keep the image slim.
RUN npx playwright install --with-deps --only-shell \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*.bin || true

# Copy built application
COPY --from=builder /usr/src/microsoft-rewards-script/dist ./dist

# Default command runs the built-in scheduler; can be overridden by docker-compose
CMD ["npm", "run", "start:schedule"]
