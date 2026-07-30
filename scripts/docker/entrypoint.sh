#!/usr/bin/env bash
set -euo pipefail

# Ensure Playwright uses preinstalled browsers
export PLAYWRIGHT_BROWSERS_PATH=0

SCRIPT_DIR="/usr/src/microsoft-rewards-script"

# 1. Timezone: default to UTC if not provided
: "${TZ:=UTC}"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

# 2. Validate CRON_SCHEDULE (not required in API mode)
if [ "${API_MODE:-false}" != "true" ]; then
  if [ -z "${CRON_SCHEDULE:-}" ]; then
    echo "ERROR: CRON_SCHEDULE environment variable is not set." >&2
    echo "Please set CRON_SCHEDULE (e.g., \"0 2 * * *\")." >&2
    echo "       To run the API server instead, set API_MODE=true." >&2
    exit 1
  fi
fi

# 3. Accounts: read directly from ACCOUNT_N_* env vars by the app at runtime.
#
#    Add one numbered block per account in .env:
#      ACCOUNT_1_EMAIL, ACCOUNT_1_PASSWORD, ...
#      ACCOUNT_2_EMAIL, ACCOUNT_2_PASSWORD, ...
#
#    No accounts.json is generated anymore - loadAccounts() parses the
#    environment. This is just a fail-fast presence check.
mapfile -t account_indexes < <(
  compgen -e | sed -n 's/^ACCOUNT_\([1-9][0-9]*\)_EMAIL$/\1/p' | sort -n -u
)

acct_count=0
for i in "${account_indexes[@]}"; do
  email_var="ACCOUNT_${i}_EMAIL"
  [ -z "${!email_var:-}" ] && continue

  password_var="ACCOUNT_${i}_PASSWORD"
  if [ -z "${!password_var:-}" ]; then
    echo "ERROR: $email_var is set but $password_var is missing." >&2
    exit 1
  fi
  acct_count=$((acct_count + 1))
done

if [ "$acct_count" -eq 0 ]; then
  echo "WARNING: No ACCOUNT_N_EMAIL found in environment - the script will fail." >&2
  echo "         Set at least one ACCOUNT_N_EMAIL and ACCOUNT_N_PASSWORD pair in your .env file." >&2
else
  echo "[entrypoint] Found $acct_count account(s) in environment"
fi

