###############################################################################
# Stage 1: Builder
###############################################################################
FROM node:22-slim AS builder

WORKDIR /usr/src/microsoft-rewards-script

ENV PLAYWRIGHT_BROWSERS_PATH=0

# Copy package files
COPY package.json package-lock.json tsconfig.json ./

# Install all dependencies required to build the script
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# Remove build dependencies, and reinstall only runtime dependencies
RUN rm -rf node_modules \
    && npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# Install Chromium Headless Shell, and cleanup
RUN npx playwright install --with-deps --only-shell chromium \
    && rm -rf /root/.cache /tmp/* /var/tmp/*

###############################################################################
# Stage 2: Runtime
###############################################################################
FROM node:22-slim AS runtime

WORKDIR /usr/src/microsoft-rewards-script

# Set production environment variables
ENV NODE_ENV=production \
    TZ=UTC \
    PLAYWRIGHT_BROWSERS_PATH=0 \
    FORCE_HEADLESS=1

# Install minimal system libraries required for Chromium headless to run
RUN apt-get update && apt-get install -y --no-install-recommends \
    cron \
    gettext-base \
    tzdata \
    ca-certificates \
    libglib2.0-0 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libasound2 \
    libflac12 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libdav1d6 \
    libx11-6 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libdouble-conversion3 \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Copy compiled application and dependencies from builder stage
COPY --from=builder /usr/src/microsoft-rewards-script/dist ./dist
COPY --from=builder /usr/src/microsoft-rewards-script/package*.json ./
COPY --from=builder /usr/src/microsoft-rewards-script/node_modules ./node_modules

# Copy runtime scripts with proper permissions and normalize line endings for non-Unix users
COPY --chmod=755 src/run_daily.sh ./src/run_daily.sh
COPY --chmod=644 src/crontab.template /etc/cron.d/microsoft-rewards-cron.template
COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && sed -i 's/\r$//' ./src/run_daily.sh

# Entrypoint handles TZ, initial run toggle, cron templating & launch
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sh", "-c", "echo 'Container started; cron is running.'"]
