#!/usr/bin/env bash
set -euo pipefail

# Ensure Playwright uses the preinstalled browsers
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Ensure TZ is set (entrypoint sets TZ system-wide); fallback if missing
export TZ="${TZ:-UTC}"

# Change to project directory
cd /usr/src/microsoft-rewards-script

# Robust locking mechanism
LOCKFILE=/tmp/run_daily.lock

# Function to acquire lock with timeout and stale lock detection
acquire_lock() {
    local max_attempts=5
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        # Try to acquire lock
        if (set -C; echo $ > "$LOCKFILE") 2>/dev/null; then
            echo "[$(date)] [run_daily.sh] Lock acquired successfully (PID: $)"
            return 0
        fi
        
        # Check if existing lock is stale
        if [ -f "$LOCKFILE" ]; then
            local existing_pid
            existing_pid=$(cat "$LOCKFILE" 2>/dev/null || echo "")
            
            if [ -n "$existing_pid" ]; then
                # Check if process is dead
                if ! kill -0 "$existing_pid" 2>/dev/null; then
                    echo "[$(date)] [run_daily.sh] Removing stale lock (dead PID: $existing_pid)"
                    rm -f "$LOCKFILE"
                    continue
                fi
                
                # Check if process is older than configured timeout (default 8 hours)
                local timeout_hours=${STUCK_PROCESS_TIMEOUT_HOURS:-8}
                local timeout_seconds=$((timeout_hours * 3600))
                local process_age
                if process_age=$(ps -o etimes= -p "$existing_pid" 2>/dev/null | tr -d ' '); then
                    if [ "$process_age" -gt "$timeout_seconds" ]; then
                        echo "[$(date)] [run_daily.sh] Process $existing_pid has been running for ${process_age}s (>${timeout_hours}h), considering it stuck"
                        echo "[$(date)] [run_daily.sh] Killing stuck process $existing_pid"
                        kill -TERM "$existing_pid" 2>/dev/null || true
                        sleep 5
                        kill -KILL "$existing_pid" 2>/dev/null || true
                        rm -f "$LOCKFILE"
                        continue
                    else
                        echo "[$(date)] [run_daily.sh] Process $existing_pid still running (${process_age}s), but within normal range"
                    fi
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

# Function to release lock
release_lock() {
    if [ -f "$LOCKFILE" ]; then
        local lock_pid
        lock_pid=$(cat "$LOCKFILE" 2>/dev/null || echo "")
        if [ "$lock_pid" = "$$" ]; then
            rm -f "$LOCKFILE"
            echo "[$(date)] [run_daily.sh] Lock released"
        fi
    fi
}

# Set up cleanup trap - this runs on ANY exit (success, failure, signal)
trap 'release_lock' EXIT INT TERM

# Try to acquire the lock
if ! acquire_lock; then
    exit 0
fi

# Random sleep between configurable minutes (default 5-50 minutes)
MINWAIT=${MIN_SLEEP_MINUTES:-5}
MAXWAIT=${MAX_SLEEP_MINUTES:-50}
MINWAIT_SEC=$((MINWAIT*60))
MAXWAIT_SEC=$((MAXWAIT*60))

# Skip sleep if SKIP_RANDOM_SLEEP is set to true
if [ "${SKIP_RANDOM_SLEEP:-false}" != "true" ]; then
    SLEEPTIME=$(( MINWAIT_SEC + RANDOM % (MAXWAIT_SEC - MINWAIT_SEC) ))
    SLEEP_MINUTES=$(( SLEEPTIME / 60 ))
    echo "[$(date)] [run_daily.sh] Sleeping for $SLEEP_MINUTES minutes ($SLEEPTIME seconds) to randomize execution..."
    sleep "$SLEEPTIME"
else
    echo "[$(date)] [run_daily.sh] Skipping random sleep (SKIP_RANDOM_SLEEP=true)"
fi

echo "[$(date)] [run_daily.sh] Starting script..."
if npm start; then
  echo "[$(date)] [run_daily.sh] Script completed successfully."
else
  echo "[$(date)] [run_daily.sh] ERROR: Script failed!" >&2
fi

echo "[$(date)] [run_daily.sh] Script finished"
# Lock will be released automatically via EXIT trap