# 4. Config: generate and patch config.json
#
#    Behaviour:
#      - No config.json       → copy config.example.json as starting point
#      - config.json exists   → use as-is (whether user-edited or previously
#                               generated); CONFIG_* overrides always applied
#      - Schema drift         → warn with list of missing keys in both cases;
#                               never auto-modify the file
#
#    headless is always forced true - it is not optional in Docker.
#
#    CONFIG_* env var overrides (applied on every startup):
#
#    General:
#      CONFIG_CLUSTERS=2                 → .clusters
#      CONFIG_DEBUG_LOGS=true            → .debugLogs
#      CONFIG_ERROR_DIAGNOSTICS=true     → .errorDiagnostics
#      CONFIG_ENSURE_STREAK_PROTECTION=true → .ensureStreakProtection
#      CONFIG_AUTO_CLAIM_PUNCHCARD_REWARDS=false → .autoClaimPunchcardRewards
#      CONFIG_SKIP_NON_POINT_TASKS=true  → .skipNonPointTasks
#      CONFIG_GLOBAL_TIMEOUT=30sec       → .globalTimeout
#      CONFIG_ACCOUNT_DELAY_MIN=1min     → .accountDelay.min
#      CONFIG_ACCOUNT_DELAY_MAX=3min     → .accountDelay.max
#
#    Workers (boolean):
#      CONFIG_WORKER_DAILY_SET           → .workers.doDailySet
#      CONFIG_WORKER_CLAIM_BONUS_POINTS  → .workers.doClaimBonusPoints
#      CONFIG_WORKER_MORE_PROMOTIONS     → .workers.doMorePromotions
#      CONFIG_WORKER_PUNCH_CARDS         → .workers.doPunchCards
#      CONFIG_WORKER_APP_PROMOTIONS      → .workers.doAppPromotions
#      CONFIG_WORKER_DESKTOP_SEARCH      → .workers.doDesktopSearch
#      CONFIG_WORKER_MOBILE_SEARCH       → .workers.doMobileSearch
#      CONFIG_WORKER_BONUS_SEARCHES      → .workers.doBonusSearches
#      CONFIG_WORKER_DAILY_CHECKIN       → .workers.doDailyCheckIn
#      CONFIG_WORKER_READ_TO_EARN        → .workers.doReadToEarn
#      CONFIG_WORKER_ACTIVATE_SEARCH_PERK → .workers.doActivateSearchPerk
#      CONFIG_WORKER_VISUAL_SEARCH       → .workers.doVisualSearch
#
#    Search settings:
#      CONFIG_SEARCH_SCROLL_RANDOM       → .searchSettings.scrollRandomResults
#      CONFIG_SEARCH_CLICK_RANDOM        → .searchSettings.clickRandomResults
#      CONFIG_SEARCH_PARALLEL            → .searchSettings.parallelSearching
#      CONFIG_SEARCH_CLUSTER             → .searchSettings.clusterSearch
#      CONFIG_SEARCH_DELAY_MIN           → .searchSettings.searchDelay.min
#      CONFIG_SEARCH_DELAY_MAX           → .searchSettings.searchDelay.max
#      CONFIG_SEARCH_READ_DELAY_MIN      → .searchSettings.readDelay.min
#      CONFIG_SEARCH_READ_DELAY_MAX      → .searchSettings.readDelay.max
#      CONFIG_SEARCH_VISIT_TIME          → .searchSettings.searchResultVisitTime
#      CONFIG_SEARCH_RUN_ON_ZERO_POINTS  → .searchSettings.runOnZeroPoints
#      CONFIG_SEARCH_MAX_BONUS_SEARCHES  → .searchSettings.maxBonusSearches
#      CONFIG_SEARCH_QUERY_ENGINES       → .searchSettings.queryEngines (comma-separated)
#      CONFIG_SEARCH_ON_BING_LOCAL       → .searchOnBingLocalQueries
#
#    Activities:
#      CONFIG_ACTIVITY_URL_REWARD        → .activities.urlReward
#      CONFIG_ACTIVITY_SEARCH_ON_BING    → .activities.searchOnBing
#
#    Experimental:
#      CONFIG_EXPERIMENTAL_API_SEARCH         → .experimental.apiSearch
#      CONFIG_EXPERIMENTAL_API_SEARCH_ON_BING → .experimental.apiSearchOnBing
#
#    Proxy:
#      CONFIG_PROXY_QUERY_ENGINE         → .proxy.queryEngine
#
#    Console log filter:
#      CONFIG_LOG_FILTER_ENABLED         → .consoleLogFilter.enabled
#      CONFIG_LOG_FILTER_MODE            → .consoleLogFilter.mode (whitelist|blacklist)
#      CONFIG_LOG_FILTER_LEVELS          → .consoleLogFilter.levels (comma-separated)
#      CONFIG_LOG_FILTER_KEYWORDS        → .consoleLogFilter.keywords (comma-separated)
#
#    Webhooks:
#      CONFIG_DISCORD_ENABLED / CONFIG_DISCORD_URL
#      CONFIG_TELEGRAM_ENABLED / CONFIG_TELEGRAM_BOTTOKEN / CONFIG_TELEGRAM_CHATID
#      CONFIG_NTFY_ENABLED / CONFIG_NTFY_URL / CONFIG_NTFY_TOPIC / CONFIG_NTFY_TOKEN
#      CONFIG_NTFY_TITLE / CONFIG_NTFY_PRIORITY
#      CONFIG_NTFY_TAGS                  → comma-separated e.g. "bot,notify"
#
#    Webhook log filter:
#      CONFIG_WEBHOOK_LOG_FILTER_ENABLED  → .webhook.webhookLogFilter.enabled
#      CONFIG_WEBHOOK_LOG_FILTER_MODE     → .webhook.webhookLogFilter.mode
#      CONFIG_WEBHOOK_LOG_FILTER_LEVELS   → comma-separated
#      CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS → comma-separated
#
CONFIG_FILE="$SCRIPT_DIR/config/config.json"
CONFIG_EXAMPLE="$SCRIPT_DIR/config.example.json"

# Returns 0 if config.json exists and is a valid JSON object
_config_file_is_valid() {
  [ -f "$CONFIG_FILE" ] && \
  jq -e 'type == "object"' "$CONFIG_FILE" > /dev/null 2>&1
}

