#!/usr/bin/env bash
set -euo pipefail

# 确保 Playwright 使用预安装的浏览器
export PLAYWRIGHT_BROWSERS_PATH=0

SCRIPT_DIR="/usr/src/microsoft-rewards-script"

# 1. 时区：未提供时默认使用 UTC
: "${TZ:=UTC}"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

# 2. 验证 CRON_SCHEDULE（API 模式下不需要）
if [ "${API_MODE:-false}" != "true" ]; then
  if [ -z "${CRON_SCHEDULE:-}" ]; then
    echo "ERROR: CRON_SCHEDULE environment variable is not set." >&2
    echo "Please set CRON_SCHEDULE (e.g., \"0 2 * * *\")." >&2
    echo "       To run the API server instead, set API_MODE=true." >&2
    exit 1
  fi
fi

# 3. 账号：应用在运行时直接读取 ACCOUNT_N_* 环境变量。
#
#    在 .env 中为每个账号添加一个编号配置块：
#      ACCOUNT_1_EMAIL, ACCOUNT_1_PASSWORD, ...
#      ACCOUNT_2_EMAIL, ACCOUNT_2_PASSWORD, ...
#
#    不再生成 accounts.json，loadAccounts() 会解析环境变量。
#    此处仅执行快速失败的存在性检查。
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

# 4. 配置：生成/同步 config.json
#
#    生成和偏差检测委托给 dist/util/ConfigSync.js
#    （由 src/util/ConfigSync.ts 构建），API 配置编辑器也使用同一模块，
#    因此该逻辑只维护一份。差异比较/合并实现请参阅该文件。
#
#    行为：
#      - 没有 config.json       → 根据 config.example.json 生成
#      - config.json 已存在     → 与 config.example.json 比较；
#                                 随后始终应用 CONFIG_* 覆盖配置
#      - 配置结构发生偏差       → 报告缺少的键。设置
#                                 CONFIG_AUTO_SYNC=true 可自动补充到文件中
#                                 （同时保留 .bak 备份）；默认仅报告，
#                                 与此前行为一致。
#      - config.json 已损坏     → 明确失败，而不是静默覆盖。
#
#    headless 始终强制设为 true，在 Docker 中不可选。
#
#    CONFIG_* 环境变量覆盖配置（每次启动时应用）统一定义在
#    src/util/ConfigEnvOverrides.ts（ENV_OVERRIDES 表）中，而不是此处。
#    运行 `node dist/util/ConfigEnvOverrides.js list` 可查看当前支持的
#    完整变量列表及每个变量映射的配置路径。
#
CONFIG_FILE="$SCRIPT_DIR/config/config.json"
CONFIG_EXAMPLE="$SCRIPT_DIR/config.example.json"

if ! [ -f "$CONFIG_EXAMPLE" ]; then
  echo "ERROR: config.example.json not found at $CONFIG_EXAMPLE - image may be corrupt." >&2
  exit 1
fi

# 如果单文件绑定挂载的主机路径不存在，Docker 会在 config.json 位置创建
# 一个目录。此时明确失败，避免写入损坏的配置。
if [ -d "$CONFIG_FILE" ]; then
  echo "ERROR: $CONFIG_FILE is a directory, not a file." >&2
  echo "       ./config.json likely did not exist on the host when the container" >&2
  echo "       started, so Docker created it as a folder. Remove it and create the" >&2
  echo "       file first:  cp config.example.json config.json" >&2
  exit 1
fi

SYNC_ARGS=(--config "$CONFIG_FILE" --example "$CONFIG_EXAMPLE")
if [ "${CONFIG_AUTO_SYNC:-false}" = "true" ]; then
  SYNC_ARGS+=(--patch)
fi
if ! node "$SCRIPT_DIR/dist/util/ConfigSync.js" sync "${SYNC_ARGS[@]}"; then
  echo "ERROR: config sync failed - see above." >&2
  exit 1
fi

# 应用 CONFIG_* 环境变量覆盖配置（无论配置来源如何，始终执行）。
# 此操作委托给 dist/util/ConfigEnvOverrides.js（由
# src/util/ConfigEnvOverrides.ts 构建），完整映射表请参阅该文件。
echo "[entrypoint] Applying CONFIG_* environment variable overrides..."
if ! node "$SCRIPT_DIR/dist/util/ConfigEnvOverrides.js" apply --config "$CONFIG_FILE"; then
  echo "ERROR: applying CONFIG_* overrides failed - see above." >&2
  exit 1
fi

echo "[entrypoint] Config ready."

# 将生成的配置链接回根目录，以便应用脚本找到它
ln -sf "$CONFIG_FILE" "$SCRIPT_DIR/config.json"

# 保存完整的容器环境，供 cron 启动的任务使用
export -p > /etc/container_env
chmod 600 /etc/container_env

# ─────────────────────────────────────────────────────────────────────────────
# 5. 当 RUN_ON_START=true 时立即执行首次任务，不进行等待
# ─────────────────────────────────────────────────────────────────────────────
if [ "${RUN_ON_START:-false}" = "true" ]; then
  # 始终通过 run_daily.sh 执行，以获取锁文件并确保所有模式使用相同代码路径。
  # 在 API 模式下，run_daily.sh 会调用 trigger.js，后者等待 API 服务器就绪后再触发任务。
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
# 6. 启动：仅调度器（默认）或 API 集成模式
# ─────────────────────────────────────────────────────────────────────────────
# API_HOST 默认为 0.0.0.0，使 Docker 端口映射无需额外配置即可工作。
: "${API_HOST:=0.0.0.0}"
export API_HOST

if [ "${API_MODE:-false}" = "true" ]; then
  # API 集成模式：
  #   - API 服务器是主进程（前台进程），并成为 PID 1。
  #   - cron 计划可以来自两个位置，并按以下顺序检查：
  #       1. config/schedule.json：由 PUT /schedule（例如通过仪表板）写入的
  #          持久化覆盖配置。仅当该端点至少使用过一次时存在；由于文件位于
  #          ./config 绑定挂载中，因此重启后仍会保留。
  #       2. CRON_SCHEDULE：与此前完全相同的环境变量。对于未使用
  #          PUT /schedule 的用户，仍然只需关注此项。
  #   - 无论使用哪种来源，只要计划有效，cron 就会作为后台守护进程运行；
  #     run_daily.sh 检测到 API_MODE=true 后，会通过 scripts/api/trigger.js
  #     调用 POST /start，而不是直接运行 npm start，使 API 服务器能够完整
  #     查看并控制每次任务。
  #   - 如果两个来源都未配置，则必须通过 POST /start 手动触发任务。
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

# 仅调度器模式（默认）：cron 直接调用 npm start。
if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
  echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
  exit 1
fi

export TZ
envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
chmod 0644 /etc/cron.d/microsoft-rewards-cron
crontab /etc/cron.d/microsoft-rewards-cron

echo "[entrypoint] Cron configured with schedule: $CRON_SCHEDULE and timezone: $TZ; starting cron at $(date)"

# 7. 在前台启动 cron（PID 1）
exec cron -f
