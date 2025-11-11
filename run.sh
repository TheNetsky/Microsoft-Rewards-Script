#!/usr/bin/env bash
set -e

echo "[1/2] Running pre-build..."
npm run pre-build

echo "[2/2] Starting Microsoft Rewards Script..."
nix develop --command bash -c "xvfb-run npm run start"
