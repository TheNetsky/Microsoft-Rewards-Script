#!/usr/bin/env bash
set -euo pipefail

command="${1:-start}"
[ "$#" -eq 0 ] || shift
case "$command" in
    start|api|manual-login) ;;
    -h|--help)
        echo 'Usage: bash scripts/nix/run.sh [start|api|manual-login] [arguments...]'
        echo 'start runs the bot; api starts the Control API. CONFIG_REWARDS_MODE selects api or browser tasks.'
        exit 0
        ;;
    *)
        echo "Unknown command: $command. Use start, api or manual-login." >&2
        exit 2
        ;;
esac

if [ ! -f package-lock.json ] || [ ! -f scripts/nix/launch.sh ]; then
    echo 'Run this command from the project directory, or use bash /path/to/project/scripts/nix/run.sh.' >&2
    exit 1
fi

# Use the browser revision belonging to the installed Patchright package.
export PLAYWRIGHT_BROWSERS_PATH=0
npm ci --include=dev
npm run install:browser
npm run build

case "$command" in
    start) exec node dist/index.js "$@" ;;
    api) exec node dist/control-api/server.js "$@" ;;
    manual-login) exec node scripts/main/manualLogin.js "$@" ;;
esac
