#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run unified Node setup script (setup/setup.mjs) regardless of CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_FILE="${SCRIPT_DIR}/setup.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found in PATH." >&2
  exit 1
fi

if [ ! -f "${SETUP_FILE}" ]; then
  echo "[ERROR] setup.mjs not found at ${SETUP_FILE}" >&2
  exit 1
fi

exec node "${SETUP_FILE}"
