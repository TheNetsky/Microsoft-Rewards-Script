###############################################################################
# 阶段 1：构建器
###############################################################################
FROM node:24-slim AS builder

WORKDIR /usr/src/microsoft-rewards-script

ENV PLAYWRIGHT_BROWSERS_PATH=0

# 复制软件包文件
COPY package.json package-lock.json tsconfig.json ./

# 安装构建脚本所需的全部依赖
RUN npm ci --ignore-scripts

# 复制源代码并构建
COPY . .
RUN npm run build

# 移除构建依赖，仅重新安装运行时依赖
RUN rm -rf node_modules \
    && npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

###############################################################################
# 阶段 2：运行时
###############################################################################
FROM node:24-slim AS runtime

WORKDIR /usr/src/microsoft-rewards-script

# 设置生产环境变量
ENV NODE_ENV=production \
    TZ=UTC \
    PLAYWRIGHT_BROWSERS_PATH=0 \
    FORCE_HEADLESS=1 \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

# 安装 Chromium 无头模式运行所需的最小系统库，
# 以及 jq（用于生成/修补配置）和 gettext-base（用于 envsubst）
RUN apt-get update && apt-get install -y --no-install-recommends \
    cron \
    gettext-base \
    jq \
    tzdata \
    ca-certificates \
    libglib2.0-0 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libasound2 \
    libflac12 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libdav1d6 \
    libx11-6 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libdouble-conversion3 \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    fonts-droid-fallback \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# 从构建器阶段复制已编译应用和依赖
COPY --from=builder /usr/src/microsoft-rewards-script/dist ./dist
COPY --from=builder /usr/src/microsoft-rewards-script/package*.json ./
COPY --from=builder /usr/src/microsoft-rewards-script/node_modules ./node_modules

# 安装 Patchright 隐身补丁版 Chromium 无头 shell。
# 容器仅使用无头模式，无需完整浏览器；安装后清理缓存
RUN set -eux; \
    npx patchright install --with-deps --only-shell chromium; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# 将配置示例复制到镜像中，以便用户未挂载自己的 config.json 时，
# 入口点可以将其用作回退配置
COPY config.example.json ./config.example.json

# config.json 通过 ./config 绑定挂载管理（compose.yaml 将 ./config 挂载到
# /usr/src/microsoft-rewards-script/config）。首次运行时，如果配置不存在，
# 入口点会根据此示例生成 config/config.json，然后将其符号链接到脚本预期的项目根目录。
# 账号来自 ACCOUNT_N_* 环境变量，因此无需 accounts.json。

# 从一开始就以正确权限复制运行时脚本
COPY --chmod=755 scripts/docker/run_daily.sh ./scripts/docker/run_daily.sh
COPY --chmod=755 scripts/docker/healthcheck.sh ./scripts/docker/healthcheck.sh
COPY --chmod=755 scripts/api/ ./scripts/api/
COPY --chmod=644 scripts/env.js ./scripts/env.js
COPY --chmod=644 scripts/package.json ./scripts/package.json
COPY --chmod=644 src/crontab.template /etc/cron.d/microsoft-rewards-cron.template
COPY --chmod=755 scripts/docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# 入口点负责处理 TZ、账号/配置生成、初始运行开关、cron 模板与启动，
# 以及 API_MODE=true 时启动 API 服务器
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sh", "-c", "echo 'Container started; cron is running.'"]
