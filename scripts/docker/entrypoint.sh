#!/usr/bin/env bash
set -euo pipefail

# Ensure Playwright uses preinstalled browsers
export PLAYWRIGHT_BROWSERS_PATH=0

SCRIPT_DIR="/usr/src/microsoft-rewards-script"
DIST_DIR="$SCRIPT_DIR/dist"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Timezone: default to UTC if not provided
# ─────────────────────────────────────────────────────────────────────────────
: "${TZ:=UTC}"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

# ─────────────────────────────────────────────────────────────────────────────
# 2. Validate CRON_SCHEDULE
# ─────────────────────────────────────────────────────────────────────────────
if [ -z "${CRON_SCHEDULE:-}" ]; then
  echo "ERROR: CRON_SCHEDULE environment variable is not set." >&2
  echo "Please set CRON_SCHEDULE (e.g., \"0 2 * * *\")." >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Accounts: generate accounts.json from ACCOUNT_N_* env vars
#
#    Add one numbered block per account in .env, starting at 1:
#      ACCOUNT_1_EMAIL, ACCOUNT_1_PASSWORD, ...
#      ACCOUNT_2_EMAIL, ACCOUNT_2_PASSWORD, ...
#
#    All fields match accounts.example.json exactly.
#    The loop stops at the first missing ACCOUNT_N_EMAIL.
# ─────────────────────────────────────────────────────────────────────────────
CONFIG_DIR="$DIST_DIR/config"
mkdir -p "$CONFIG_DIR"

ACCOUNTS_FILE="$CONFIG_DIR/accounts.json"

_build_account_json() {
  local email="$1"
  local password="$2"
  local totp="${3:-}"
  local recovery="${4:-}"
  local geo="${5:-auto}"
  local lang="${6:-en}"
  local proxy_axios="${7:-false}"
  local proxy_url="${8:-}"
  local proxy_port="${9:-0}"
  local proxy_user="${10:-}"
  local proxy_pass="${11:-}"

  jq -n \
    --arg email "$email" \
    --arg password "$password" \
    --arg totp "$totp" \
    --arg recovery "$recovery" \
    --arg geo "$geo" \
    --arg lang "$lang" \
    --argjson proxyAxios "$proxy_axios" \
    --arg proxyUrl "$proxy_url" \
    --argjson proxyPort "$proxy_port" \
    --arg proxyUser "$proxy_user" \
    --arg proxyPass "$proxy_pass" \
    '{
      email: $email,
      password: $password,
      totpSecret: $totp,
      recoveryEmail: $recovery,
      geoLocale: $geo,
      langCode: $lang,
      proxy: {
        proxyAxios: $proxyAxios,
        url: $proxyUrl,
        port: $proxyPort,
        username: $proxyUser,
        password: $proxyPass
      },
      saveFingerprint: {
        mobile: false,
        desktop: false
      }
    }'
}

account_array="[]"
i=1
while true; do
  email_var="ACCOUNT_${i}_EMAIL"
  pass_var="ACCOUNT_${i}_PASSWORD"
  email="${!email_var:-}"
  [ -z "$email" ] && break
  pass="${!pass_var:?ERROR: ${pass_var} must be set when ${email_var} is set}"

  totp_var="ACCOUNT_${i}_TOTP_SECRET";      totp="${!totp_var:-}"
  rec_var="ACCOUNT_${i}_RECOVERY_EMAIL";    rec="${!rec_var:-}"
  geo_var="ACCOUNT_${i}_GEO_LOCALE";        geo="${!geo_var:-auto}"
  lang_var="ACCOUNT_${i}_LANG_CODE";        lang="${!lang_var:-en}"
  paxios_var="ACCOUNT_${i}_PROXY_AXIOS";    paxios="${!paxios_var:-false}"
  purl_var="ACCOUNT_${i}_PROXY_URL";        purl="${!purl_var:-}"
  pport_var="ACCOUNT_${i}_PROXY_PORT";      pport="${!pport_var:-0}"
  puser_var="ACCOUNT_${i}_PROXY_USERNAME";  puser="${!puser_var:-}"
  ppass_var="ACCOUNT_${i}_PROXY_PASSWORD";  ppass="${!ppass_var:-}"

  account_json=$(_build_account_json "$email" "$pass" "$totp" "$rec" "$geo" "$lang" "$paxios" "$purl" "$pport" "$puser" "$ppass")
  account_array=$(echo "$account_array" | jq ". + [$account_json]")
  i=$((i + 1))
done

if [ "$(echo "$account_array" | jq 'length')" -gt 0 ]; then
  echo "$account_array" > "$ACCOUNTS_FILE"
  echo "[entrypoint] accounts.json written with $(echo "$account_array" | jq 'length') account(s)"
