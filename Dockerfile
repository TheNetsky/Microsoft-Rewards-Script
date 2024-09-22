# Use an official Node.js runtime as a base image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/microsoft-rewards-script

# Install jq, cron, and gettext-base
RUN apt-get update && apt-get install -y jq cron gettext-base

# Copy all files to the working directory
COPY . .

# Install dependencies including Playwright
RUN apt-get install -y \
    xvfb \
    libgbm-dev \
    libnss3 \
    libasound2 \
    libxss1 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# Install application dependencies
RUN npm install

# Ensure correct permissions for node_modules
RUN chmod -R 755 /usr/src/microsoft-rewards-script/node_modules

# Install Playwright Chromium directly from local node_modules
RUN ./node_modules/.bin/playwright install chromium

# Build the script
RUN npm run build

# Copy cron file to cron directory
COPY src/crontab.template /etc/cron.d/microsoft-rewards-cron.template

# Create the log file to be able to run tail
RUN touch /var/log/cron.log

# Ensure correct permissions for the working directory
RUN chmod -R 755 /usr/src/microsoft-rewards-script

# Define the command to run your application with cron optionally
CMD sh -c 'node src/updateConfig.js && echo "$TZ" > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata && if [ "$RUN_ON_START" = "true" ]; then npm start; fi && envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron && crontab /etc/cron.d/microsoft-rewards-cron && cron && tail -f /var/log/cron.log'
