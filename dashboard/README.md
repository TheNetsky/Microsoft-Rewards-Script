# 内嵌积分看板 (dashboard)

与脚本**同容器**运行的 Web 看板(零第三方依赖,纯 Node 内置模块),替代原宿主机 systemd 桥接方案。

## 功能

- 账号积分总览表格(余额 / 今日获得 / 状态 / 错误原因),打开即见、无需等运行
- 「今日获得」按天持久化(Asia/Shanghai 跨天自动归零),失败账号保留上次已知余额
- 多选账号批量运行(勾选 → 只跑选中;不选 → 全量),经 control API `excludedAccountIndexes` 实现
- 订阅 control API `/events` SSE,按事件开关推送钉钉(在线可配,含去重)
- 自动刷新间隔可调(关闭/5/15/30/60 秒,localStorage 记忆)

## 运行方式

`entrypoint.sh` 在 `API_MODE=true` 且 `DASHBOARD_ENABLED`(默认开)时,以守护子进程拉起 `dashboard/server.js`,
崩溃 5 秒后自动重启;`healthcheck.sh` 会同时探测 control API 与看板。

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `DASHBOARD_ENABLED` | `true` | 是否随容器启动看板 |
| `DASHBOARD_PORT` | `8300` | 看板监听端口(建议映射到 LAN) |
| `DASHBOARD_DATA_DIR` | `$SCRIPT_DIR/config/dashboard` | push-config.json / state.json 存放目录(config 卷内,持久化) |
| `API_PORT` | `3010` | 本容器 control API 端口(看板内部访问用) |
| `API_TOKEN` | - | control API Bearer token(由环境注入) |

## 端口与安全

- `8300` 看板 Web UI:**无鉴权**,仅限内网访问,不要暴露公网
- `3010` control API:带 token,建议只绑宿主回环(`127.0.0.1:3010:3010`)

## 数据迁移(自旧宿主机版)

旧版(宿主机 systemd + `/opt/docker/ms-rewards-dashboard`)的数据在:

```
/opt/docker/ms-rewards-dashboard/config/push-config.json   # 钉钉推送配置
/opt/docker/ms-rewards-dashboard/config/state.json         # 账号余额/今日获得/历史
```

复制到挂载卷的 `config/dashboard/` 下即可无缝继承(格式兼容,含 v2 一次性迁移)。
