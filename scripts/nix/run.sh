#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$project_dir"

# Stage only the flake definition, keeping credentials and node_modules out of the Nix store.
flake_dir=$(mktemp -d "${TMPDIR:-/tmp}/rewards-flake.XXXXXXXX")
trap 'rm -rf -- "$flake_dir"' EXIT
mkdir -p "$flake_dir/scripts/nix"
cp flake.nix flake.lock "$flake_dir/"
cp scripts/nix/launch.sh "$flake_dir/scripts/nix/"

run_pid=''
stop_run() {
    local status="$1"
    trap '' INT TERM
    if [ -n "$run_pid" ]; then
        kill -TERM "$run_pid" 2>/dev/null || true
        wait "$run_pid" 2>/dev/null || true
    fi
    exit "$status"
}
trap 'stop_run 130' INT
trap 'stop_run 143' TERM

nix run "path:$flake_dir" -- "$@" <&0 &
run_pid=$!
wait "$run_pid"
