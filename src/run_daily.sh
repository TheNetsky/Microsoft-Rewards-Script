#!/usr/bin/env bash
set -euo pipefail

export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
export TZ="${TZ:-UTC}"

cd /usr/src/microsoft-rewards-script

LOCKFILE=/tmp/run_daily.lock

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
    fi
}

# -------------------------------
#  Function: Acquire lock
# -------------------------------
acquire_lock() {
    local max_attempts=5
    local attempt=0
    local timeout_hours=${STUCK_PROCESS_TIMEOUT_HOURS:-8}
    local timeout_seconds=$((timeout_hours * 3600))

    while [ $attempt -lt $max_attempts ]; do
        # Try to create lock with current PID
        if (set -C; echo "$$" > "$LOCKFILE") 2>/dev/null; then
            echo "[$(date)] [run_daily.sh] Lock acquired successfully (PID: $$)"
            return 0
        fi

        # Lock exists, validate it
        if [ -f "$LOCKFILE" ]; then
            local existing_pid
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
        ((attempt++))
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

# Always release lock on exit — but only if we acquired it
trap 'release_lock' EXIT INT TERM

# -------------------------------
#  MAIN EXECUTION FLOW
# -------------------------------
echo "[$(date)] [run_daily.sh] Current process PID: $$"

# Self-heal any broken or empty locks before proceeding
self_heal_lockfile

# Attempt to acquire the lock safely
if ! acquire_lock; then
    exit 0
fi

# Random sleep between MIN and MAX to spread execution
MINWAIT=${MIN_SLEEP_MINUTES:-5}
MAXWAIT=${MAX_SLEEP_MINUTES:-50}
MINWAIT_SEC=$((MINWAIT*60))
MAXWAIT_SEC=$((MAXWAIT*60))

if [ "${SKIP_RANDOM_SLEEP:-false}" != "true" ]; then
    SLEEPTIME=$(( MINWAIT_SEC + RANDOM % (MAXWAIT_SEC - MINWAIT_SEC) ))
    echo "[$(date)] [run_daily.sh] Sleeping for $((SLEEPTIME/60)) minutes ($SLEEPTIME seconds)"
    sleep "$SLEEPTIME"
else
    echo "[$(date)] [run_daily.sh] Skipping random sleep"
fi

# Start the actual script
echo "[$(date)] [run_daily.sh] Starting script..."
if npm start; then
    echo "[$(date)] [run_daily.sh] Script completed successfully."
else
    echo "[$(date)] [run_daily.sh] ERROR: Script failed!" >&2
fi

echo "[$(date)] [run_daily.sh] Script finished"
# Lock is released automatically via trap
