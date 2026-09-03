#!/usr/bin/env node
/**
 * MS-Rewards 积分仪表盘(容器内嵌版) + 钉钉推送
 *
 * 与脚本同容器运行(entrypoint 在 API_MODE 下拉起本进程, 崩溃自动重启):
 *   - 消费本容器 control API (127.0.0.1:$API_PORT, Bearer token 由环境注入)
 *   - 订阅其 /events SSE, 按在线可配的事件开关推送钉钉
 *   - 自身提供 Web UI (:8300, 内网无鉴权): 账号积分总览 / 批量运行 / 推送配置弹窗 / 运行历史
 *   - 数据(push-config/state)落在 $DASHBOARD_DATA_DIR(默认 config/dashboard/), 随宿主卷持久化
 *
 * 零第三方依赖, 仅用 Node 内置模块。
 */
'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

// ============ 常量 ============
const BASE_DIR = __dirname;
// 数据目录: 容器内指向脚本 config/ 同卷子目录(持久化); 本地开发默认 dashboard/config
const CONFIG_DIR = process.env.DASHBOARD_DATA_DIR || path.join(BASE_DIR, 'config');
const PUSH_CONFIG_FILE = path.join(CONFIG_DIR, 'push-config.json');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');

const PORT = Number(process.env.DASHBOARD_PORT || 8300);
const API_PORT = Number(process.env.API_PORT || 3010);
const API_BASE = 'http://127.0.0.1:' + API_PORT;
const SSE_RECONNECT_MS = 5000;
const HISTORY_KEEP = 30; // dashboard 侧持久化的运行历史条数

// ============ 容器 API token(由容器环境注入) ============
let API_TOKEN = process.env.API_TOKEN || null;

// ============ 推送配置(在线可改) ============
function defaultPushConfig() {
  return {
    dingtalk: {
      enabled: true,
      accessToken: '',
      secret: '',
      keyword: 'MS-Rewards',
    },
    events: {
      runStart:     { enabled: true,  label: '🚀 开始运行' },
      runEnd:       { enabled: true,  label: '✅ 全部完成' },
      accountEnd:   { enabled: true,  label: '👤 账号完成' },
      error:        { enabled: true,  label: '❌ 错误' },
      loginFail:    { enabled: true,  label: '⚠️ 登录/风控异常' },
      dailySummary: { enabled: false, label: '📊 运行摘要' },
    },
    dedupSeconds: 10,
    updatedAt: null,
  };
}

let pushConfig = null;
function loadPushConfig() {
  try {
    pushConfig = JSON.parse(fs.readFileSync(PUSH_CONFIG_FILE, 'utf8'));
  } catch (e) {
    pushConfig = defaultPushConfig();
    savePushConfig();
  }
}
function savePushConfig() {
  pushConfig.updatedAt = new Date().toISOString();
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(PUSH_CONFIG_FILE, JSON.stringify(pushConfig, null, 2));
    return true;
  } catch (e) {
    log('ERROR', '保存推送配置失败: ' + e.message);
    return false;
  }
}

// ============ 运行状态缓存(state.json 持久化) ============
let state = { accounts: {}, runs: [] };
function loadState() {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {
    state = { accounts: {}, runs: [] };
  }
  if (!state.accounts) state.accounts = {};
  if (!state.runs) state.runs = [];
  // v2 一次性迁移: 旧格式 { collected, lastUpdateTs, success } → 新字段
  // (旧记录发生在今天才把 collected 计入今日获得; 迁移后删除旧字段, 保证只应用一次)
  if (state.v !== 2) {
    const t = todayStr();
    for (const em of Object.keys(state.accounts)) {
      const a = state.accounts[em];
      if (!a || typeof a !== 'object') continue;
      if (a.collected != null && a.lastUpdateTs) {
        const sameDay = new Date(a.lastUpdateTs + 8 * 3600e3).toISOString().slice(0, 10) === t;
        if (sameDay && !a.todayCollected) a.todayCollected = a.collected;
      }
      if (a.lastStatus == null && a.success != null) a.lastStatus = a.success ? 'success' : 'failed';
      delete a.collected;
      delete a.lastUpdateTs;
      delete a.success;
    }
    state.v = 2;
    saveState();
  }
}
function saveState() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) { /* ignore */ }
}

// 今日(以 Asia/Shanghai 日期为准)获得的积分按账号持久化, 打开页面即见, 无需等运行
function todayStr() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}
function ensureAccount(email) {
  let a = state.accounts[email];
  if (!a || typeof a !== 'object') a = state.accounts[email] = { email };
  if (a.todayDate !== todayStr()) { a.todayDate = todayStr(); a.todayCollected = 0; }
  return a;
}
// 日志消息中提取邮箱(去掉尾部标点, 如 "xxx@qq.com:")
function extractEmail(message, fallback) {
  const m = String(message || '').match(/(\S+@\S+)/);
  const em = String(m ? m[1] : (fallback || '')).replace(/[.:,;，。；]+$/, '');
  return em || null;
}

// ============ 日志 ============
function log(level, msg) {
  const line = `[${new Date().toLocaleString('zh-CN')}] [${level}] ${msg}`;
  console.log(line);
}

// ============ 钉钉发送 ============
function buildDingUrl(cfg) {
  let u = `https://oapi.dingtalk.com/robot/send?access_token=${cfg.accessToken}`;
  if (cfg.secret) {
    const ts = Date.now();
    const sign = crypto.createHmac('sha256', cfg.secret)
      .update(`${ts}\n${cfg.secret}`).digest('base64');
    u += `&timestamp=${ts}&sign=${encodeURIComponent(sign)}`;
  }
  return u;
}

function sendDingTalk(content) {
  if (!pushConfig.dingtalk.enabled || !pushConfig.dingtalk.accessToken) {
    return Promise.resolve({ ok: false, error: '钉钉未启用或缺少 accessToken' });
  }
  const data = JSON.stringify({
    msgtype: 'text',
    text: { content: content.slice(0, 1800) }, // 钉钉 text 上限 2000
  });
  const url = new URL(buildDingUrl(pushConfig.dingtalk));
  const opts = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    timeout: 10000,
  };
  return new Promise((resolve) => {
    const req = https.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        const ok = /"errcode":\s*0/.test(b);
        resolve({ ok, resp: b });
      });
    });
    req.on('error', (e) => resolve({ ok: false, resp: 'NETWORK_ERR: ' + e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, resp: 'TIMEOUT' }); });
    req.write(data);
    req.end();
  });
}

// ============ 推送去重 ============
const lastSentAt = {};
function shouldSend(key) {
  const now = Date.now();
  const dedup = (pushConfig.dedupSeconds || 10) * 1000;
  if (lastSentAt[key] && now - lastSentAt[key] < dedup) return false;
  lastSentAt[key] = now;
  return true;
}

// ============ 日志事件 → 推送 ============
// SSE log 事件: { id, ts, user, level, platform, title, message, ... } (title/message 按 logParser 结构)
function extractField(msg, re) {
  const m = String(msg || '').match(re);
  return m ? m[1] : null;
}

function pushForEntry(entry) {
  const ev = pushConfig.events || {};
  const title = (entry.title || '').toUpperCase();
  const level = (entry.level || '').toLowerCase();
  const message = String(entry.message || '');
  // 优先从消息中提取邮箱(日志里邮箱形如 xxx@yyy.com), 兜底用日志 user 字段
  const email = (message.match(/(\S+@\S+)/) || [])[1] || entry.user || '';

  let key = null;
  let lines = null;

  if (title === 'RUN-START' && ev.runStart.enabled) {
    key = 'runStart';
    lines = [`🚀 开始运行`, `微软积分脚本开始执行（账号数见日志）`];
  } else if (title === 'RUN-END' && ev.runEnd.enabled) {
    key = 'runEnd';
    const accounts = extractField(message, /(?:accountsProcessed|处理账户数)=(\d+)/);
    const gained = extractField(message, /(?:pointsGained|获得积分)=(-?\d+)/);
    const balance = extractField(message, /(?:currentBalance|现余额)=(\d+)/);
    const runtime = extractField(message, /(?:runtimeMinutes|运行分钟数)=([\d.]+)/);
    lines = [
      `✅ 全部完成`,
      `账号: ${accounts ?? '-'} | 本次获得: ${gained ?? '-'} 分`,
      `当前总余额: ${balance ?? '-'} | 耗时: ${runtime ?? '-'} 分钟`,
    ];
  } else if (title === 'ACCOUNT-END' && ev.accountEnd.enabled) {
    key = 'accountEnd';
    const gained = extractField(message, /(?:pointsGained|获得积分)=(-?\d+)/);
    const balance = extractField(message, /(?:currentBalance|现余额)=(\d+)/);
    lines = [`👤 账号完成`, `${email || '账号'}: 本次 +${gained ?? '-'} 分 | 余额 ${balance ?? '-'}`];
  } else if ((/ERROR/.test(title) || level === 'error') && ev.error.enabled) {
    key = 'error';
    lines = [`❌ 错误`, (email ? `账号 ${email}\n` : '') + message.slice(0, 300) || message.slice(0, 300)];
  } else if ((/LOGIN/.test(title) && /fail|失败|denied|error/i.test(message)) || /BOT-WARNING/.test(title)) {
    if (ev.loginFail.enabled) {
      key = 'loginFail';
      lines = [`⚠️ 登录/风控异常`, (email ? `账号 ${email}\n` : '') + message.slice(0, 300) || message.slice(0, 300)];
    }
  }

  if (key && lines && shouldSend(key)) {
    const kw = pushConfig.dingtalk.keyword || 'MS-Rewards';
    sendDingTalk(`[${kw}] ${lines.join('\n')}`).then((r) => {
      log('INFO', `${r.ok ? '✓' : '✗'} 推送 ${key} -> ${r.resp ? r.resp.slice(0, 100) : 'ok'}`);
    });
  }
}