# Returns object key-paths present in example but missing from config.
_find_new_keys() {
  local config_keys example_keys
  local jq_expr='[path(..)] | map(select(all(. ; type == "string")) | join(".")) | sort[]'
  config_keys=$(jq -r "$jq_expr" "$CONFIG_FILE" 2>/dev/null)
  example_keys=$(jq -r "$jq_expr" "$CONFIG_EXAMPLE" 2>/dev/null)
  comm -13 <(echo "$config_keys") <(echo "$example_keys")
}

if ! [ -f "$CONFIG_EXAMPLE" ]; then
  echo "ERROR: config.example.json not found at $CONFIG_EXAMPLE - image may be corrupt." >&2
  exit 1
fi

# A single-file bind mount whose host path did not exist makes Docker create a
# *directory* at config.json. Fail clearly instead of writing a broken config.
if [ -d "$CONFIG_FILE" ]; then
  echo "ERROR: $CONFIG_FILE is a directory, not a file." >&2
  echo "       ./config.json likely did not exist on the host when the container" >&2
  echo "       started, so Docker created it as a folder. Remove it and create the" >&2
  echo "       file first:  cp config.example.json config.json" >&2
  exit 1
fi

if _config_file_is_valid; then
  echo "[entrypoint] Using existing config.json."
  new_keys=$(_find_new_keys)
  if [ -n "$new_keys" ]; then
    echo "" >&2
    echo "┌─────────────────────────────────────────────────────────┐" >&2
    echo "│  ⚠  CONFIG UPDATE AVAILABLE                             │" >&2
    echo "│                                                         │" >&2
    echo "│  Your config.json is missing keys added in a recent     │" >&2
    echo "│  update. The script will still run, but new features    │" >&2
    echo "│  may not work correctly.                                │" >&2
    echo "│                                                         │" >&2
    echo "│  Missing keys (see config.example.json for defaults):   │" >&2
    echo "$new_keys" | while IFS= read -r key; do
      printf "│    %-55s│\n" "+ $key" >&2
    done
    echo "│                                                         │" >&2
    echo "│  To fix: delete config.json (or empty it) and restart - │" >&2
    echo "│  it will be regenerated with all current defaults,      │" >&2
    echo "│  then re-apply your CONFIG_* env vars.                  │" >&2
    echo "└─────────────────────────────────────────────────────────┘" >&2
    echo "" >&2
  fi
elif [ ! -e "$CONFIG_FILE" ] || [ ! -s "$CONFIG_FILE" ]; then
  echo "[entrypoint] No config.json found - generating from config.example.json."
  cp "$CONFIG_EXAMPLE" "$CONFIG_FILE"
  echo "[entrypoint] config.json created. Customise via CONFIG_* env vars in compose.yaml."
else
  echo "ERROR: Existing $CONFIG_FILE is not a valid JSON object." >&2
  echo "       Fix it, or empty/delete it to regenerate from config.example.json." >&2
  exit 1
fi

# Apply CONFIG_* env var overrides (always runs, regardless of config source)
echo "[entrypoint] Applying CONFIG_* environment variable overrides..."
_cfg() {
  # _cfg <env_var_value_or_empty> <jq_path> <type: string|bool|number>
  local val="$1" path="$2" type="${3:-string}"
  local json_value tmp="$CONFIG_FILE.tmp"
  [ -z "$val" ] && return 0

  case "$type" in
    bool)
      if [ "$val" != "true" ] && [ "$val" != "false" ]; then
        echo "ERROR: $path expects true or false, got '$val'." >&2
        return 1
      fi
      json_value="$val"
      ;;
    number)
      if ! json_value=$(jq -en --arg raw "$val" '$raw | tonumber'); then
        echo "ERROR: $path expects a JSON number, got '$val'." >&2
        return 1
      fi
      ;;
    string)
      if ! jq --arg v "$val" "$path = \$v" "$CONFIG_FILE" > "$tmp"; then
        rm -f "$tmp"
        return 1
      fi
      mv "$tmp" "$CONFIG_FILE"
      echo "[entrypoint]   $path = $val"
      return 0
      ;;
    *)
      echo "ERROR: Internal config override type '$type' is not supported." >&2
      return 1
      ;;
  esac

  if ! jq --argjson v "$json_value" "$path = \$v" "$CONFIG_FILE" > "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$CONFIG_FILE"
  echo "[entrypoint]   $path = $val"
}

