#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run unified Node setup script (setup/setup.mjs) regardless of CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_FILE="${SCRIPT_DIR}/setup.mjs"

echo "=== Prerequisite Check ==="

if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -v 2>/dev/null || true)"
  echo "Node detected: ${NODE_VERSION}"
else
  echo "[WARN] Node.js not detected."
  echo "  Install (Linux): use your package manager (e.g. 'sudo apt install nodejs npm' or install from nodejs.org for latest)."
fi

if command -v git >/dev/null 2>&1; then
  GIT_VERSION="$(git --version 2>/dev/null || true)"
  echo "Git detected: ${GIT_VERSION}"
else
  echo "[WARN] Git not detected."
  echo "  Install (Linux): e.g. 'sudo apt install git' (or your distro equivalent)."
fi

if [ -z "${NODE_VERSION:-}" ]; then
  read -r -p "Continue anyway? (yes/no) : " CONTINUE
  case "${CONTINUE,,}" in
    yes|y) ;;
    *) echo "Aborting. Install prerequisites then re-run."; exit 1;;
  esac
fi

if [ ! -f "${SETUP_FILE}" ]; then
  echo "[ERROR] setup.mjs not found at ${SETUP_FILE}" >&2
  exit 1
fi

echo
echo "=== Running setup script ==="
exec node "${SETUP_FILE}"
