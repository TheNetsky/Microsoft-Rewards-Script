# Use the official Playwright image matching your Playwright version
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

# Set working directory inside the container
WORKDIR /usr/src/microsoft-rewards-script

# Copy package.json and package-lock.json (if it exists) to leverage Docker cache
COPY package*.json ./

# Install dependencies:
# - Use `npm ci` if package-lock.json exists for clean install
# - Otherwise, fallback to `npm install`
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest of the source code into the container
COPY . .

# Run pre-build script (installs playwright browsers, cleans dist) and build TypeScript
RUN npm run pre-build && npm run build

# Ensure sessions directory exists to avoid runtime errors
RUN mkdir -p /usr/src/microsoft-rewards-script/dist/browser/sessions

# Copy cron job template to the appropriate location
COPY src/crontab.template /etc/cron.d/microsoft-rewards-cron.template

# Create cron log file and set permissions so cron can write to it
RUN touch /var/log/cron.log && chmod 666 /var/log/cron.log

# Removed USER pwuser to run as root

# Set default command:
# - Configure timezone inside container based on $TZ environment variable
# - Set up cron job from template with environment substitution
# - Start cron in foreground
# - Optionally start the script immediately if RUN_ON_START=true
# - Tail cron log to keep container running and output logs
CMD ["sh", "-c", "\
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo \"$TZ\" > /etc/timezone && \
    envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron && \
    chmod 0644 /etc/cron.d/microsoft-rewards-cron && \
    crontab /etc/cron.d/microsoft-rewards-cron && \
    cron -f & \
    ([ \"$RUN_ON_START\" = \"true\" ] && npm start); \
    tail -f /var/log/cron.log"]
