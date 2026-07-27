#!/usr/bin/env bash
set -euo pipefail

exec nix develop --command xvfb-run -a npm run start