// ============ 运行状态收集(从日志事件) ============
function recordEntry(entry) {
  const title = (entry.title || '').toUpperCase();
  const level = (entry.level || '').toLowerCase();
  const message = String(entry.message || '');

  if (title === 'ACCOUNT-END') {
    // 中英双语兼容: 上游英文版 "Completed account: x | pointsGained=.." / 中文化分支 "账户完成: x | 获得积分=.."
    const email = extractField(message, /(?:Completed account|账户完成)[:：]\s*(\S+)/) || extractEmail(message, entry.user) || '未知';
    const gained = parseInt(extractField(message, /(?:pointsGained|获得积分)=(-?\d+)/) || '0', 10);
    const balance = parseInt(extractField(message, /(?:currentBalance|现余额)=(\d+)/) || '0', 10);
    const a = ensureAccount(email);
    // 失败过的账号也保留上次已知余额, 仅在成功完成时刷新
    a.balance = balance;
    a.balanceTs = Date.now();
    a.todayCollected = (a.todayCollected || 0) + gained;
    a.lastStatus = 'success';
    a.lastError = null;
    a.lastRunTs = Date.now();
    if (state.currentRun) {
      state.currentRun.accounts.push({ email, gained, balance });
      state.currentRun.collected += gained;
    }
    saveState();
  } else if (title === 'ACCOUNT-START') {
    const email = extractField(message, /(?:Starting account|开始处理账户)[:：]\s*(\S+)/) || extractEmail(message, entry.user);
    if (email) {
      const a = ensureAccount(email);
      a.lastStatus = 'running';
      a.lastRunTs = Date.now();
      a.lastError = null;
      saveState();
    }
  } else if (title === 'RUN-START') {
    state.currentRun = { startedAt: Date.now(), accounts: [], collected: 0, finished: false };
    saveState();
  } else if (title === 'RUN-END') {
    // 收尾: 仍处于 running 的账号视为未完成(登录失败被跳过等), 保留其余额仅标记状态
    for (const em of Object.keys(state.accounts)) {
      const a = state.accounts[em];
      if (a && a.lastStatus === 'running') {
        a.lastStatus = 'failed';
        a.lastError = a.lastError || '运行结束但未收到该账号完成事件';
      }
    }
    if (state.currentRun) {
      state.currentRun.finished = true;
      state.currentRun.endedAt = Date.now();
      state.currentRun.totalCollected = parseInt(extractField(message, /(?:pointsGained|获得积分)=(-?\d+)/) || '0', 10);
      state.currentRun.totalBalance = parseInt(extractField(message, /(?:currentBalance|现余额)=(\d+)/) || '0', 10);
      state.runs.unshift({
        startedAt: state.currentRun.startedAt,
        endedAt: state.currentRun.endedAt,
        accounts: state.currentRun.accounts,
        collected: state.currentRun.collected,
        totalCollected: state.currentRun.totalCollected,
        totalBalance: state.currentRun.totalBalance,
      });
      if (state.runs.length > HISTORY_KEEP) state.runs.length = HISTORY_KEEP;
      state.currentRun = null;
    }
    saveState();
  } else if (level === 'error' || title.indexOf('ERROR') >= 0) {
    // 错误事件: 关联到具体账号则标记失败并记录原因(不动余额)
    if (title.indexOf('RUN') < 0) {
      const email = extractEmail(message, entry.user);
      if (email && email.indexOf('@') > 0) {
        const a = ensureAccount(email);
        a.lastStatus = 'failed';
        a.lastError = message.slice(0, 200);
        saveState();
      }
    }
  }
}

// ============ SSE 客户端(订阅容器 API /events) ============
function handleFrame(frame) {
  const lines = frame.split('\n');
  let event = null;
  const datas = [];
  for (const l of lines) {
    if (l.startsWith('event:')) event = l.slice(6).trim();
    else if (l.startsWith('data:')) datas.push(l.slice(5).trim());
    else if (l.startsWith('id:')) { /* ignore */ }
  }
  if (!datas.length) return;
  let data;
  try { data = JSON.parse(datas.join('\n')); } catch (e) { return; }

  if (event === 'log') {
    pushForEntry(data);
    recordEntry(data);
  } else if (event === 'hello') {
    log('INFO', 'SSE 连接成功(hello 快照收到)');
  } else if (event === 'status') {
    // 状态变化, 页面通过轮询 /points 反映, 此处无需处理
  }
}

function connectSSE() {
  if (!API_TOKEN) {
    log('WARN', '未读取到 API_TOKEN, 无法订阅容器事件, 10s 后重试');
    setTimeout(connectSSE, 10000);
    return;
  }
  const url = `${API_BASE}/events?token=${encodeURIComponent(API_TOKEN)}&replay=200`;
  const req = http.get(url, (res) => {
    if (res.statusCode !== 200) {
      res.resume();
      log('WARN', `SSE 连接返回 ${res.statusCode}, ${SSE_RECONNECT_MS}ms 后重连`);
      setTimeout(connectSSE, SSE_RECONNECT_MS);
      return;
    }
    log('INFO', 'SSE 已连接: ' + url.replace(/token=.*$/, 'token=***'));
    let buf = '';
    res.on('data', (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        handleFrame(frame);
      }
    });
    res.on('end', () => { log('WARN', 'SSE 连接断开, 重连中'); setTimeout(connectSSE, SSE_RECONNECT_MS); });
    res.on('error', () => { setTimeout(connectSSE, SSE_RECONNECT_MS); });
  });
  req.on('error', () => { setTimeout(connectSSE, SSE_RECONNECT_MS); });
  req.setTimeout(60000, () => { req.destroy(); });
}

// ============ 容器 API 代理 ============
function proxyContainerApi(reqPath, method, body, res) {
  if (!API_TOKEN) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '未配置 API_TOKEN' }));
    return;
  }
  const data = body ? JSON.stringify(body) : null;
  const options = {
    hostname: '127.0.0.1',
    port: API_PORT,
    path: reqPath,
    method: method || 'GET',
    headers: {
      Authorization: 'Bearer ' + API_TOKEN,
      Accept: 'application/json',
    },
    timeout: 60000, // start 可能长
  };
  if (data) {
    options.headers['Content-Type'] = 'application/json';
    options.headers['Content-Length'] = Buffer.byteLength(data);
  }
  const req = http.request(options, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => {
      try {
        res.writeHead(r.statusCode, { 'Content-Type': 'application/json' });
        res.end(b || '{}');
      } catch (e) { /* ignore */ }
    });
  });
  req.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '容器 API 不可达: ' + e.message }));
  });
  if (data) req.write(data);
  req.end();
}

// ============ 登录体检(无头会话检查 + 实时余额) ============
// 复用 scripts/main/loginCheck.js(与主脚本同一会话存取逻辑), 后台任务化并轮询结果
const PROJECT_ROOT = path.join(BASE_DIR, '..');
const LOGIN_CHECK_TIMEOUT_MS = 180000;
const loginCheckJobs = new Map(); // id -> job

function startLoginCheck(accountIndex, email) {
  for (const job of loginCheckJobs.values()) {
    if (job.status === 'running') return { error: '已有登录体检在进行中,请稍候', code: 'BUSY' };
  }
  const id = crypto.randomBytes(8).toString('hex');
  const job = { id, accountIndex, email, status: 'running', startedAt: Date.now(), result: null, logs: [] };
  loginCheckJobs.set(id, job);
  for (const key of loginCheckJobs.keys()) {
    if (loginCheckJobs.size > 6) loginCheckJobs.delete(key);
  }
  let buf = '';
  const onLine = (line) => {
    const t = line.trim();
    if (!t) return;
    job.logs.push(t);
    if (job.logs.length > 60) job.logs.shift();
    const m = t.match(/LOGINCHECK_RESULT (\{.*\})/);
    if (m) {
      try { job.result = JSON.parse(m[1]); } catch (e) { /* 忽略解析失败 */ }
    }
  };
  const child = spawn('node',
    [path.join(PROJECT_ROOT, 'scripts/main/loginCheck.js'), '--email', email, '--platform', 'both'],
    { cwd: PROJECT_ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const feed = (c) => {
    buf += c.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      onLine(buf.slice(0, idx));
      buf = buf.slice(idx + 1);
    }
  };
  child.stdout.on('data', feed);
  child.stderr.on('data', feed);
  const timer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch (e) { /* ignore */ }
    job.status = job.result ? 'done' : 'error';
    job.error = job.error || '体检超时';
  }, LOGIN_CHECK_TIMEOUT_MS);
  child.on('exit', (code) => {
    clearTimeout(timer);
    job.exitCode = code;
    job.finishedAt = Date.now();
    job.status = job.result ? 'done' : 'error';
    if (!job.result) job.error = job.error || ('进程退出 code=' + code);
    if (job.result) {
      // 体检结果直接落到账号状态(余额/体检时间), 前端刷新即可见
      try {
        const a = ensureAccount(job.result.email);
        if (job.result.balance != null) { a.balance = job.result.balance; a.balanceTs = Date.now(); }
        const first = Object.values(job.result.platforms || {})[0] || {};
        a.lastStatus = job.result.loggedIn ? 'success' : 'failed';
        a.lastError = job.result.loggedIn ? null : ('登录体检未通过: ' + (first.reason || 'unknown'));
        a.lastCheckTs = Date.now();
        saveState();
      } catch (e) { /* ignore */ }
    }
  });
  return { ok: true, id, email };
}