else
  echo "WARNING: No ACCOUNT_1_EMAIL found. accounts.json not written — script will likely fail." >&2
  echo "         Set ACCOUNT_1_EMAIL and ACCOUNT_1_PASSWORD in your .env file." >&2
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. Config: generate and patch config.json
#
#    Behaviour:
#      - No config.json       → copy config.example.json as starting point
#      - config.json exists   → use as-is (whether user-edited or previously
#                               generated); CONFIG_* overrides always applied
#      - Schema drift         → warn with list of missing keys in both cases;
#                               never auto-modify the file
#
#    headless is always forced true — it is not optional in Docker.
#
#    CONFIG_* env var overrides (applied on every startup):
#
#    General:
#      CONFIG_CLUSTERS=2                 → .clusters
#      CONFIG_DEBUG_LOGS=true            → .debugLogs
#      CONFIG_ERROR_DIAGNOSTICS=true     → .errorDiagnostics
#      CONFIG_GLOBAL_TIMEOUT=30sec       → .globalTimeout
#
#    Workers (boolean):
#      CONFIG_WORKER_DAILY_SET           → .workers.doDailySet
#      CONFIG_WORKER_SPECIAL_PROMOTIONS  → .workers.doSpecialPromotions
#      CONFIG_WORKER_MORE_PROMOTIONS     → .workers.doMorePromotions
#      CONFIG_WORKER_PUNCH_CARDS         → .workers.doPunchCards
#      CONFIG_WORKER_APP_PROMOTIONS      → .workers.doAppPromotions
#      CONFIG_WORKER_DESKTOP_SEARCH      → .workers.doDesktopSearch
#      CONFIG_WORKER_MOBILE_SEARCH       → .workers.doMobileSearch
#      CONFIG_WORKER_DAILY_CHECKIN       → .workers.doDailyCheckIn
#      CONFIG_WORKER_READ_TO_EARN        → .workers.doReadToEarn
#
#    Search settings:
#      CONFIG_SEARCH_SCROLL_RANDOM       → .searchSettings.scrollRandomResults
#      CONFIG_SEARCH_CLICK_RANDOM        → .searchSettings.clickRandomResults
#      CONFIG_SEARCH_PARALLEL            → .searchSettings.parallelSearching
#      CONFIG_SEARCH_DELAY_MIN           → .searchSettings.searchDelay.min
#      CONFIG_SEARCH_DELAY_MAX           → .searchSettings.searchDelay.max
#      CONFIG_SEARCH_READ_DELAY_MIN      → .searchSettings.readDelay.min
#      CONFIG_SEARCH_READ_DELAY_MAX      → .searchSettings.readDelay.max
#      CONFIG_SEARCH_VISIT_TIME          → .searchSettings.searchResultVisitTime
#      CONFIG_SEARCH_ON_BING_LOCAL       → .searchOnBingLocalQueries
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
# ─────────────────────────────────────────────────────────────────────────────
CONFIG_FILE="$CONFIG_DIR/config.json"
CONFIG_EXAMPLE="$SCRIPT_DIR/src/config.example.json"

# Returns 0 if config.json exists and is a valid JSON object
_config_file_is_valid() {
  [ -f "$CONFIG_FILE" ] && \
  [ "$(wc -c < "$CONFIG_FILE")" -gt 10 ] && \
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
  echo "ERROR: config.example.json not found at $CONFIG_EXAMPLE — image may be corrupt." >&2
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
    echo "│  To fix: delete ./config/config.json and restart —      │" >&2
    echo "│  it will be regenerated with all current defaults,      │" >&2
    echo "│  then re-apply your CONFIG_* env vars.                  │" >&2
    echo "└─────────────────────────────────────────────────────────┘" >&2
    echo "" >&2
  fi
else
  echo "[entrypoint] No config.json found — generating from config.example.json."
  cp "$CONFIG_EXAMPLE" "$CONFIG_FILE"
  echo "[entrypoint] config.json created. Customise via CONFIG_* env vars in compose.yaml."
fi

# Apply CONFIG_* env var overrides (always runs, regardless of config source)
echo "[entrypoint] Applying CONFIG_* environment variable overrides..."
_cfg() {
  # _cfg <env_var_value_or_empty> <jq_path> <type: string|bool|number>
  local val="$1" path="$2" type="${3:-string}"
  [ -z "$val" ] && return 0
  case "$type" in
    bool|number)
      jq --argjson v "$val" "$path = \$v" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
      ;;
    *)
      jq --arg v "$val" "$path = \$v" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
      ;;
  esac
  echo "[entrypoint]   $path = $val"
}

# headless is always forced true — cannot run headed inside Docker
_cfg 'true'                            '.headless'                                  bool