_cfg_array() {
  # _cfg_array <value-or-unset-sentinel> <jq_path>
  # Uses __UNSET__ sentinel to distinguish "var not set" from "var set to empty".
  # An empty value writes [] to the config; an unset var is skipped entirely.
  local val="$1" path="$2"
  [ "$val" = "__UNSET__" ] && return 0
  local json_array
  if [ -z "$val" ]; then
    json_array="[]"
  else
    json_array=$(printf '%s' "$val" | jq -Rc '[split(",") | .[] | ltrimstr(" ") | rtrimstr(" ")]')
  fi
  if ! jq --argjson v "$json_array" "$path = \$v" "$CONFIG_FILE" > "$CONFIG_FILE.tmp"; then
    rm -f "$CONFIG_FILE.tmp"
    return 1
  fi
  mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
  echo "[entrypoint]   $path = [$val]"
}

# headless is always forced true - cannot run headed inside Docker
_cfg 'true'                            '.headless'                                  bool

# Top-level
_cfg "${CONFIG_CLUSTERS:-}"                         '.clusters'                      number
_cfg "${CONFIG_DEBUG_LOGS:-}"                       '.debugLogs'                     bool
_cfg "${CONFIG_ERROR_DIAGNOSTICS:-}"                '.errorDiagnostics'              bool
_cfg "${CONFIG_ENSURE_STREAK_PROTECTION:-}"         '.ensureStreakProtection'        bool
_cfg "${CONFIG_AUTO_CLAIM_PUNCHCARD_REWARDS:-}"     '.autoClaimPunchcardRewards'     bool
_cfg "${CONFIG_SKIP_NON_POINT_TASKS:-}"             '.skipNonPointTasks'             bool
_cfg "${CONFIG_GLOBAL_TIMEOUT:-}"                   '.globalTimeout'                 string
_cfg "${CONFIG_ACCOUNT_DELAY_MIN:-}"                '.accountDelay.min'              string
_cfg "${CONFIG_ACCOUNT_DELAY_MAX:-}"                '.accountDelay.max'              string

# Workers
_cfg "${CONFIG_WORKER_DAILY_SET:-}"            '.workers.doDailySet'            bool
_cfg "${CONFIG_WORKER_CLAIM_BONUS_POINTS:-}"   '.workers.doClaimBonusPoints'    bool
_cfg "${CONFIG_WORKER_MORE_PROMOTIONS:-}"      '.workers.doMorePromotions'      bool
_cfg "${CONFIG_WORKER_PUNCH_CARDS:-}"          '.workers.doPunchCards'          bool
_cfg "${CONFIG_WORKER_APP_PROMOTIONS:-}"       '.workers.doAppPromotions'       bool
_cfg "${CONFIG_WORKER_DESKTOP_SEARCH:-}"       '.workers.doDesktopSearch'       bool
_cfg "${CONFIG_WORKER_MOBILE_SEARCH:-}"        '.workers.doMobileSearch'        bool
_cfg "${CONFIG_WORKER_BONUS_SEARCHES:-}"       '.workers.doBonusSearches'       bool
_cfg "${CONFIG_WORKER_DAILY_CHECKIN:-}"        '.workers.doDailyCheckIn'        bool
_cfg "${CONFIG_WORKER_READ_TO_EARN:-}"         '.workers.doReadToEarn'          bool
_cfg "${CONFIG_WORKER_ACTIVATE_SEARCH_PERK:-}" '.workers.doActivateSearchPerk'  bool
_cfg "${CONFIG_WORKER_VISUAL_SEARCH:-}"       '.workers.doVisualSearch'        bool

