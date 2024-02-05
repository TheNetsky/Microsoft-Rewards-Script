# Use an official Node.js runtime as a base image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/microsoft-rewards-script

# Install jq
RUN apt-get update && apt-get install -y jq


# Copy all files to the working directory
COPY . .

# Check if "headless" is set to "true" in the config.json file
# DELETE BELOW IF YOU WANT TO RUN THE DOCKER SCRIPT HEADFULL!
RUN HEADLESS=$(cat src/config.json | jq -r .headless) \
    && if [ "$HEADLESS" != "true" ]; then \
    echo "Error: 'headless' in src/config.json is not true."; \
    exit 1; \
    fi

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

# Build the script
RUN npm run build

# Install playwright chromium
RUN npx playwright install chromium

# Define the command to run your application
CMD ["npm", "start"]
