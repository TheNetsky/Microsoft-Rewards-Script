#!/bin/bash

# update package list and install necessary dependencies
sudo apt-get update

# install Node.js 20.x using NodeSource setup script
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# install Git
sudo apt-get install -y git

# verifies the right Node.js version is in the environment
node_version=$(node -v)
echo "Node.js version: $node_version" # should print v20.17.0

# verifies the right npm version is in the environment
npm_version=$(npm -v)
echo "npm version: $npm_version" # should print 10.8.2

# clone the repository
git clone https://github.com/TheNetsky/Microsoft-Rewards-Script.git
cd Microsoft-Rewards-Script

# update npm globally to version 10.8.3
sudo npm install -g npm@10.8.3

# install dependencies
npm i

# install playwright browsers
npx playwright install

# show message box asking to rename accounts.example.json to accounts.json
zenity --info --text="Now rename accounts.example.json to accounts.json!" --width=300

# open the src/ directory in the file manager
xdg-open src/ &

# wait until accounts.json is found
while [ ! -f src/accounts.json ]; do
    sleep 1
done

# close explorer if accounts.json was found
pkill -f "xdg-open src/"

# continue with the script
echo "File renamed to accounts.json. Proceeding with the script."

# build and start the script
npm run build
npm run start
