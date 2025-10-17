#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run setup via npm (Linux/macOS)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== Prerequisite Check ==="

if command -v npm >/dev/null 2>&1; then
  NPM_VERSION="$(npm -v 2>/dev/null || true)"
  echo "npm detected: ${NPM_VERSION}"
else
  echo "[ERROR] npm not detected."
  echo "  Install Node.js and npm from nodejs.org or your package manager"
  exit 1
fi

if command -v git >/dev/null 2>&1; then
  GIT_VERSION="$(git --version 2>/dev/null || true)"
  echo "Git detected: ${GIT_VERSION}"
else
  echo "[WARN] Git not detected."
  echo "  Install (Linux): e.g. 'sudo apt install git' (or your distro equivalent)."
fi

if [ ! -f "${PROJECT_ROOT}/package.json" ]; then
  echo "[ERROR] package.json not found at ${PROJECT_ROOT}" >&2
  exit 1
fi

echo
echo "=== Running setup script via npm ==="
cd "${PROJECT_ROOT}"
exec npm run setup
