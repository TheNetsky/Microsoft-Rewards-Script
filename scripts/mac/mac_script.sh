#!/bin/bash

# 设置脚本所在目录的上级目录为工作目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$(dirname "$SCRIPT_DIR")"

# 随机延迟 0～1800 秒（0 到 30 分钟）
sleep $((RANDOM % 1801))

# 进入上级目录并运行 npm start
cd "$WORK_DIR" || exit 1
echo "$(date): Running npm start in $WORK_DIR" >> "$HOME/npm-start.log"
exec npm start