# Top-level
_cfg "${CONFIG_CLUSTERS:-}"            '.clusters'                                  number
_cfg "${CONFIG_DEBUG_LOGS:-}"          '.debugLogs'                                 bool
_cfg "${CONFIG_ERROR_DIAGNOSTICS:-}"   '.errorDiagnostics'                          bool
_cfg "${CONFIG_GLOBAL_TIMEOUT:-}"      '.globalTimeout'                             string

# Workers
_cfg "${CONFIG_WORKER_DAILY_SET:-}"           '.workers.doDailySet'           bool
_cfg "${CONFIG_WORKER_SPECIAL_PROMOTIONS:-}"  '.workers.doSpecialPromotions'   bool
_cfg "${CONFIG_WORKER_MORE_PROMOTIONS:-}"     '.workers.doMorePromotions'      bool
_cfg "${CONFIG_WORKER_PUNCH_CARDS:-}"         '.workers.doPunchCards'          bool
_cfg "${CONFIG_WORKER_APP_PROMOTIONS:-}"      '.workers.doAppPromotions'       bool
_cfg "${CONFIG_WORKER_DESKTOP_SEARCH:-}"      '.workers.doDesktopSearch'       bool
_cfg "${CONFIG_WORKER_MOBILE_SEARCH:-}"       '.workers.doMobileSearch'        bool
_cfg "${CONFIG_WORKER_DAILY_CHECKIN:-}"       '.workers.doDailyCheckIn'        bool
_cfg "${CONFIG_WORKER_READ_TO_EARN:-}"        '.workers.doReadToEarn'          bool

# Search settings
_cfg "${CONFIG_SEARCH_SCROLL_RANDOM:-}"    '.searchSettings.scrollRandomResults'    bool
_cfg "${CONFIG_SEARCH_CLICK_RANDOM:-}"     '.searchSettings.clickRandomResults'     bool
_cfg "${CONFIG_SEARCH_PARALLEL:-}"         '.searchSettings.parallelSearching'      bool
_cfg "${CONFIG_SEARCH_DELAY_MIN:-}"        '.searchSettings.searchDelay.min'        string
_cfg "${CONFIG_SEARCH_DELAY_MAX:-}"        '.searchSettings.searchDelay.max'        string
_cfg "${CONFIG_SEARCH_READ_DELAY_MIN:-}"   '.searchSettings.readDelay.min'          string
_cfg "${CONFIG_SEARCH_READ_DELAY_MAX:-}"   '.searchSettings.readDelay.max'          string
_cfg "${CONFIG_SEARCH_VISIT_TIME:-}"       '.searchSettings.searchResultVisitTime'  string
_cfg "${CONFIG_SEARCH_ON_BING_LOCAL:-}"    '.searchOnBingLocalQueries'              bool

# Proxy
_cfg "${CONFIG_PROXY_QUERY_ENGINE:-}"  '.proxy.queryEngine'  bool

# Console log filter
# Levels and keywords accept comma-separated values e.g. "error,warn"
_cfg "${CONFIG_LOG_FILTER_ENABLED:-}"   '.consoleLogFilter.enabled'  bool
_cfg "${CONFIG_LOG_FILTER_MODE:-}"      '.consoleLogFilter.mode'     string
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
    json_array=$(echo "$val" | jq -Rc '[split(",") | .[] | ltrimstr(" ") | rtrimstr(" ")]')
  fi
  jq --argjson v "$json_array" "$path = \$v" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
  echo "[entrypoint]   $path = [$val]"
}
_cfg_array "${CONFIG_LOG_FILTER_LEVELS-__UNSET__}"    '.consoleLogFilter.levels'
_cfg_array "${CONFIG_LOG_FILTER_KEYWORDS-__UNSET__}"  '.consoleLogFilter.keywords'

# Discord webhook
_cfg "${CONFIG_DISCORD_ENABLED:-}"  '.webhook.discord.enabled'  bool
_cfg "${CONFIG_DISCORD_URL:-}"      '.webhook.discord.url'      string

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

# ─────────────────────────────────────────────────────────────────────────────
# 5. Initial run without sleep if RUN_ON_START=true
# ─────────────────────────────────────────────────────────────────────────────
if [ "${RUN_ON_START:-false}" = "true" ]; then
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
# 6. Template and register cron file
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
  echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
  exit 1
fi

export TZ
envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
chmod 0644 /etc/cron.d/microsoft-rewards-cron
crontab /etc/cron.d/microsoft-rewards-cron

echo "[entrypoint] Cron configured with schedule: $CRON_SCHEDULE and timezone: $TZ; starting cron at $(date)"

# ─────────────────────────────────────────────────────────────────────────────
# 7. Start cron in foreground (PID 1)
# ─────────────────────────────────────────────────────────────────────────────
exec cron -f