#!/bin/bash

install_dependencies() {
    # install curl/git based on package manager
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get >/dev/null; then
            sudo apt-get update && sudo apt-get install -y curl git
        elif command -v dnf >/dev/null; then
            sudo dnf install -y curl git
        elif command -v pacman >/dev/null; then
            sudo pacman -Syu --noconfirm curl git
        else
            echo "Unsupported Linux package manager. Install curl/git manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install curl git
    else
        echo "Unsupported OS. Exiting."
        exit 1
    fi

    # install fnm (Node.js version manager)
    curl -fsSL https://fnm.vercel.app/install | bash
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$(fnm env --shell bash)"    
    fnm install 20 && fnm use 20
}

read -p "Use Docker? [yes/no]: " use_docker
if [[ "$use_docker" == "yes" ]]; then
    if ! command -v docker >/dev/null; then
        echo "Install Docker first: https://docs.docker.com/engine/install/"
        exit 1
    fi
    docker pull node:20 && docker pull mcr.microsoft.com/playwright:focal
    echo "Docker images ready. Use 'docker compose up' to start."
    exit 0
fi

install_dependencies

npm install -g npm@10.8.3
npm i && npx playwright install

# account setup (GUI/CLI detection)
if [ -n "$DISPLAY" ] && command -v zenity >/dev/null; then
    zenity --info --text="Rename accounts.example.json to accounts.json" --width=300
    xdg-open src/ &
else
    echo "1. Rename src/accounts.example.json to accounts.json"
    echo "2. Add your accounts in the JSON file"
    read -p "Press Enter when done..."
fi

# wait for accounts.json
until [ -f src/accounts.json ]; do sleep 1; done
pkill -f "xdg-open src/" 2>/dev/null

npm run build && npm run start
