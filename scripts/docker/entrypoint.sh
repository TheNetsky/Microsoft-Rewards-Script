#!/usr/bin/env bash
set -euo pipefail

export PLAYWRIGHT_BROWSERS_PATH=0
SCRIPT_DIR="/usr/src/microsoft-rewards-script"
cd "$SCRIPT_DIR"
source "$SCRIPT_DIR/scripts/lib/dockerLog.sh"

: "${TZ:=UTC}"
export TZ
if [ ! -f "/usr/share/zoneinfo/$TZ" ]; then
    echo "ERROR: Unknown timezone: $TZ" >&2
    exit 1
fi
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

mapfile -t account_indexes < <(
    compgen -e | sed -n 's/^ACCOUNT_\([1-9][0-9]*\)_EMAIL$/\1/p' | sort -n -u
)
acct_count=0
for i in "${account_indexes[@]}"; do
    email_var="ACCOUNT_${i}_EMAIL"
    [ -z "${!email_var:-}" ] && continue
    acct_count=$((acct_count + 1))
done
if [ "$acct_count" -eq 0 ]; then
    docker_log entrypoint warn "WARNING: No ACCOUNT_N_EMAIL found. Configure accounts in .env before starting a bot run."
else
    docker_log entrypoint info "[entrypoint] Found $acct_count account(s) in environment"
fi

CONFIG_FILE="$SCRIPT_DIR/config/config.json"
if [ -d "$CONFIG_FILE" ]; then
    echo "ERROR: $CONFIG_FILE is a directory. Replace it with a config.json file." >&2
    exit 1
fi

SYNC_ARGS=(--config "$CONFIG_FILE")
if [ "${CONFIG_AUTO_SYNC:-false}" = "true" ]; then
    SYNC_ARGS+=(--patch)
fi
docker_log_command config-sync info node dist/config/ConfigSync.js sync "${SYNC_ARGS[@]}"
docker_log_command entrypoint info node dist/config/ConfigEnvOverrides.js apply --config "$CONFIG_FILE"
ln -sf "$CONFIG_FILE" "$SCRIPT_DIR/config.json"
docker_log entrypoint info "[entrypoint] Config ready."

# Run an explicit container command after preparing the configuration.
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

if [ "${API_MODE:-false}" = "true" ]; then
    : "${API_HOST:=0.0.0.0}"
    export API_HOST
    docker_log_command entrypoint info node dist/control-api/apply-schedule.js
else
    if [ -z "${CRON_SCHEDULE:-}" ]; then
        docker_log entrypoint error 'ERROR: Set CRON_SCHEDULE (e.g. "0 7 * * *"), or API_MODE=true for the Control API.'
        exit 1
    fi
    node --input-type=module <<'NODE'
import { applyCrontab } from './dist/control-api/scheduleStore.js'
applyCrontab({ enabled: true, cron: process.env.CRON_SCHEDULE })
NODE
fi

# Cron jobs need the same account, proxy and configuration environment.
export -p > /etc/container_env
chmod 600 /etc/container_env

service_pids=()
cron_pid=''
initial_run_pid=''
stop_services() {
    trap '' INT TERM
    docker_log entrypoint info '[entrypoint] Stopping scheduler and active processes...'
    local child_pids=()
    mapfile -t child_pids < <(jobs -pr)
    for pid in "${child_pids[@]}"; do
        kill -TERM "$pid" 2>/dev/null || true
    done
    [ -z "$cron_pid" ] || wait "$cron_pid" 2>/dev/null || true

    # Cron jobs have their own sessions; let their traps stop the bot process groups.
    local run_pids=()
    mapfile -t run_pids < <(pgrep -f "^/bin/bash $SCRIPT_DIR/scripts/docker/run_daily[.]sh$" || true)
    for pid in "${run_pids[@]}"; do
        kill -TERM "$pid" 2>/dev/null || true
    done
    [ -z "$initial_run_pid" ] || wait "$initial_run_pid" 2>/dev/null || true
    for pid in "${service_pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    local deadline=$((SECONDS + 20))
    for pid in "${run_pids[@]}"; do
        while kill -0 "$pid" 2>/dev/null && [ "$SECONDS" -lt "$deadline" ]; do
            sleep 0.1
        done
    done
}
trap stop_services EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cron -f &
cron_pid=$!
service_pids+=("$cron_pid")
docker_log entrypoint info "[entrypoint] Scheduler started (TZ=$TZ)"

if [ "${API_MODE:-false}" = "true" ]; then
    docker_log entrypoint info "[entrypoint] Starting Control API on ${API_HOST}:${API_PORT:-3010}"
    node dist/control-api/server.js &
    service_pids+=("$!")
    docker_log_flush
    export -p > /etc/container_env
    chmod 600 /etc/container_env
fi

if [ "${RUN_ON_START:-false}" = "true" ]; then
    docker_log entrypoint info '[entrypoint] Starting initial run...'
    SKIP_RANDOM_SLEEP=true /bin/bash "$SCRIPT_DIR/scripts/docker/run_daily.sh" &
    initial_run_pid=$!
fi

# A failed API or scheduler should restart the container, not leave a partial service.
status=0
wait -n "${service_pids[@]}" || status=$?
docker_log entrypoint error "[entrypoint] A service exited unexpectedly (status=$status)."
[ "$status" -ne 0 ] || status=1
exit "$status"
