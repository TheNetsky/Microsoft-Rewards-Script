#!/usr/bin/env bash
set -euo pipefail

# Preserve any value injected by the caller (e.g. SKIP_RANDOM_SLEEP=true from
# entrypoint's RUN_ON_START prefix) before the env file can override it.
_SKIP_SLEEP_OVERRIDE="${SKIP_RANDOM_SLEEP:-}"

# Restore container environment (ACCOUNT_*, CONFIG_*, etc.) lost when cron spawns this job
if [ -f /etc/container_env ]; then
    # shellcheck source=/dev/null
    . /etc/container_env
fi

# Re-apply the caller's override so sourcing /etc/container_env can't reset it.
[ -n "$_SKIP_SLEEP_OVERRIDE" ] && SKIP_RANDOM_SLEEP="$_SKIP_SLEEP_OVERRIDE"
unset _SKIP_SLEEP_OVERRIDE

export PLAYWRIGHT_BROWSERS_PATH=0
export TZ="${TZ:-UTC}"

cd /usr/src/microsoft-rewards-script

LOCKFILE=/tmp/run_daily.lock

is_positive_integer() {
    [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

is_nonnegative_integer() {
    [[ "$1" =~ ^[0-9]+$ ]]
}

is_run_daily_process() {
    local pid="$1"
    [ -r "/proc/$pid/cmdline" ] || return 1
    tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q 'scripts/docker/run_daily\.sh'
}

# -------------------------------
#  Function: Check and fix lockfile integrity
# -------------------------------
self_heal_lockfile() {
    # If lockfile exists but is empty → remove it
    if [ -f "$LOCKFILE" ]; then
        local lock_content
        lock_content=$(<"$LOCKFILE" || echo "")

        if [[ -z "$lock_content" ]]; then
            echo "[$(date)] [run_daily.sh] Found empty lockfile → removing."
            rm -f "$LOCKFILE"
            return
        fi

        # If lockfile contains non-numeric PID → remove it
        if ! [[ "$lock_content" =~ ^[0-9]+$ ]]; then
            echo "[$(date)] [run_daily.sh] Found corrupted lockfile content ('$lock_content') → removing."
            rm -f "$LOCKFILE"
            return
        fi

        # If lockfile contains PID but process is dead → remove it
        if ! kill -0 "$lock_content" 2>/dev/null; then
            echo "[$(date)] [run_daily.sh] Lockfile PID $lock_content is dead → removing stale lock."
            rm -f "$LOCKFILE"
            return
        fi

        # PID reuse must never make this script treat an unrelated process as a
        # rewards run, much less terminate it as "stuck".
        if ! is_run_daily_process "$lock_content"; then
            echo "[$(date)] [run_daily.sh] Lockfile PID $lock_content is not run_daily.sh → removing stale lock."
            rm -f "$LOCKFILE"
        fi
    fi
}

# -------------------------------
#  Function: Acquire lock
# -------------------------------
acquire_lock() {
    local max_attempts=5
    local attempt=0
    local timeout_hours=${STUCK_PROCESS_TIMEOUT_HOURS:-8}
    local timeout_seconds
    local existing_pid="unknown"

    if ! is_positive_integer "$timeout_hours"; then
        echo "[$(date)] [run_daily.sh] ERROR: STUCK_PROCESS_TIMEOUT_HOURS must be a positive integer." >&2
        return 2
    fi
    timeout_seconds=$((timeout_hours * 3600))

    while [ $attempt -lt $max_attempts ]; do
        # Try to create lock with current PID
        if (set -C; echo "$$" > "$LOCKFILE") 2>/dev/null; then
            echo "[$(date)] [run_daily.sh] Lock acquired successfully (PID: $$)"
            return 0
        fi

        # Lock exists, validate it
        if [ -f "$LOCKFILE" ]; then
            existing_pid=$(<"$LOCKFILE" || echo "")

            echo "[$(date)] [run_daily.sh] Lock file exists with PID: '$existing_pid'"

            # If lockfile content is invalid → delete and retry
            if [[ -z "$existing_pid" || ! "$existing_pid" =~ ^[0-9]+$ ]]; then
                echo "[$(date)] [run_daily.sh] Removing invalid lockfile → retrying..."
                rm -f "$LOCKFILE"
                continue
            fi

            # If process is dead → delete and retry
            if ! kill -0 "$existing_pid" 2>/dev/null; then
                echo "[$(date)] [run_daily.sh] Removing stale lock (dead PID: $existing_pid)"
                rm -f "$LOCKFILE"
                continue
            fi

            if ! is_run_daily_process "$existing_pid"; then
                echo "[$(date)] [run_daily.sh] Removing stale lock owned by unrelated PID $existing_pid"
                rm -f "$LOCKFILE"
                continue
            fi

            # Check process runtime → kill if exceeded timeout
            local process_age
            if process_age=$(ps -o etimes= -p "$existing_pid" 2>/dev/null | tr -d ' '); then
                if [ "$process_age" -gt "$timeout_seconds" ]; then
                    echo "[$(date)] [run_daily.sh] Killing stuck process $existing_pid (${process_age}s > ${timeout_hours}h)"
                    kill -TERM "$existing_pid" 2>/dev/null || true
                    sleep 5
                    kill -KILL "$existing_pid" 2>/dev/null || true
                    rm -f "$LOCKFILE"
                    continue
                fi
            fi
        fi

        echo "[$(date)] [run_daily.sh] Lock held by PID $existing_pid, attempt $((attempt + 1))/$max_attempts"
        sleep 2
        attempt=$((attempt + 1))
    done

    echo "[$(date)] [run_daily.sh] Could not acquire lock after $max_attempts attempts; exiting."
    return 1
}

# -------------------------------
#  Function: Release lock
# -------------------------------
release_lock() {
    if [ -f "$LOCKFILE" ]; then
        local lock_pid
        lock_pid=$(<"$LOCKFILE")
        if [ "$lock_pid" = "$$" ]; then
            rm -f "$LOCKFILE"
            echo "[$(date)] [run_daily.sh] Lock released (PID: $$)"
        fi
    fi
}

# Always release the lock on exit, including interrupt/termination paths.
trap release_lock EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# -------------------------------
#  MAIN EXECUTION FLOW
# -------------------------------
echo "[$(date)] [run_daily.sh] Current process PID: $$"

# Self-heal any broken or empty locks before proceeding
self_heal_lockfile

# Attempt to acquire the lock safely. A held lock is a clean skip; invalid
# scheduler configuration is an error.
if acquire_lock; then
    :
else
    lock_status=$?
    [ "$lock_status" -eq 2 ] && exit 1
    exit 0
fi

# Random sleep between MIN and MAX to spread execution
MINWAIT=${MIN_SLEEP_MINUTES:-5}
MAXWAIT=${MAX_SLEEP_MINUTES:-50}

if ! is_nonnegative_integer "$MINWAIT" || ! is_nonnegative_integer "$MAXWAIT"; then
    echo "[$(date)] [run_daily.sh] ERROR: MIN_SLEEP_MINUTES and MAX_SLEEP_MINUTES must be non-negative integers." >&2
    exit 1
fi
if [ "$MAXWAIT" -lt "$MINWAIT" ]; then
    echo "[$(date)] [run_daily.sh] ERROR: MAX_SLEEP_MINUTES must be greater than or equal to MIN_SLEEP_MINUTES." >&2
    exit 1
fi

MINWAIT_SEC=$((MINWAIT*60))
MAXWAIT_SEC=$((MAXWAIT*60))

if [ "${SKIP_RANDOM_SLEEP:-false}" != "true" ]; then
    if [ "$MAXWAIT_SEC" -eq "$MINWAIT_SEC" ]; then
        SLEEPTIME=$MINWAIT_SEC
    else
        SLEEPTIME=$((MINWAIT_SEC + RANDOM % (MAXWAIT_SEC - MINWAIT_SEC + 1)))
    fi
    echo "[$(date)] [run_daily.sh] Sleeping for $((SLEEPTIME/60)) minutes ($SLEEPTIME seconds)"
    sleep "$SLEEPTIME"
else
    echo "[$(date)] [run_daily.sh] Skipping random sleep"
fi

# Start the actual script
echo "[$(date)] [run_daily.sh] Starting script..."
run_status=0
if [ "${API_MODE:-false}" = "true" ]; then
    # API-integrated mode: delegate to the API server so the dashboard has full
    # visibility and control.  trigger.js calls POST /start and waits for idle.
    if node scripts/api/trigger.js; then
        echo "[$(date)] [run_daily.sh] Script completed successfully (via API)."
    else
        echo "[$(date)] [run_daily.sh] ERROR: Script failed (via API)!" >&2
        run_status=1
    fi
else
    if npm start; then
        echo "[$(date)] [run_daily.sh] Script completed successfully."
    else
        echo "[$(date)] [run_daily.sh] ERROR: Script failed!" >&2
        run_status=1
    fi
fi

echo "[$(date)] [run_daily.sh] Script finished"
# Lock is released automatically via trap
exit "$run_status"