# Search settings
_cfg "${CONFIG_SEARCH_SCROLL_RANDOM:-}"    '.searchSettings.scrollRandomResults'    bool
_cfg "${CONFIG_SEARCH_CLICK_RANDOM:-}"     '.searchSettings.clickRandomResults'     bool
_cfg "${CONFIG_SEARCH_PARALLEL:-}"         '.searchSettings.parallelSearching'      bool
_cfg "${CONFIG_SEARCH_CLUSTER:-}"          '.searchSettings.clusterSearch'          bool
_cfg "${CONFIG_SEARCH_DELAY_MIN:-}"        '.searchSettings.searchDelay.min'        string
_cfg "${CONFIG_SEARCH_DELAY_MAX:-}"        '.searchSettings.searchDelay.max'        string
_cfg "${CONFIG_SEARCH_READ_DELAY_MIN:-}"   '.searchSettings.readDelay.min'          string
_cfg "${CONFIG_SEARCH_READ_DELAY_MAX:-}"   '.searchSettings.readDelay.max'          string
_cfg "${CONFIG_SEARCH_VISIT_TIME:-}"       '.searchSettings.searchResultVisitTime'  string
_cfg "${CONFIG_SEARCH_RUN_ON_ZERO_POINTS:-}" '.searchSettings.runOnZeroPoints'      bool
_cfg "${CONFIG_SEARCH_MAX_BONUS_SEARCHES:-}" '.searchSettings.maxBonusSearches'     number
_cfg_array "${CONFIG_SEARCH_QUERY_ENGINES-__UNSET__}" '.searchSettings.queryEngines'
_cfg "${CONFIG_SEARCH_ON_BING_LOCAL:-}"    '.searchOnBingLocalQueries'              bool

# Activities
_cfg "${CONFIG_ACTIVITY_URL_REWARD:-}"     '.activities.urlReward'                  bool
_cfg "${CONFIG_ACTIVITY_SEARCH_ON_BING:-}" '.activities.searchOnBing'               bool

# Experimental
_cfg "${CONFIG_EXPERIMENTAL_API_SEARCH:-}"         '.experimental.apiSearch'         bool
_cfg "${CONFIG_EXPERIMENTAL_API_SEARCH_ON_BING:-}" '.experimental.apiSearchOnBing'   bool

# Proxy
_cfg "${CONFIG_PROXY_QUERY_ENGINE:-}"  '.proxy.queryEngine'  bool

# Console log filter
# Levels and keywords accept comma-separated values e.g. "error,warn"
_cfg "${CONFIG_LOG_FILTER_ENABLED:-}"   '.consoleLogFilter.enabled'  bool
_cfg "${CONFIG_LOG_FILTER_MODE:-}"      '.consoleLogFilter.mode'     string
_cfg_array "${CONFIG_LOG_FILTER_LEVELS-__UNSET__}"    '.consoleLogFilter.levels'
_cfg_array "${CONFIG_LOG_FILTER_KEYWORDS-__UNSET__}"  '.consoleLogFilter.keywords'

# Discord webhook
_cfg "${CONFIG_DISCORD_ENABLED:-}"  '.webhook.discord.enabled'  bool
_cfg "${CONFIG_DISCORD_URL:-}"      '.webhook.discord.url'      string

# Telegram webhook
_cfg "${CONFIG_TELEGRAM_ENABLED:-}"  '.webhook.telegram.enabled'  bool
_cfg "${CONFIG_TELEGRAM_BOTTOKEN:-}"      '.webhook.telegram.botToken'      string
_cfg "${CONFIG_TELEGRAM_CHATID:-}"      '.webhook.telegram.chatId'      string

# ntfy webhook
_cfg "${CONFIG_NTFY_ENABLED:-}"   '.webhook.ntfy.enabled'   bool
_cfg "${CONFIG_NTFY_URL:-}"       '.webhook.ntfy.url'       string
_cfg "${CONFIG_NTFY_TOPIC:-}"     '.webhook.ntfy.topic'     string
_cfg "${CONFIG_NTFY_TOKEN:-}"     '.webhook.ntfy.token'     string
_cfg "${CONFIG_NTFY_TITLE:-}"     '.webhook.ntfy.title'     string
_cfg "${CONFIG_NTFY_PRIORITY:-}"  '.webhook.ntfy.priority'  number
_cfg_array "${CONFIG_NTFY_TAGS-__UNSET__}"  '.webhook.ntfy.tags'

# Webhook log filter
_cfg "${CONFIG_WEBHOOK_LOG_FILTER_ENABLED:-}"  '.webhook.webhookLogFilter.enabled'  bool
_cfg "${CONFIG_WEBHOOK_LOG_FILTER_MODE:-}"     '.webhook.webhookLogFilter.mode'     string
_cfg_array "${CONFIG_WEBHOOK_LOG_FILTER_LEVELS-__UNSET__}"    '.webhook.webhookLogFilter.levels'
_cfg_array "${CONFIG_WEBHOOK_LOG_FILTER_KEYWORDS-__UNSET__}"  '.webhook.webhookLogFilter.keywords'