function loginCheckStatus() {
  const jobs = [...loginCheckJobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 6);
  return {
    jobs: jobs.map(j => ({
      id: j.id, accountIndex: j.accountIndex, email: j.email, status: j.status,
      startedAt: j.startedAt, finishedAt: j.finishedAt || null,
      error: j.error || null, result: j.result || null,
      lastLog: j.logs.length ? j.logs[j.logs.length - 1] : null,
    })),
    running: jobs.some(j => j.status === 'running'),
  };
}

// ============ 人工登录(Xvfb + x11vnc + websockify + 上游 manualLogin) ============
// 无头容器里拉起有头浏览器, 经 noVNC(带一次性 token 代理)让用户在内网页面里完成微软验证
const ML_DISPLAY = ':99';
const ML_VNC_PORT = 5999;
const ML_WS_PORT = 6080;
const ML_NOVNC_WEB = '/usr/share/novnc';
const ML_WATCHDOG_MS = 20 * 60 * 1000;
let manualLoginSession = null;

function mlPushLog(session, text) {
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    session.logs.push(t);
  }
  if (session.logs.length > 60) session.logs.splice(0, session.logs.length - 60);
}

function mlCleanupProcs(session) {
  for (const key of ['runner', 'websockify', 'x11vnc', 'xvfb']) {
    const p = session.procs[key];
    if (!p) continue;
    try { p.kill('SIGKILL'); } catch (e) { /* ignore */ }
    session.procs[key] = null;
  }
}

function mlStop(session, reason) {
  if (!session || session.stopped) return;
  session.stopped = true;
  session.stopReason = reason || null;
  clearTimeout(session.watchdog);
  try { session.procs.runner && session.procs.runner.kill('SIGTERM'); } catch (e) { /* ignore */ }
  setTimeout(() => mlCleanupProcs(session), 2500);
}

async function startManualLogin(accountIndex) {
  if (manualLoginSession && !manualLoginSession.done && !manualLoginSession.stopped) {
    return { error: '已有人工登录会话进行中(同一时间仅支持一个)', code: 'BUSY' };
  }
  const accs = await fetchJson('/accounts');
  const acc = (((accs || {}).accounts) || []).find(a => a.index === accountIndex);
  if (!acc) return { error: '未知账号序号: ' + accountIndex, code: 'BAD_REQUEST' };
  const email = acc.email;

  const procs = {};
  const session = manualLoginSession = {
    token: crypto.randomBytes(16).toString('hex'),
    accountIndex, email, startedAt: Date.now(),
    logs: [], procs, stopped: false, done: false,
  };
  // 上次会话若被强杀会残留 X 锁文件, 导致 Xvfb 起不来("Server is already active")
  for (const stale of ['/tmp/.X99-lock', '/tmp/.X11-unix/X99']) {
    try { fs.rmSync(stale, { force: true }); } catch (e) { /* ignore */ }
  }
  procs.xvfb = spawn('Xvfb', [ML_DISPLAY, '-screen', '0', '1280x900x24', '-nolisten', 'tcp'], { env: process.env });
  await new Promise(r => setTimeout(r, 1200));
  procs.x11vnc = spawn('x11vnc',
    ['-display', ML_DISPLAY, '-rfbport', String(ML_VNC_PORT), '-listen', '127.0.0.1', '-nopw', '-forever', '-shared', '-quiet'],
    { env: process.env });
  procs.websockify = spawn('websockify',
    ['--web', ML_NOVNC_WEB, '127.0.0.1:' + ML_WS_PORT, '127.0.0.1:' + ML_VNC_PORT],
    { env: process.env });
  procs.runner = spawn('node',
    [path.join(PROJECT_ROOT, 'scripts/main/manualLogin.js'), '--email', email, '--platform', 'both'],
    { cwd: PROJECT_ROOT, env: Object.assign({}, process.env, { DISPLAY: ML_DISPLAY }) });

  session.watchdog = setTimeout(() => {
    mlPushLog(session, '[dashboard] 会话超时(20 分钟), 自动结束');
    mlStop(session, 'timeout');
  }, ML_WATCHDOG_MS);
  for (const name of ['xvfb', 'x11vnc', 'websockify']) {
    procs[name].on('exit', (code) => mlPushLog(session, '[dashboard] ' + name + ' 退出 code=' + code));
  }
  const feed = (c) => mlPushLog(session, c.toString());
  procs.runner.stdout.on('data', feed);
  procs.runner.stderr.on('data', feed);
  procs.runner.on('exit', (code) => {
    session.done = true;
    session.runnerExit = code;
    mlPushLog(session, '[dashboard] manualLogin 退出 code=' + code + (code === 0 ? '(会话已保存)' : '(未保存完整登录)'));
    if (code !== 0) {
      // 找出 runner 的报错行, 透出到状态接口方便定位
      const errLine = [...session.logs].reverse().find(l => /ERROR|error|Failed|failed|doesn't exist|not found/i.test(l));
      session.failLog = errLine || session.logs[session.logs.length - 2] || null;
    }
    setTimeout(() => { mlCleanupProcs(session); }, 2000);
  });
  log('INFO', '人工登录会话启动: ' + email + ' (token=' + session.token.slice(0, 8) + '...)');
  return { ok: true, token: session.token, email };
}

function manualLoginStatus() {
  const s = manualLoginSession;
  if (!s) return { active: false };
  const active = !s.done && !s.stopped;
  return {
    active,
    done: s.done,
    stopped: s.stopped,
    email: s.email,
    startedAt: s.startedAt,
    token: active ? s.token : null,
    runnerExit: s.runnerExit != null ? s.runnerExit : null,
    failLog: s.failLog || null,
    lastLog: s.logs.length ? s.logs[s.logs.length - 1] : null,
  };
}

function handleNovncHttp(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const m = url.pathname.match(/^\/manual-vnc\/([0-9a-f]{32})(\/.*)?$/);
  if (!m || !manualLoginSession || manualLoginSession.token !== m[1] || manualLoginSession.stopped || manualLoginSession.done) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('无有效人工登录会话');
  }
  const suffix = (m[2] || '/vnc.html') + (url.search || '');
  const up = http.request(
    { hostname: '127.0.0.1', port: ML_WS_PORT, path: suffix, method: req.method, headers: Object.assign({}, req.headers, { host: '127.0.0.1:' + ML_WS_PORT }) },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => {
    try { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('noVNC 未就绪'); } catch (e) { /* ignore */ }
  });
  req.pipe(up);
}

function handleUpgrade(req, socket, head) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const m = url.pathname.match(/^\/manual-vnc\/([0-9a-f]{32})\/websockify$/);
    if (!m || !manualLoginSession || manualLoginSession.token !== m[1] || manualLoginSession.stopped || manualLoginSession.done) {
      socket.destroy();
      return;
    }
    const upstream = net.connect(ML_WS_PORT, '127.0.0.1', () => {
      const prefix = '/manual-vnc/' + m[1];
      const lines = [req.method + ' ' + url.pathname.slice(prefix.length) + ' HTTP/1.1'];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1]);
      socket.setTimeout(0);
      socket.setNoDelay(true);
      upstream.write(lines.join('\r\n') + '\r\n\r\n');
      if (head && head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  } catch (e) {
    try { socket.destroy(); } catch (e2) { /* ignore */ }
  }
}

// ============ 账号管理(动态账号, config/accounts.extra.json) ============
// 与 fork 的动态账号源同文件: 添加/删除后, 下一次运行(cron 或手动)自动生效, 无需重建容器
const EXTRA_ACCOUNTS_FILE = process.env.EXTRA_ACCOUNTS_FILE || path.join(CONFIG_DIR, '..', 'accounts.extra.json');

