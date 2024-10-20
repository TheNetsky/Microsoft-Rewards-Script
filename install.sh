#!/bin/bash

# Function to detect OS and install necessary dependencies
install_dependencies() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get >/dev/null; then
            sudo apt-get update
            sudo apt-get install -y curl git
        elif command -v dnf >/dev/null; then
            sudo dnf install -y curl git
        elif command -v pacman >/dev/null; then
            sudo pacman -Syu curl git --noconfirm
        else
            echo "Unsupported package manager. Please install Node.js and Git manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS with Homebrew
        brew install curl git
    else
        echo "Unsupported OS. Exiting."
        exit 1
    fi
}

# Prompt user for Docker usage
read -p "Do you want to use Docker for setup? (yes/no): " use_docker
if [ "$use_docker" == "yes" ]; then
    # Docker setup steps
    if command -v docker >/dev/null; then
        docker pull node:20
        docker pull mcr.microsoft.com/playwright:focal
        echo "Docker environment ready."
    else
        echo "Docker is not installed. Please install Docker first."
    fi
    exit 0
fi

# Call the function to install dependencies
install_dependencies

# Install Node.js 20.x using NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git
sudo apt-get install -y git

# Verify Node.js and npm versions
node_version=$(node -v)
echo "Node.js version: $node_version" # should print v20.17.0

npm_version=$(npm -v)
echo "npm version: $npm_version" # should print 10.8.2

# Clone the repository
git clone https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script

# Update npm globally to version 10.8.3
sudo npm install -g npm@10.8.3

# Install dependencies
npm i

# Install Playwright browsers
npx playwright install

# Build and start the script
npm run build
npm run start

