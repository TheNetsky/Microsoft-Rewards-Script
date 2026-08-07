#!/usr/bin/env bash
set -euo pipefail

# 在环境文件覆盖之前，保留调用方注入的值（例如 entrypoint 的
# RUN_ON_START 前缀传入的 SKIP_RANDOM_SLEEP=true）。
_SKIP_SLEEP_OVERRIDE="${SKIP_RANDOM_SLEEP:-}"

# 恢复 cron 启动此任务时丢失的容器环境（ACCOUNT_*、CONFIG_* 等）
if [ -f /etc/container_env ]; then
    # shellcheck source=/dev/null
    . /etc/container_env
fi

# 重新应用调用方的覆盖值，避免加载 /etc/container_env 时将其重置。
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
#  函数：检查并修复锁文件完整性
# -------------------------------
self_heal_lockfile() {
    # 如果锁文件存在但为空，则将其删除
    if [ -f "$LOCKFILE" ]; then
        local lock_content
        lock_content=$(<"$LOCKFILE" || echo "")

        if [[ -z "$lock_content" ]]; then
            echo "[$(date)] [run_daily.sh] Found empty lockfile → removing."
            rm -f "$LOCKFILE"
            return
        fi

        # 如果锁文件包含非数字 PID，则将其删除
        if ! [[ "$lock_content" =~ ^[0-9]+$ ]]; then
            echo "[$(date)] [run_daily.sh] Found corrupted lockfile content ('$lock_content') → removing."
            rm -f "$LOCKFILE"
            return
        fi

        # 如果锁文件包含 PID，但对应进程已结束，则将其删除
        if ! kill -0 "$lock_content" 2>/dev/null; then
            echo "[$(date)] [run_daily.sh] Lockfile PID $lock_content is dead → removing stale lock."
            rm -f "$LOCKFILE"
            return
        fi

        # 不得因 PID 被复用而将无关进程误认为 Rewards 任务，
        # 更不能将其作为“卡住”的进程终止。
        if ! is_run_daily_process "$lock_content"; then
            echo "[$(date)] [run_daily.sh] Lockfile PID $lock_content is not run_daily.sh → removing stale lock."
            rm -f "$LOCKFILE"
        fi
    fi
}

# -------------------------------
#  函数：获取锁
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
        # 尝试使用当前 PID 创建锁
        if (set -C; echo "$$" > "$LOCKFILE") 2>/dev/null; then
            echo "[$(date)] [run_daily.sh] Lock acquired successfully (PID: $$)"
            return 0
        fi

        # 锁已存在，验证其有效性
        if [ -f "$LOCKFILE" ]; then
            existing_pid=$(<"$LOCKFILE" || echo "")

            echo "[$(date)] [run_daily.sh] Lock file exists with PID: '$existing_pid'"

            # 如果锁文件内容无效，则删除并重试
            if [[ -z "$existing_pid" || ! "$existing_pid" =~ ^[0-9]+$ ]]; then
                echo "[$(date)] [run_daily.sh] Removing invalid lockfile → retrying..."
                rm -f "$LOCKFILE"
                continue
            fi

            # 如果进程已结束，则删除并重试
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

            # 检查进程运行时间，超过超时时间则终止
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
#  函数：释放锁
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

# 退出时始终释放锁，包括中断和终止流程。
trap release_lock EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# -------------------------------
#  主执行流程
# -------------------------------
echo "[$(date)] [run_daily.sh] Current process PID: $$"

# 继续执行前自动修复损坏或为空的锁
self_heal_lockfile

# 安全地尝试获取锁。锁已被占用时正常跳过；调度器配置无效则视为错误。
if acquire_lock; then
    :
else
    lock_status=$?
    [ "$lock_status" -eq 2 ] && exit 1
    exit 0
fi

# 在 MIN 和 MAX 之间随机等待，以分散执行时间
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

# 启动实际脚本
echo "[$(date)] [run_daily.sh] Starting script..."
run_status=0
if [ "${API_MODE:-false}" = "true" ]; then
    # API 集成模式：委托给 API 服务器，使仪表板能够完整查看和控制任务。
    # trigger.js 调用 POST /start 并等待状态变为 idle。
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
# 通过 trap 自动释放锁
exit "$run_status"