function readExtraFile() {
  try {
    if (!fs.existsSync(EXTRA_ACCOUNTS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(EXTRA_ACCOUNTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    log('ERROR', '读取动态账号文件失败: ' + e.message);
    return [];
  }
}

function writeExtraFile(list) {
  try {
    fs.writeFileSync(EXTRA_ACCOUNTS_FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
    try { fs.chmodSync(EXTRA_ACCOUNTS_FILE, 0o600); } catch (e) { /* ignore */ }
    return true;
  } catch (e) {
    log('ERROR', '写入动态账号文件失败: ' + e.message);
    return false;
  }
}

// ============ HTTP 服务(8300) ============
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
      if (b.length > 1024 * 1024) { req.destroy(); reject(new Error('body too large')); }
    });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname.replace(/\/+$/, '') || '/';

  try {
    // ---- API ----
    if (p === '/api/points') return proxyContainerApi('/points', 'GET', null, res);
    if (p === '/api/accounts') return proxyContainerApi('/accounts', 'GET', null, res);
    if (p === '/api/schedule') return proxyContainerApi('/schedule', 'GET', null, res);
    if (p === '/api/status') return proxyContainerApi('/status', 'GET', null, res);
    if (p === '/api/history') {
      // 合并容器 history 与 dashboard 自身持久化 runs
      const container = await new Promise((resolve) => {
        if (!API_TOKEN) return resolve(null);
        const req2 = http.get({ hostname: '127.0.0.1', port: API_PORT, path: '/history', headers: { Authorization: 'Bearer ' + API_TOKEN } }, (r) => {
          let b = '';
          r.on('data', (c) => (b += c));
          r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(null); } });
        });
        req2.on('error', () => resolve(null));
      });
      return json(res, 200, {
        dashboard: state.runs,
        container: container,
        containerInMemory: container ? container.inMemoryOnly : true,
      });
    }

    if (p === '/api/push-config' && req.method === 'GET') {
      return json(res, 200, pushConfig);
    }
    if (p === '/api/push-config' && req.method === 'PUT') {
      const body = await readBody(req);
      const merged = Object.assign(defaultPushConfig(), pushConfig, {
        dingtalk: Object.assign({}, pushConfig.dingtalk, body.dingtalk),
        events: Object.assign({}, pushConfig.events, body.events),
        dedupSeconds: body.dedupSeconds != null ? body.dedupSeconds : pushConfig.dedupSeconds,
      });
      pushConfig = merged;
      savePushConfig();
      return json(res, 200, { ok: true, config: pushConfig });
    }
    if (p === '/api/push-test' && req.method === 'POST') {
      const r = await sendDingTalk(`[${pushConfig.dingtalk.keyword || 'MS-Rewards'}] 🧪 测试推送\n仪表盘推送配置测试成功 ✅\n(${new Date().toLocaleString('zh-CN')})`);
      return json(res, 200, r);
    }
    if (p === '/api/start' && req.method === 'POST') {
      // body: {} = 全部账号 | { accountIndex: N } = 单账号 | { indexes: [..] } = 选中账号(转换为排除未选)
      let body = {};
      try { body = await readBody(req); } catch (e) { body = {}; }
      let payload = {};
      if (Array.isArray(body.indexes) && body.indexes.length) {
        const sel = [...new Set(body.indexes.map(Number))].filter(i => Number.isSafeInteger(i) && i >= 1);
        if (!sel.length) return json(res, 400, { error: 'indexes 无效' });
        const accs = await fetchJson('/accounts');
        const all = (((accs || {}).accounts) || []).map(a => a.index).sort((a, b) => a - b);
        if (!all.length) return json(res, 502, { error: '无法读取账号列表' });
        const unknown = sel.filter(i => !all.includes(i));
        if (unknown.length) return json(res, 400, { error: '未知账号序号: ' + unknown.join(',') });
        if (sel.length >= all.length) payload = {}; // 全选 = 全量
        else payload = { excludedAccountIndexes: all.filter(i => !sel.includes(i)) };
      } else {
        const idx = Number(body.accountIndex);
        if (Number.isSafeInteger(idx) && idx >= 1) payload = { accountIndex: idx };
      }
      return proxyContainerApi('/start', 'POST', payload, res);
    }
    if (p === '/api/stop' && req.method === 'POST') {
      return proxyContainerApi('/stop', 'POST', {}, res);
    }
    if (p === '/api/overview') {
      // 聚合概览: 一次返回前端所需的全部数据(账号/余额/今日获得/运行状态/调度/历史)
      // 容器 API 不可达时仍回退 state.json, 保证打开页面即可见上次已知数据
      const [points, accounts, schedule] = await Promise.all([
        fetchJson('/points'),
        fetchJson('/accounts'),
        fetchJson('/schedule'),
      ]);
      // 实时余额同步进 state(仅变化时写盘)
      let dirty = false;
      const liveAccounts = (points && points.accounts) || [];
      for (const la of liveAccounts) {
        if (!la.email || la.balance == null) continue;
        const a = ensureAccount(la.email);
        if (a.balance !== la.balance) { a.balance = la.balance; a.balanceTs = Date.now(); dirty = true; }
      }
      if (dirty) saveState();
      const mapStatus = (st, live, runningNow) => {
        if (runningNow) return 'running';
        if (st.lastStatus) return st.lastStatus;
        if (st.success === true) return 'success';
        if (st.success === false) return 'failed';
        if (live && live.done && live.success === true) return 'success';
        if (live && live.done && live.success === false) return 'failed';
        return 'pending';
      };
      const build = (index, email, st, live) => {
        st = st || {};
        live = live || {};
        const runningNow = !!(points && points.running && points.currentAccount === email);
        return {
          index: index,
          email: email,
          balance: st.balance != null ? st.balance : (live.balance != null ? live.balance : null),
          balanceTs: st.balanceTs || null,
          todayCollected: st.todayCollected || 0,
          liveCollected: (points && points.running && live.collected != null) ? live.collected : null,
          status: mapStatus(st, live, runningNow),
          lastError: st.lastError || live.error || null,
          lastRunTs: st.lastRunTs || null,
        };
      };
      let all;
      if (accounts && accounts.accounts && accounts.accounts.length) {
        all = accounts.accounts.map(acc => build(acc.index, acc.email, state.accounts[acc.email],
          liveAccounts.find(x => x.email === acc.email)));
      } else {
        // 容器 API 不可达: 用持久化 state 兜底
        all = Object.keys(state.accounts)
          .filter(em => em && em.indexOf('@') > 0)
          .map((em, i) => build(i + 1, em, state.accounts[em], null));
      }
      const summary = {
        count: all.length,
        totalBalance: all.reduce((s, a) => s + (a.balance || 0), 0),
        totalToday: all.reduce((s, a) => s + (a.todayCollected || 0), 0),
      };
      return json(res, 200, {
        today: todayStr(),
        serverTime: Date.now(),
        run: points ? {
          state: points.state, running: points.running,
          currentAccount: points.currentAccount, startedAt: points.startedAt,
          collected: points.collected, finished: points.finished,
          accountsTotal: points.accountsTotal,
        } : null,
        accounts: all,
        summary: summary,
        schedule: schedule,
        history: state.runs.slice(0, 10),
      });
    }

    if (p === '/api/login-check' && req.method === 'POST') {
      let body = {};
      try { body = await readBody(req); } catch (e) { body = {}; }
      const index = Number(body.accountIndex);
      if (!Number.isSafeInteger(index) || index < 1) return json(res, 400, { error: 'accountIndex 无效' });
      const accs = await fetchJson('/accounts');
      const acc = (((accs || {}).accounts) || []).find(a => a.index === index);
      if (!acc) return json(res, 400, { error: '未知账号序号: ' + index });
      const r = startLoginCheck(index, acc.email);
      if (r.error) return json(res, r.code === 'BUSY' ? 409 : 400, r);
      return json(res, 202, r);
    }
    if (p === '/api/login-check/status' && req.method === 'GET') {
      return json(res, 200, loginCheckStatus());
    }
    if (p === '/api/manual-login' && req.method === 'POST') {
      let body = {};
      try { body = await readBody(req); } catch (e) { body = {}; }
      const index = Number(body.accountIndex);
      if (!Number.isSafeInteger(index) || index < 1) return json(res, 400, { error: 'accountIndex 无效' });
      const r = await startManualLogin(index);
      if (r.error) return json(res, r.code === 'BUSY' ? 409 : 400, r);
      return json(res, 202, r);
    }
    if (p === '/api/manual-login/status' && req.method === 'GET') {
      return json(res, 200, manualLoginStatus());
    }
    if (p === '/api/manual-login/stop' && req.method === 'POST') {
      if (!manualLoginSession) return json(res, 409, { error: '无进行中的人工登录会话' });
      mlStop(manualLoginSession, 'user-stopped');
      return json(res, 202, { stopping: true });
    }
    if (p.startsWith('/manual-vnc/')) {
      return handleNovncHttp(req, res);
    }

    if (p === '/api/accounts-manage' && req.method === 'GET') {
      return json(res, 200, {
        accounts: readExtraFile().map(e => ({
          email: e.email,
          geoLocale: e.geoLocale || 'auto',
          hasPassword: Boolean(e.password),
          hasTotp: Boolean(e.totpSecret),
        })),
      });
    }
    if (p === '/api/accounts-manage' && req.method === 'POST') {
      let body = {};
      try { body = await readBody(req); } catch (e) { body = {}; }
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const geoLocale = String(body.geoLocale || 'gb').trim() || 'gb';
      const totpSecret = String(body.totpSecret || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: '邮箱格式不正确' });
      if (!password) return json(res, 400, { error: '密码不能为空' });
      const list = readExtraFile();
      if (list.some(e => String(e.email || '').toLowerCase() === email)) {
        return json(res, 409, { error: '该账号已在动态列表中' });
      }
      const accs = await fetchJson('/accounts');
      const envEmails = (((accs || {}).accounts) || []).map(a => String(a.email || '').toLowerCase());
      if (envEmails.includes(email)) return json(res, 409, { error: '该账号已作为固定账号(环境变量)配置' });
      list.push({ email, password, geoLocale, langCode: 'en', totpSecret });
      if (!writeExtraFile(list)) return json(res, 500, { error: '写入失败' });
      return json(res, 200, { ok: true, count: list.length });
    }
    if (p === '/api/accounts-manage/delete' && req.method === 'POST') {
      let body = {};
      try { body = await readBody(req); } catch (e) { body = {}; }
      const email = String(body.email || '').trim().toLowerCase();
      const list = readExtraFile();
      const next = list.filter(e => String(e.email || '').toLowerCase() !== email);
      if (next.length === list.length) return json(res, 404, { error: '未找到该动态账号' });
      if (!writeExtraFile(next)) return json(res, 500, { error: '写入失败' });
      return json(res, 200, { ok: true, count: next.length });
    }

    // ---- 前端页面 ----
    if (p === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(HTML);
    }
    if (p === '/favicon.ico') {
      res.writeHead(204); return res.end();
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

function fetchJson(apiPath) {
  return new Promise((resolve) => {
    if (!API_TOKEN) return resolve(null);
    const req = http.get(
      { hostname: '127.0.0.1', port: API_PORT, path: apiPath, headers: { Authorization: 'Bearer ' + API_TOKEN } },
      (r) => {
        let b = '';
        r.on('data', (c) => (b += c));
        r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(null); } });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); }); // 防容器 API 挂起导致页面永久"连接中"
  });
}

