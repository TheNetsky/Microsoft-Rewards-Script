# Use an official Node.js runtime as a base image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/microsoft-rewards-script

# Install necessary dependencies for Playwright and cron
RUN apt-get update && apt-get install -y \
    jq \
    cron \
    gettext-base \
    xvfb \
    libgbm-dev \
    libnss3 \
    libasound2 \
    libxss1 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    tzdata \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy all files to the working directory
COPY . .

# Install dependencies, set permissions, and build the script
RUN npm install && \
    chmod -R 755 /usr/src/microsoft-rewards-script/node_modules && \
    npm run pre-build && \
    npm run build

# Copy cron file to cron directory
COPY src/crontab.template /etc/cron.d/microsoft-rewards-cron.template

# Create the log file to be able to run tail
RUN touch /var/log/cron.log

# Define the command to run your application with cron optionally
CMD ["sh", "-c", "echo \"$TZ\" > /etc/timezone && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
    dpkg-reconfigure -f noninteractive tzdata && \
    envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron && \
    chmod 0644 /etc/cron.d/microsoft-rewards-cron && \
    crontab /etc/cron.d/microsoft-rewards-cron && \
    cron -f & \
    ([ \"$RUN_ON_START\" = \"true\" ] && npm start) && \
    tail -f /var/log/cron.log"]