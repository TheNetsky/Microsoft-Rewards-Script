#!/usr/bin/env bash

DOCKER_LOG_QUEUE="${DOCKER_LOG_QUEUE:-/tmp/microsoft-rewards-docker-log-queue}"

# Exit 0 when the API accepted or permanently rejected the line; 1 when it is unreachable.
_docker_log_post() {
    local line="$1"
    DOCKER_LOG_LINE="$line" node --input-type=commonjs >/dev/null 2>&1 <<'NODE'
const http = require('node:http')
const line = process.env.DOCKER_LOG_LINE
const port = Number(process.env.API_PORT || 3010)
if (!line || !Number.isInteger(port) || port < 1 || port > 65535) process.exit(0)
const payload = JSON.stringify({ line })
const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
if (process.env.API_TOKEN) headers.Authorization = `Bearer ${process.env.API_TOKEN}`
const request = http.request({ host: '127.0.0.1', port, path: '/docker-log', method: 'POST', headers }, response => {
    response.resume()
    response.on('end', () => {
        process.exitCode = response.statusCode >= 500 || [401, 403, 404].includes(response.statusCode) ? 1 : 0
    })
})
request.setTimeout(1500, () => request.destroy())
request.on('error', () => {
    process.exitCode = 1
})
request.end(payload)
NODE
}

_docker_log_forward() {
    [ "${API_MODE:-false}" = "true" ] || return 0

    local line="$1"
    local lock_fd
    exec {lock_fd}>>"${DOCKER_LOG_QUEUE}.lock"
    flock "$lock_fd"
    if [ "${DOCKER_LOG_FORWARD_ENABLED:-false}" != "true" ] || ! _docker_log_post "$line"; then
        printf '%s\n' "$line" >> "$DOCKER_LOG_QUEUE"
    fi
    flock -u "$lock_fd"
    exec {lock_fd}>&-
}

# docker_log <component> <info|warn|error> <message...>
docker_log() {
    local component="$1"
    local level="$2"
    shift 2
    local message="$*"
    local line

    if [[ "$message" == *$'\033'* ]]; then
        message="$(printf '%s' "$message" | sed -E $'s/\033\\[[0-9;]*m//g')"
    fi

    # Preserve logs emitted by Node instead of wrapping them in a second prefix.
    local log_pattern='^\[[^]]+\] \[[^]]+\] \[(DEBUG|INFO|WARN|ERROR)\] MAIN \[[^]]+\] '
    if [[ "$message" =~ $log_pattern ]]; then
        line="$message"
        level="${BASH_REMATCH[1],,}"
    else
        message="${message#"[$component] "}"
        line="[$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')] [MAIN] [${level^^}] MAIN [${component^^}] $message"
    fi

    if [ "$level" = "warn" ] || [ "$level" = "error" ]; then
        printf '%s\n' "$line" >&2
    else
        printf '%s\n' "$line"
    fi
    _docker_log_forward "$line"
}

# Runs a command and logs each line of its combined output through docker_log.
docker_log_command() {
    local component="$1"
    local level="$2"
    shift 2
    local output
    local status=0
    local line

    output=$("$@" 2>&1) || status=$?
    if [ -n "$output" ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            docker_log "$component" "$level" "$line"
        done <<< "$output"
    fi
    return "$status"
}

# Sends lines queued before the API was reachable, then enables direct forwarding.
docker_log_flush() {
    [ "${API_MODE:-false}" = "true" ] || return 0

    local attempts=0
    local lock_fd
    local line
    local pending_file="${DOCKER_LOG_QUEUE}.pending.$$"
    while [ -s "$DOCKER_LOG_QUEUE" ] && [ "$attempts" -lt 50 ]; do
        attempts=$((attempts + 1))
        exec {lock_fd}>>"${DOCKER_LOG_QUEUE}.lock"
        flock "$lock_fd"
        : > "$pending_file"
        while IFS= read -r line || [ -n "$line" ]; do
            if _docker_log_post "$line"; then
                DOCKER_LOG_FORWARD_ENABLED=true
                export DOCKER_LOG_FORWARD_ENABLED
            else
                printf '%s\n' "$line" >> "$pending_file"
            fi
        done < "$DOCKER_LOG_QUEUE"
        mv "$pending_file" "$DOCKER_LOG_QUEUE"
        flock -u "$lock_fd"
        exec {lock_fd}>&-
        [ ! -s "$DOCKER_LOG_QUEUE" ] || sleep 0.1
    done
    rm -f "$pending_file"
}