// ============ 前端页面 ============
// 注意: 本 HTML 位于反引号模板字符串内 —— 内联 JS 禁用反引号/模板插值/${ 与反斜杠转义(含正则与 \n),
// 否则会被模板字面量二次解释导致下发页面语法错误(曾因此整页 JS 失效)。
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MS-Rewards 积分看板</title>
<style>
  :root { --ms-blue:#0078d4; --bg:#f3f5f7; --card:#ffffff; --text:#242424; --muted:#8a8f98; --ok:#107c10; --err:#d13438; --warn:#d28b00; --border:#e3e6ea; --radius:12px; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; background:var(--bg); color:var(--text); }
  .wrap { max-width:1180px; margin:0 auto; padding:18px 16px 50px; }
  header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px; }
  header h1 { font-size:20px; margin:0; display:flex; align-items:center; gap:8px; }
  .logo { color:var(--ms-blue); }
  .status-pill { font-size:12px; padding:4px 10px; border-radius:20px; background:#e5f1fb; color:var(--ms-blue); white-space:nowrap; }
  .status-pill.running { background:#e6f4ea; color:var(--ok); }
  .status-pill.error { background:#fdecea; color:var(--err); }
  .toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .btn { border:0; border-radius:8px; padding:8px 16px; font-size:13px; cursor:pointer; background:var(--ms-blue); color:#fff; }
  .btn.secondary { background:#eef1f4; color:var(--text); }
  .btn.small { padding:5px 10px; font-size:12px; }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  .menu { position:relative; }
  .menu-drop { position:absolute; right:0; top:calc(100% + 6px); background:var(--card); border:1px solid var(--border); border-radius:10px; box-shadow:0 6px 24px rgba(0,0,0,.12); padding:8px; min-width:240px; z-index:50; display:none; }
  .menu-drop.show { display:block; }
  .menu-item { display:flex; width:100%; text-align:left; padding:8px 10px; border:0; background:none; border-radius:8px; font-size:13px; cursor:pointer; align-items:center; gap:8px; color:var(--text); }
  .menu-item:hover { background:#f0f4f8; }
  .menu-sep { border-top:1px solid var(--border); margin:6px 4px; }
  .menu-label { font-size:11px; color:var(--muted); padding:4px 10px 2px; }
  .iv-row { display:flex; gap:6px; padding:4px 8px 8px; flex-wrap:wrap; }
  .iv-btn { border:1px solid var(--border); background:#fff; border-radius:8px; padding:4px 10px; font-size:12px; cursor:pointer; color:var(--text); }
  .iv-btn.active { background:var(--ms-blue); color:#fff; border-color:var(--ms-blue); }
  .summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:12px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:12px 16px; }
  .sub { font-size:12px; color:var(--muted); }
  .card .num { font-size:22px; font-weight:700; margin-top:2px; font-variant-numeric:tabular-nums; }
  .selbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:8px 14px; margin-bottom:10px; font-size:13px; }
  .selbar .grow { flex:1; }
  .tblwrap { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); overflow:auto; max-height:58vh; }
  table.acc { width:100%; min-width:780px; border-collapse:collapse; font-size:13px; }
  table.acc th { position:sticky; top:0; background:#f8fafb; z-index:1; text-align:left; padding:9px 10px; border-bottom:1px solid var(--border); color:var(--muted); font-weight:500; white-space:nowrap; }
  table.acc td { padding:8px 10px; border-bottom:1px solid #eef1f3; vertical-align:middle; }
  table.acc tr:hover td { background:#f6f9fc; }
  table.acc td.num, table.acc th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  td.em { font-weight:600; word-break:break-all; min-width:180px; }
  .ts { font-size:11px; color:var(--muted); font-weight:400; margin-top:1px; }
  .badge { display:inline-block; font-size:11px; padding:2px 8px; border-radius:10px; background:#f0f2f4; color:var(--muted); white-space:nowrap; }
  .badge.ok { background:#e6f4ea; color:var(--ok); }
  .badge.err { background:#fdecea; color:var(--err); }
  .badge.run { background:#fff4e0; color:var(--warn); }
  .errtxt { color:var(--err); font-size:12px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .hint { font-size:12px; color:var(--muted); margin-top:8px; line-height:1.6; }
  .msg { padding:10px 14px; border-radius:8px; margin:10px 0; font-size:13px; display:none; }
  .msg.show { display:block; }
  .msg.err { background:#fdecea; color:var(--err); }
  input[type=checkbox] { width:16px; height:16px; cursor:pointer; }
  input[type=text], input[type=password] { width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:8px; font-size:14px; margin-top:4px; }
  .field { margin-bottom:12px; }
  .field label { font-size:13px; color:var(--muted); }
  .switch-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); }
  .switch-row:last-child { border-bottom:0; }
  .switch { position:relative; width:42px; height:24px; flex-shrink:0; }
  .switch input { opacity:0; width:0; height:0; }
  .slider { position:absolute; inset:0; background:#ccc; border-radius:24px; transition:.2s; cursor:pointer; }
  .slider:before { content:""; position:absolute; width:18px; height:18px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.2s; }
  .switch input:checked + .slider { background:var(--ok); }
  .switch input:checked + .slider:before { transform:translateX(18px); }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:10px 18px; }
  @media (max-width:640px) { .grid-2 { grid-template-columns:1fr; } }
  dialog { border:1px solid var(--border); border-radius:var(--radius); padding:20px; width:min(680px, 94vw); max-height:88vh; overflow:auto; }
  dialog::backdrop { background:rgba(0,0,0,.35); }
  dialog h2 { margin:0 0 14px; font-size:16px; }
  dialog#mlModal { width:min(980px, 97vw); }
  .rowact { white-space:nowrap; }
  .rowact .btn { padding:3px 8px; font-size:12px; }
  .btn.danger { background:var(--err); color:#fff; }
  .pw-row { display:flex; align-items:center; gap:8px; }
  .eye { border:0; background:#eef1f4; border-radius:8px; cursor:pointer; padding:8px 10px; font-size:14px; margin-top:4px; }
  details.history { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:12px 16px; margin-top:14px; }
  details.history summary { cursor:pointer; font-size:14px; font-weight:600; }
  table.hist { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:10px; }
  table.hist th, table.hist td { text-align:left; padding:6px 8px; border-bottom:1px solid #eef1f3; white-space:nowrap; }
  table.hist th { color:var(--muted); font-weight:500; }
  .foot { color:var(--muted); font-size:12px; text-align:center; margin-top:26px; }
  .empty { color:var(--muted); padding:18px; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><span class="logo">🅱️</span> MS-Rewards 积分看板</h1>
    <div class="toolbar">
      <span id="conn" class="status-pill">连接中…</span>
      <span id="runState" class="status-pill">空闲</span>
      <button class="btn secondary" id="btnStop" onclick="doStop()">⏹ 停止</button>
      <div class="menu">
        <button class="btn secondary" onclick="toggleMenu(event)">⚙ 菜单</button>
        <div class="menu-drop" id="menuDrop">
          <button class="menu-item" onclick="openAccounts(); closeMenu()">👥 账号管理（动态添加）</button>
          <button class="menu-item" onclick="openPush(); closeMenu()">🔔 通知设置（钉钉推送）</button>
          <button class="menu-item" onclick="manualRefresh(); closeMenu()">⟳ 立即刷新</button>
          <div class="menu-sep"></div>
          <div class="menu-label">自动刷新间隔（当前 <span id="ivCur">15 秒</span>）</div>
          <div class="iv-row">
            <button class="iv-btn" data-ms="0" onclick="setRefresh(0)">关闭</button>
            <button class="iv-btn" data-ms="5000" onclick="setRefresh(5000)">5 秒</button>
            <button class="iv-btn" data-ms="15000" onclick="setRefresh(15000)">15 秒</button>
            <button class="iv-btn" data-ms="30000" onclick="setRefresh(30000)">30 秒</button>
            <button class="iv-btn" data-ms="60000" onclick="setRefresh(60000)">60 秒</button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <div id="diag" class="msg err"></div>

  <div class="summary">
    <div class="card"><div class="sub">账号总数</div><div class="num" id="sumAccounts">-</div></div>
    <div class="card"><div class="sub">总余额（上次已知）</div><div class="num" id="sumBalance">-</div></div>
    <div class="card"><div class="sub">今日获得（<span id="todayLabel">-</span>）</div><div class="num" style="color:var(--ok)" id="sumToday">-</div></div>
    <div class="card"><div class="sub">当前运行</div><div class="num" id="runInfo" style="font-size:14px;line-height:1.55;font-weight:600">-</div></div>
  </div>

  <div class="selbar">
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="selAll" onchange="toggleAll(this.checked)"> 全选</label>
    <span id="selInfo" class="sub">未选择账号时默认运行全部</span>
    <div class="grow"></div>
    <button class="btn small secondary" onclick="selectVisible(false)">清空选择</button>
    <button class="btn" id="btnRun" onclick="doRun()">▶ 运行</button>
  </div>

  <div class="tblwrap">
    <table class="acc">
      <thead><tr>
        <th style="width:34px"></th>
        <th style="width:36px">#</th>
        <th>账号</th>
        <th class="num">余额</th>
        <th class="num">今日获得</th>
        <th style="width:76px">状态</th>
        <th style="width:112px">最近活动</th>
        <th>备注 / 错误</th>
        <th style="width:84px">操作</th>
      </tr></thead>
      <tbody id="accRows"><tr><td colspan="9" class="empty">加载中…</td></tr></tbody>
    </table>
  </div>
  <div class="hint">余额为脚本最近一次成功运行时的已知值，打开页面即可见、无需等待运行；「今日获得」按天累计、跨天自动归零。勾选账号后点「运行」只跑选中的账号；不勾选则跑全部。</div>

  <details class="history">
    <summary>📜 运行历史（最近 10 次）与调度</summary>
    <div id="scheduleBox" class="hint" style="margin:8px 0"></div>
    <table class="hist">
      <thead><tr><th>开始</th><th>结束</th><th>账号明细</th><th class="num">本次获得</th><th class="num">总余额</th></tr></thead>
      <tbody id="histRows"><tr><td colspan="5" class="empty">暂无运行记录</td></tr></tbody>
    </table>
  </details>

  <dialog id="pushModal">
    <h2>🔔 推送设置（钉钉）</h2>
    <div class="grid-2">
      <div>
        <div class="field"><label>钉钉 access_token</label><div class="pw-row"><input type="password" id="ddToken" placeholder="钉钉机器人 token"><button type="button" class="eye" onclick="togglePass('ddToken',this)">👁</button></div></div>
        <div class="field"><label>加签 SECRET（无则留空）</label><div class="pw-row"><input type="password" id="ddSecret" placeholder="SEC…"><button type="button" class="eye" onclick="togglePass('ddSecret',this)">👁</button></div></div>
        <div class="field"><label>自定义关键词（消息前缀）</label><input type="text" id="ddKeyword" placeholder="MS-Rewards"></div>
        <div class="field"><label>同类事件去重（秒）</label><input type="text" id="ddDedup" placeholder="10"></div>
        <div class="switch-row"><span>钉钉推送总开关</span><label class="switch"><input type="checkbox" id="ddEnabled"><span class="slider"></span></label></div>
      </div>
      <div>
        <div class="switch-row"><span>🚀 开始运行</span><label class="switch"><input type="checkbox" id="ev-runStart"><span class="slider"></span></label></div>
        <div class="switch-row"><span>✅ 全部完成</span><label class="switch"><input type="checkbox" id="ev-runEnd"><span class="slider"></span></label></div>
        <div class="switch-row"><span>👤 账号完成</span><label class="switch"><input type="checkbox" id="ev-accountEnd"><span class="slider"></span></label></div>
        <div class="switch-row"><span>❌ 错误</span><label class="switch"><input type="checkbox" id="ev-error"><span class="slider"></span></label></div>
        <div class="switch-row"><span>⚠️ 登录/风控异常</span><label class="switch"><input type="checkbox" id="ev-loginFail"><span class="slider"></span></label></div>
        <div class="switch-row"><span>📊 运行摘要（每日）</span><label class="switch"><input type="checkbox" id="ev-dailySummary"><span class="slider"></span></label></div>
      </div>
    </div>
    <div class="hint">钉钉安全设置：自定义关键词需与机器人配置一致，或使用加签模式（填 SECRET）。修改后点「保存」即时生效，无需重启服务。</div>
    <div class="toolbar" style="margin-top:14px">
      <button class="btn" onclick="savePush()">💾 保存</button>
      <button class="btn secondary" onclick="testPush()">🧪 测试推送</button>
      <button class="btn secondary" onclick="closePush()">关闭</button>
      <span id="pushMsg" class="sub"></span>
    </div>
  </dialog>

  <dialog id="mlModal">
    <h2>🔑 人工登录 <span id="mlEmail" style="color:var(--ms-blue)"></span></h2>
    <div class="hint">容器内浏览器已打开(先移动端、后桌面端, 依次完成)。在下方窗口完成微软登录;停留在 Rewards 页面 5 秒会自动保存会话并进入下一平台, 两个平台都完成后自动结束。关闭本弹窗会中止会话(已保存的平台不受影响)。</div>
    <iframe id="mlFrame" style="width:100%;height:540px;border:1px solid var(--border);border-radius:8px;background:#111"></iframe>
    <div class="sub" id="mlStatus" style="margin-top:8px"></div>
    <div class="toolbar" style="margin-top:10px">
      <button class="btn" onclick="mlClose()">关闭并中止</button>
    </div>
  </dialog>

  <dialog id="acctModal">
    <h2>👥 账号管理</h2>
    <div class="hint">动态账号保存在 config 卷的 accounts.extra.json 中，添加/删除后<b>下一次运行自动生效</b>（每日定时或手动触发均可），无需重启容器。固定账号（来自 .env 环境变量）仅可查看。新增账号首次运行需要自动登录；若遇到微软身份验证卡点，可在表格对应行点 🔑 人工登录完成。</div>
    <table class="hist" style="margin-bottom:14px">
      <thead><tr><th>账号</th><th>来源</th><th>地区</th><th>2FA</th><th style="width:70px">操作</th></tr></thead>
      <tbody id="acctRows"><tr><td colspan="5" class="empty">加载中…</td></tr></tbody>
    </table>
    <div class="grid-2">
      <div>
        <div class="field"><label>邮箱</label><input type="text" id="naEmail" placeholder="user@example.com"></div>
        <div class="field"><label>密码</label><div class="pw-row"><input type="password" id="naPass" placeholder="微软账号密码"><button type="button" class="eye" onclick="togglePass('naPass',this)">👁</button></div></div>
        <div class="field"><label>地区（搜索词源相关，默认 gb 与现有账号一致）</label>
          <select id="naGeo" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px">
            <option value="gb" selected>gb（英国）</option><option value="us">us（美国）</option><option value="auto">auto（自动）</option><option value="de">de</option><option value="fr">fr</option><option value="jp">jp</option><option value="ca">ca</option><option value="au">au</option>
          </select>
        </div>
        <div class="field"><label>2FA 密钥（无则留空）</label><input type="text" id="naTotp" placeholder="可选"></div>
      </div>
      <div class="hint" style="padding-top:6px">
        说明：<br>· 动态账号与 .env 固定账号在运行、体检、人工登录中完全等价；<br>· 序号从 901 起编（批量勾选运行时可见）；<br>· 凭据明文存放于 config 卷（600 权限），请勿暴露该目录；<br>· 删除动态账号不会清除其已保存的登录会话，如需彻底清理请用容器 API 的 DELETE /sessions/:邮箱。
      </div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="btn" onclick="addAccount()">➕ 添加账号</button>
      <button class="btn secondary" onclick="closeAccounts()">关闭</button>
      <span id="acctMsg" class="sub"></span>
    </div>
  </dialog>

  <div class="foot">数据来源: microsoft-rewards-script 容器 API · <span id="footRefresh">每 15 秒自动刷新</span> · ms-rewards-dashboard</div>
</div>
<script>
'use strict';
var API = { overview:'/api/overview', pushConfig:'/api/push-config', pushTest:'/api/push-test', start:'/api/start', stop:'/api/stop', loginCheck:'/api/login-check', loginCheckStatus:'/api/login-check/status', manualLogin:'/api/manual-login', manualLoginStatus:'/api/manual-login/status', manualLoginStop:'/api/manual-login/stop', accountsManage:'/api/accounts-manage' };
var selected = {};
var selectionReady = false; // 首次拿到账号列表时默认全选, 之后尊重用户的选择
var accountsCache = [];
var runCache = null;

// ---- 自动刷新间隔(可调, 存 localStorage) ----
var refreshMs = 15000;
var refreshTimer = null;
try {
  var savedMs = parseInt(localStorage.getItem('msrRefreshMs'), 10);
  if (savedMs === 0 || savedMs >= 5000) refreshMs = savedMs;
} catch (e) { /* localStorage 不可用时用默认值 */ }
function scheduleNext() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (refreshMs > 0) refreshTimer = setTimeout(scheduleRefresh, refreshMs);
}
function setRefresh(ms) {
  refreshMs = ms;
  try { localStorage.setItem('msrRefreshMs', String(ms)); } catch (e) { /* ignore */ }
  updateIvUi();
  scheduleNext();
}
function updateIvUi() {
  var btns = document.querySelectorAll('.iv-btn');
  for (var i = 0; i < btns.length; i++) {
    var v = parseInt(btns[i].getAttribute('data-ms'), 10);
    btns[i].className = 'iv-btn' + (v === refreshMs ? ' active' : '');
  }
  $('ivCur').textContent = refreshMs > 0 ? ((refreshMs / 1000) + ' 秒') : '已关闭';
  $('footRefresh').textContent = refreshMs > 0 ? ('每 ' + (refreshMs / 1000) + ' 秒自动刷新') : '自动刷新已关闭';
}
function manualRefresh() { scheduleRefresh(); }
function toggleMenu(ev) { ev.stopPropagation(); $('menuDrop').classList.toggle('show'); updateIvUi(); }
function closeMenu() { $('menuDrop').classList.remove('show'); }

function $(id) { return document.getElementById(id); }

function apiFetch(url, opts, timeoutMs) {
  opts = opts || {};
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 6000);
  if (ctrl) opts.signal = ctrl.signal;
  return fetch(url, opts).then(function (r) {
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }, function (e) { clearTimeout(timer); throw e; });
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function fmtTs(ts) {
  if (!ts) return '-';
  var d = new Date(ts);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function fmtAgo(ts, now) {
  if (!ts) return '';
  var d = (now || Date.now()) - ts;
  if (d < 0) d = 0;
  if (d < 60000) return Math.max(1, Math.floor(d / 1000)) + ' 秒前';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
  if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
  return Math.floor(d / 86400000) + ' 天前';
}
function fmtNum(n) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('zh-CN');
}

function badge(status, liveRunning) {
  if (liveRunning) return '<span class="badge run">运行中</span>';
  if (status === 'success') return '<span class="badge ok">完成</span>';
  if (status === 'failed') return '<span class="badge err">失败</span>';
  if (status === 'running') return '<span class="badge run">运行中</span>';
  return '<span class="badge">待运行</span>';
}

function renderOverview(d) {
  var now = d.serverTime || Date.now();
  var run = d.run || {};
  var sum = d.summary || {};
  accountsCache = d.accounts || [];
  runCache = run;
  if (!selectionReady && accountsCache.length) {
    for (var si = 0; si < accountsCache.length; si++) selected[accountsCache[si].index] = true;
    selectionReady = true;
  }

  var running = run.running === true;
  var conn = $('conn');
  conn.textContent = '已连接';
  conn.className = 'status-pill';
  var rs = $('runState');
  rs.textContent = running ? '运行中' : '空闲';
  rs.className = 'status-pill ' + (running ? 'running' : '');

  $('sumAccounts').textContent = (sum.count != null ? sum.count : accountsCache.length) + ' 个';
  $('sumBalance').textContent = fmtNum(sum.totalBalance);
  $('sumToday').textContent = '+' + fmtNum(sum.totalToday);
  $('todayLabel').textContent = d.today || '';

  var ri = $('runInfo');
  if (running) {
    ri.innerHTML = '正在跑: ' + esc(run.currentAccount || '-') + '<br>本次已获得 +' + fmtNum(run.collected);
  } else if (run.collected != null) {
    ri.innerHTML = '上次运行 +' + fmtNum(run.collected) + '<br><span class="sub">' + (run.startedAt ? fmtTs(run.startedAt) : '') + '</span>';
  } else {
    ri.textContent = '空闲';
  }

  renderAccounts(now);
  renderSchedule(d.schedule);
  renderHistory(d.history || []);
  updateSelUi();
}

function renderAccounts(now) {
  var box = $('accRows');
  if (!accountsCache.length) { box.innerHTML = '<tr><td colspan="9" class="empty">暂无账号数据</td></tr>'; return; }
  var html = '';
  for (var i = 0; i < accountsCache.length; i++) {
    var a = accountsCache[i];
    var liveRunning = !!(runCache && runCache.running && runCache.currentAccount === a.email);
    var isRunning = liveRunning || a.status === 'running';
    var checked = selected[a.index] ? ' checked' : '';
    var bal = (a.balance != null) ? fmtNum(a.balance) : '—';
    var balTs = a.balanceTs ? '<div class="ts">' + fmtAgo(a.balanceTs, now) + '更新</div>' : '';
    var today = '+' + fmtNum(a.todayCollected || 0);
    var live = (a.liveCollected != null && isRunning) ? '<div class="ts">本次 +' + fmtNum(a.liveCollected) + '</div>' : '';
    var act = a.lastRunTs ? fmtTs(a.lastRunTs) + '<div class="ts">' + fmtAgo(a.lastRunTs, now) + '</div>' : '-';
    var err = a.lastError ? '<div class="errtxt" title="' + esc(a.lastError) + '">' + esc(a.lastError) + '</div>' : '';
    html += '<tr>'
      + '<td><input type="checkbox"' + checked + ' onchange="toggleSel(' + a.index + ', this.checked)"></td>'
      + '<td>' + a.index + '</td>'
      + '<td class="em">' + esc(a.email) + (a.extra ? ' <span class="badge run">动态</span>' : '') + '</td>'
      + '<td class="num">' + bal + balTs + '</td>'
      + '<td class="num" style="color:var(--ok)">' + today + live + '</td>'
      + '<td>' + badge(a.status, liveRunning) + '</td>'
      + '<td style="font-size:12px">' + act + '</td>'
      + '<td>' + err + '</td>'
      + '<td class="rowact">'
      + '<button class="btn small secondary" title="登录体检: 无头检查会话并刷新实时余额(约 30-60 秒)" onclick="doCheck(' + a.index + ')">🩺</button> '
      + '<button class="btn small secondary" title="人工登录: 在容器内浏览器完成微软验证, 自动保存会话" onclick="doManualLogin(' + a.index + ')">🔑</button>'
      + checkNote(a)
      + '</td>'
      + '</tr>';
  }
  box.innerHTML = html;
}

function renderSchedule(sch) {
  if (!sch) { $('scheduleBox').textContent = '调度: 无法读取'; return; }
  $('scheduleBox').innerHTML = '调度: cron <b>' + esc(sch.cron || '-') + '</b> · 启用: ' + (sch.enabled ? '是' : '否')
    + ' · 时区: ' + esc(sch.timezone || '-')
    + (sch.skipIfRunning ? ' · 运行中跳过' : '');
}

function renderHistory(runs) {
  var box = $('histRows');
  if (!runs.length) { box.innerHTML = '<tr><td colspan="5" class="empty">暂无运行记录</td></tr>'; return; }
  var html = '';
  for (var i = 0; i < runs.length; i++) {
    var r = runs[i];
    var detail = '-';
    if (r.accounts && r.accounts.length) {
      var parts = [];
      for (var j = 0; j < r.accounts.length; j++) parts.push(esc(r.accounts[j].email) + ' +' + fmtNum(r.accounts[j].gained));
      detail = parts.join('；');
    }
    html += '<tr><td>' + fmtTs(r.startedAt) + '</td><td>' + (r.endedAt ? fmtTs(r.endedAt) : '-') + '</td>'
      + '<td style="white-space:normal;min-width:220px">' + detail + '</td>'
      + '<td class="num">+' + fmtNum(r.collected) + '</td><td class="num">' + fmtNum(r.totalBalance) + '</td></tr>';
  }
  box.innerHTML = html;
}

function toggleSel(idx, on) { if (on) selected[idx] = true; else delete selected[idx]; updateSelUi(); }
function toggleAll(on) { selectVisible(on); }
function selectVisible(on) {
  selected = {};
  if (on) { for (var i = 0; i < accountsCache.length; i++) selected[accountsCache[i].index] = true; }
  renderAccounts(Date.now());
  updateSelUi();
}
function selCount() { var n = 0; for (var k in selected) if (selected[k]) n++; return n; }
function updateSelUi() {
  var n = selCount();
  var total = accountsCache.length;
  var btn = $('btnRun');
  if (total === 0) { btn.disabled = true; btn.textContent = '▶ 运行'; }
  else {
    btn.disabled = false;
    btn.textContent = n > 0 ? ('▶ 运行选中(' + n + ')') : ('▶ 运行全部(' + total + ')');
  }
  $('selInfo').textContent = n > 0 ? ('已选 ' + n + ' / ' + total + ' 个账号') : '未选择账号时默认运行全部';
  var sa = $('selAll');
  sa.checked = total > 0 && n === total;
  sa.indeterminate = n > 0 && n < total;
}

function doRun() {
  var n = selCount();
  var idxs = [];
  for (var k in selected) if (selected[k]) idxs.push(Number(k));
  idxs.sort(function (a, b) { return a - b; });
  var label = n > 0 ? ('选中的 ' + n + ' 个账号（序号 ' + idxs.join(', ') + '）') : ('全部 ' + accountsCache.length + ' 个账号');
  if (!confirm('确认立即运行积分任务？将运行：' + label + '。约 30-60 分钟，可能触发风控，请谨慎。')) return;
  var body = n > 0 ? JSON.stringify({ indexes: idxs }) : '{}';
  fetch(API.start, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.error) { alert('触发失败: ' + d.error); return; }
      var what = '全部账号';
      if (d && d.selectedAccount && d.selectedAccount.email) what = '单账号: ' + d.selectedAccount.email;
      else if (d && d.excludedAccounts && d.excludedAccounts.length) what = '已选 ' + (accountsCache.length - d.excludedAccounts.length) + ' 个账号';
      alert('已触发运行: ' + what);
      scheduleRefresh();
    })
    .catch(function (e) { alert('触发失败: ' + e.message); });
}

function doStop() {
  if (!confirm('确认停止当前运行？')) return;
  fetch(API.stop, { method: 'POST' })
    .then(function (r) { return r.json(); })
    .then(function (d) { alert('已发送停止'); scheduleRefresh(); })
    .catch(function (e) { alert('停止失败: ' + e.message); });
}

// ---- 推送设置(弹窗) ----
function openPush() {
  apiFetch(API.pushConfig, null, 8000).then(loadPushForm).catch(function () { loadPushForm(null); });
  var dlg = $('pushModal');
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}
function closePush() {
  var dlg = $('pushModal');
  if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
}
function loadPushForm(c) {
  c = c || {};
  var dd = c.dingtalk || {};
  var ev = c.events || {};
  $('ddToken').value = dd.accessToken || '';
  $('ddSecret').value = dd.secret || '';
  $('ddKeyword').value = dd.keyword || 'MS-Rewards';
  $('ddDedup').value = c.dedupSeconds != null ? c.dedupSeconds : 10;
  $('ddEnabled').checked = dd.enabled !== false;
  $('ev-runStart').checked = !(ev.runStart && ev.runStart.enabled === false);
  $('ev-runEnd').checked = !(ev.runEnd && ev.runEnd.enabled === false);
  $('ev-accountEnd').checked = !(ev.accountEnd && ev.accountEnd.enabled === false);
  $('ev-error').checked = !(ev.error && ev.error.enabled === false);
  $('ev-loginFail').checked = !(ev.loginFail && ev.loginFail.enabled === false);
  $('ev-dailySummary').checked = !!(ev.dailySummary && ev.dailySummary.enabled === true);
  showPushMsg('', true);
}
function showPushMsg(txt, ok) { var el = $('pushMsg'); el.textContent = txt; el.style.color = ok ? 'var(--ok)' : 'var(--err)'; }
function collectPush() {
  return {
    dingtalk: {
      enabled: $('ddEnabled').checked,
      accessToken: $('ddToken').value.trim(),
      secret: $('ddSecret').value.trim(),
      keyword: $('ddKeyword').value.trim() || 'MS-Rewards',
    },
    events: {
      runStart: { enabled: $('ev-runStart').checked },
      runEnd: { enabled: $('ev-runEnd').checked },
      accountEnd: { enabled: $('ev-accountEnd').checked },
      error: { enabled: $('ev-error').checked },
      loginFail: { enabled: $('ev-loginFail').checked },
      dailySummary: { enabled: $('ev-dailySummary').checked },
    },
    dedupSeconds: parseInt($('ddDedup').value, 10) || 10,
  };
}
function savePush() {
  fetch(API.pushConfig, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collectPush()) })
    .then(function (r) { return r.json(); })
    .then(function (d) { showPushMsg(d.ok ? '✅ 已保存，即时生效' : '保存失败', !!d.ok); })
    .catch(function (e) { showPushMsg('保存失败: ' + e.message, false); });
}
function testPush() {
  showPushMsg('发送中…', true);
  fetch(API.pushTest, { method: 'POST' })
    .then(function (r) { return r.json(); })
    .then(function (d) { showPushMsg(d.ok ? '✅ 测试推送已发送，请查收钉钉' : ('测试失败: ' + String(d.error || d.resp || '').slice(0, 120)), !!d.ok); })
    .catch(function (e) { showPushMsg('测试失败: ' + e.message, false); });
}
function togglePass(id, btn) {
  var el = $(id);
  if (el.type === 'password') { el.type = 'text'; btn.textContent = '🙈'; }
  else { el.type = 'password'; btn.textContent = '👁'; }
}

// ---- 登录体检 / 人工登录 ----
var checkJobs = {};
var checkPollTimer = null;
function checkNote(a) {
  var j = checkJobs[a.index];
  if (!j) return '';
  if (j.status === 'running') return '<div class="ts" style="color:var(--warn)">🩺 体检中…</div>';
  if (j.status === 'error') return '<div class="ts" style="color:var(--err)">🩺 ' + esc(j.error || '失败') + '</div>';
  var r = j.result;
  if (r && r.loggedIn) return '<div class="ts" style="color:var(--ok)">🩺 正常' + (r.balance != null ? ' · ' + fmtNum(r.balance) + ' 分' : '') + '</div>';
  return '<div class="ts" style="color:var(--err)">🩺 未登录</div>';
}
function doCheck(index) {
  var email = '#' + index;
  for (var i = 0; i < accountsCache.length; i++) if (accountsCache[i].index === index) email = accountsCache[i].email;
  if (!confirm('对 ' + email + ' 做登录体检?将无头访问一次 Rewards 刷新实时余额, 约 30-60 秒。')) return;
  fetch(API.loginCheck, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountIndex: index }) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.error) { alert(d.error); return; }
      ensureCheckPoll();
      scheduleRefresh();
    })
    .catch(function (e) { alert('触发失败: ' + e.message); });
}
function ensureCheckPoll() {
  if (checkPollTimer) return;
  checkPollTimer = setInterval(function () {
    fetch(API.loginCheckStatus).then(function (r) { return r.json(); }).then(function (d) {
      checkJobs = {};
      (d.jobs || []).forEach(function (j) {
        if (!checkJobs[j.accountIndex] || checkJobs[j.accountIndex].startedAt < j.startedAt) checkJobs[j.accountIndex] = j;
      });
      renderAccounts(Date.now());
      if (!d.running && checkPollTimer) {
        clearInterval(checkPollTimer);
        checkPollTimer = null;
        scheduleRefresh();
      }
    }).catch(function () {});
  }, 3000);
}

var mlPollTimer = null;
function doManualLogin(index) {
  var email = '#' + index;
  for (var i = 0; i < accountsCache.length; i++) if (accountsCache[i].index === index) email = accountsCache[i].email;
  if (!confirm('为 ' + email + ' 打开人工登录窗口?将在容器内依次打开移动端/桌面端浏览器, 完成微软登录并停留在 Rewards 页面 5 秒后自动保存。')) return;
  fetch(API.manualLogin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountIndex: index }) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.error) { alert(d.error); return; }
      $('mlEmail').textContent = d.email;
      $('mlFrame').src = '/manual-vnc/' + d.token + '/vnc.html?path=' + encodeURIComponent('manual-vnc/' + d.token + '/websockify') + '&autoconnect=true&resize=scale';
      var dlg = $('mlModal');
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      ensureMlPoll();
    })
    .catch(function (e) { alert('触发失败: ' + e.message); });
}
function ensureMlPoll() {
  if (mlPollTimer) return;
  mlPollTimer = setInterval(function () {
    fetch(API.manualLoginStatus).then(function (r) { return r.json(); }).then(function (d) {
      $('mlStatus').textContent = d.active ? (d.lastLog || '容器内浏览器启动中…') : '';
      if (!d.active) {
        clearInterval(mlPollTimer);
        mlPollTimer = null;
        if (d.done && d.runnerExit === 0) $('mlStatus').textContent = '✅ 人工登录完成, 会话已保存';
        else if (d.stopped) $('mlStatus').textContent = '会话已中止(未保存完整登录)';
        else if (d.failLog) $('mlStatus').textContent = '❌ ' + d.failLog;
        $('mlFrame').src = 'about:blank';
        scheduleRefresh();
      }
    }).catch(function () {});
  }, 2500);
}
function mlClose() {
  var dlg = $('mlModal');
  if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
}

// ---- 账号管理(动态添加) ----
function openAccounts() {
  apiFetch(API.accountsManage, null, 8000).then(function (d) { renderAcctManage(d || {}); }).catch(function () { renderAcctManage({}); });
  apiFetch(API.overview).then(function (d) { renderOverview(d); }).catch(function () {});
  var dlg = $('acctModal');
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}
function closeAccounts() {
  var dlg = $('acctModal');
  if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
  scheduleRefresh();
}
function showAcctMsg(txt, ok) { var el = $('acctMsg'); el.textContent = txt; el.style.color = ok ? 'var(--ok)' : 'var(--err)'; }
var acctManageList = [];
function renderAcctManage(d) {
  var box = $('acctRows');
  var fileAccounts = d.accounts || [];
  acctManageList = fileAccounts.slice();
  var all = accountsCache.slice();
  for (var i = 0; i < fileAccounts.length; i++) {
    var fa = fileAccounts[i];
    var exists = false;
    for (var j = 0; j < all.length; j++) if (all[j].email && all[j].email.toLowerCase() === fa.email.toLowerCase()) exists = true;
    if (!exists) all.push({ index: 901 + i, email: fa.email, geoLocale: fa.geoLocale, hasTotp: fa.hasTotp, extra: true, fresh: true });
  }
  if (!all.length) { box.innerHTML = '<tr><td colspan="5" class="empty">暂无账号</td></tr>'; return; }
  var html = '';
  for (var k = 0; k < all.length; k++) {
    var a = all[k];
    var src = a.extra ? '<span class="badge run">动态</span>' : '<span class="badge">固定</span>';
    var del = a.extra ? '<button class="btn small danger" onclick="delAccount(' + a.index + ')">删除</button>' : '';
    var totp = a.hasTotp ? '是' : '-';
    var geo = a.geoLocale || '-';
    html += '<tr><td>' + esc(a.email) + (a.fresh ? ' <span class="badge err">未运行过</span>' : '') + '</td><td>' + src + '</td><td>' + esc(geo) + '</td><td>' + totp + '</td><td>' + del + '</td></tr>';
  }
  box.innerHTML = html;
}
function addAccount() {
  var email = $('naEmail').value.trim();
  var password = $('naPass').value;
  if (!email || !password) { showAcctMsg('请填写邮箱和密码', false); return; }
  fetch(API.accountsManage, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: password, geoLocale: $('naGeo').value, totpSecret: $('naTotp').value.trim() }) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.error) { showAcctMsg(d.error, false); return; }
      showAcctMsg('✅ 已添加，下一次运行自动生效', true);
      $('naEmail').value = ''; $('naPass').value = ''; $('naTotp').value = '';
      openAccounts();
    })
    .catch(function (e) { showAcctMsg('添加失败: ' + e.message, false); });
}
function delAccount(index) {
  var entry = acctManageList[index - 901];
  var email = entry ? entry.email : '#' + index;
  if (!confirm('删除动态账号 ' + email + '？下一次运行起不再执行该账号。')) return;
  fetch(API.accountsManage + '/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.error) { showAcctMsg(d.error, false); return; }
      showAcctMsg('✅ 已删除', true);
      openAccounts();
    })
    .catch(function (e) { showAcctMsg('删除失败: ' + e.message, false); });
}