echo "[entrypoint] Config ready."

# Link the generated config back to the root so the app script can find it
ln -sf "$CONFIG_FILE" "$SCRIPT_DIR/config.json"

# Snapshot the full container environment for cron-spawned runs
export -p > /etc/container_env
chmod 600 /etc/container_env

# ─────────────────────────────────────────────────────────────────────────────
# 5. Initial run without sleep if RUN_ON_START=true
# ─────────────────────────────────────────────────────────────────────────────
if [ "${RUN_ON_START:-false}" = "true" ]; then
  # Always go through run_daily.sh so the lockfile is acquired and the same
  # code path runs regardless of mode.  In API mode, run_daily.sh calls
  # trigger.js which waits for the API server to be ready before firing.
  echo "[entrypoint] Starting initial run in background at $(date)"
  (
    cd "$SCRIPT_DIR" || {
      echo "[entrypoint-bg] ERROR: Unable to cd to $SCRIPT_DIR" >&2
      exit 1
    }
    SKIP_RANDOM_SLEEP=true scripts/docker/run_daily.sh
    echo "[entrypoint-bg] Initial run completed at $(date)"
  ) &
  echo "[entrypoint] Background process started (PID: $!)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. Start: scheduler-only (default) or API-integrated mode
# ─────────────────────────────────────────────────────────────────────────────
# Default API_HOST to 0.0.0.0 so Docker port-mapping works out of the box.
: "${API_HOST:=0.0.0.0}"
export API_HOST

if [ "${API_MODE:-false}" = "true" ]; then
  # API-integrated mode:
  #   - The API server is the main (foreground) process and becomes PID 1.
  #   - The cron schedule can come from two places, checked in this order:
  #       1. config/schedule.json - a persisted override written by
  #          PUT /schedule (e.g. from the dashboard). Present only if that
  #          endpoint has been used at least once; survives restarts because
  #          it lives in the ./config bind mount.
  #       2. CRON_SCHEDULE - the env var, exactly as before. This remains the
  #          only thing that matters for anyone not using PUT /schedule.
  #   - Either way, if a schedule is active, cron runs as a background daemon;
  #     run_daily.sh detects API_MODE=true and calls POST /start via
  #     scripts/api/trigger.js instead of running npm start directly, so the
  #     API server has full visibility and control over every run.
  #   - With neither source configured, runs must be triggered manually via
  #     POST /start.
  export TZ

  SCHEDULE_OVERRIDE="${SCHEDULE_FILE:-$SCRIPT_DIR/config/schedule.json}"

  if [ -f "$SCHEDULE_OVERRIDE" ]; then
    echo "[entrypoint] Found $SCHEDULE_OVERRIDE - applying it (overrides CRON_SCHEDULE)."
    if node scripts/api/apply-schedule.js; then
      cron -f &
      echo "[entrypoint] Cron started in background (schedule: from schedule.json, TZ: $TZ)"
    else
      echo "ERROR: Could not apply $SCHEDULE_OVERRIDE." >&2
      exit 1
    fi
  elif [ -n "${CRON_SCHEDULE:-}" ]; then
    if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
      echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
      exit 1
    fi
    envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
    chmod 0644 /etc/cron.d/microsoft-rewards-cron
    crontab /etc/cron.d/microsoft-rewards-cron
    cron -f &
    echo "[entrypoint] Cron started in background (schedule: $CRON_SCHEDULE, TZ: $TZ)"
  else
    echo "[entrypoint] No CRON_SCHEDULE set and no schedule.json override - runs must be triggered manually via POST /start, or scheduled from the dashboard."
  fi
  echo "[entrypoint] Starting control API on ${API_HOST}:${API_PORT:-3010} at $(date)"
  exec node scripts/api/server.js
fi

# Scheduler-only mode (default): cron calls npm start directly.
if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
  echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
  exit 1
fi

export TZ
envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
chmod 0644 /etc/cron.d/microsoft-rewards-cron
crontab /etc/cron.d/microsoft-rewards-cron

echo "[entrypoint] Cron configured with schedule: $CRON_SCHEDULE and timezone: $TZ; starting cron at $(date)"

# 7. Start cron in foreground (PID 1)
exec cron -f