function showDiag() {
  var b = $('diag');
  b.className = 'msg show err';
  b.textContent = '无法连接仪表盘 API。常见原因: 浏览器开了代理/Clash 且未放行内网 192.168.100.10；异地(ZeroTier)访问请用 http://192.168.192.10:8300。可用右上角「⚙ 菜单 → 立即刷新」重试。';
}
function hideDiag() { $('diag').className = 'msg'; }

function scheduleRefresh() {
  apiFetch(API.overview).then(function (d) {
    renderOverview(d);
    hideDiag();
    scheduleNext();
  }).catch(function () {
    $('conn').textContent = refreshMs > 0 ? '连接失败，5 秒后重试' : '连接失败';
    $('conn').className = 'status-pill error';
    showDiag();
    if (refreshMs > 0) refreshTimer = setTimeout(scheduleRefresh, 5000);
  });
}
document.addEventListener('click', function (e) {
  var drop = $('menuDrop');
  if (!drop || !drop.classList.contains('show')) return;
  var m = document.querySelector('.menu');
  if (m && !m.contains(e.target)) closeMenu();
});
(function () {
  var dlg = $('mlModal');
  if (!dlg) return;
  dlg.addEventListener('close', function () {
    if (mlPollTimer) { clearInterval(mlPollTimer); mlPollTimer = null; }
    $('mlFrame').src = 'about:blank';
    fetch(API.manualLoginStop, { method: 'POST' }).catch(function () {});
    scheduleRefresh();
  });
})();
updateIvUi();
scheduleRefresh();
</script>
</body>
</html>`;

// ============ 启动 ============
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
loadPushConfig();
loadState();
log('INFO', 'MS-Rewards dashboard 启动, 端口 ' + PORT + ' (内网无鉴权)');
log('INFO', '容器 API: ' + API_BASE + (API_TOKEN ? ' (token 已加载)' : ' (⚠ 未读取到 token)'));

server.on('upgrade', handleUpgrade);

server.listen(PORT, '0.0.0.0', () => {
  log('INFO', 'HTTP 监听 0.0.0.0:' + PORT);
  connectSSE();
});
