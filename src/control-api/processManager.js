import { loadRunHistory, saveRunHistory } from './history.js'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'

import { parseLogLine, severityRank } from './logs/parse.js'
import { resolveLogColor } from '../logging/LogStyle.js'
import { createRunState, summarizeRunState } from './logs/state.js'
import { applyLogToRunState } from './logs/apply.js'
import { sanitizeLogMessage, formatLogLine } from '../../scripts/lib/logging.cjs'
import { ENV_OVERRIDES } from '../config/ConfigEnvOverrides.js'
import { resolveSessionOptions, sessionPlatforms } from '../session/SessionGeneration.js'

const IS_WIN = process.platform === 'win32'

const BLOCKED_ENV = new Set([
    'NODE_OPTIONS',
    'NODE_PATH',
    'LD_PRELOAD',
    'DYLD_INSERT_LIBRARIES',
    'ELECTRON_RUN_AS_NODE'
])
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const RESERVED_ENV_KEYS = new Set(['__PROTO__', 'PROTOTYPE', 'CONSTRUCTOR'])
const CONFIG_ENV_KEYS = new Set(ENV_OVERRIDES.map(entry => entry.env))
const ACCOUNT_ENV_RE =
    /^ACCOUNT_[1-9][0-9]*_(?:EMAIL|PASSWORD|TOTP_SECRET|RECOVERY_EMAIL|GEO_LOCALE|LANG_CODE|PROXY_(?:URL|PORT|USERNAME|PASSWORD|HTTP|AXIOS)|SAVE_FINGERPRINT_(?:MOBILE|DESKTOP))$/

export class ProcessManager extends EventEmitter {
    /** @param {{ command: string, cwd: string, args?: string[], sessionCommand?: { command: string, args: string[] } | null, stopTimeoutMs?: number, logBufferSize?: number, historySize?: number, name?: string, version?: string }} options */
    constructor({
        command,
        args = [],
        sessionCommand = null,
        cwd,
        stopTimeoutMs = 15000,
        logBufferSize = 2000,
        historySize = 20,
        name = 'microsoft-rewards-script',
        version = '0.0.0'
    }) {
        super()
        this.setMaxListeners(100)

        this.command = command
        this.defaultArgs = args
        this.sessionCommand = sessionCommand
        this.cwd = cwd
        this.stopTimeoutMs = stopTimeoutMs
        this.logBufferSize = logBufferSize
        this.historySize = historySize
        this.name = name
        this.version = version

        this.state = 'idle' // idle | starting | running | stopping
        this.child = null
        this.pid = null
        this.startedAt = null
        this.runId = null
        this.lastExit = null
        this.currentArgs = args
        this.currentCommand = command

        this.runState = createRunState()
        this.logBuffer = []
        this.logSeq = 0
        this.historyPath = path.join(cwd, 'config', 'run-history.json')
        this.history = loadRunHistory(this.historyPath, historySize, message => this._controllerLog('warn', message))

        this._stdoutBuf = ''
        this._stderrBuf = ''
        this._decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }
        this._killTimer = null
        this._finalized = false
        this._restarting = false
        this._shuttingDown = false
    }

    start(overrides = {}) {
        this._assertCanStart()
        if (this._restarting)
            throw Object.assign(new Error('Cannot start: a restart is in progress.'), { code: 'ALREADY_RUNNING' })
        return this._start(overrides)
    }

    startSessions({ accounts, platform, fresh, env }) {
        this._assertCanStart()
        if (this._restarting)
            throw Object.assign(new Error('Cannot start: a restart is in progress.'), { code: 'ALREADY_RUNNING' })
        if (!this.sessionCommand) {
            throw Object.assign(new Error('Session runner is unavailable; run npm run build and restart the API.'), {
                code: 'SESSION_RUNNER_UNAVAILABLE'
            })
        }
        const options = resolveSessionOptions({ platform, fresh })
        const platforms = sessionPlatforms(options.platform)
        const args = [
            ...this.sessionCommand.args,
            '--platform',
            options.platform,
            ...(options.fresh ? [] : ['--reuse'])
        ]
        return this._start(
            { env },
            {
                command: this.sessionCommand.command,
                args,
                sessions: {
                    fresh: options.fresh,
                    platforms,
                    accounts,
                    steps: accounts.flatMap(account =>
                        platforms.map(platform => ({
                            email: account.email,
                            platform,
                            status: 'pending',
                            startedAt: null,
                            endedAt: null,
                            error: null
                        }))
                    )
                }
            }
        )
    }

    /** @param {{args?: unknown, env?: unknown}} overrides @param {{command: string, args: string[], sessions: import('../session/SessionGeneration.js').SessionGenerationProgress} | null} sessionJob */
    _start(overrides, sessionJob = null) {
        this._assertCanStart()
        if (this.state !== 'idle')
            throw Object.assign(new Error(`Cannot start: a run is already ${this.state}.`), { code: 'ALREADY_RUNNING' })

        const args = sessionJob?.args ?? this._resolveArgs(overrides.args)
        const env = this._resolveEnv(overrides.env)
        const command = sessionJob?.command ?? this.command

        this.runId = env.REWARDS_RUN_ID
        this.state = 'starting'
        this.runState = createRunState(this.runId)
        this.runState.operation = sessionJob ? 'session-regeneration' : 'rewards'
        this.runState.sessionGeneration = sessionJob?.sessions ?? null
        if (sessionJob) this.runState.accountsTotal = sessionJob.sessions.accounts.length
        this.startedAt = new Date().toISOString()
        this.lastExit = null
        this.currentArgs = args
        this.currentCommand = command
        this._stdoutBuf = ''
        this._stderrBuf = ''
        this._finalized = false
        this._decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }

        this._controllerLog(
            'info',
            `Starting ${sessionJob ? 'session regeneration' : 'run'}: ${command} ${args.join(' ')}`.trim()
        )

        let child
        try {
            child = spawn(command, args, {
                cwd: this.cwd,
                env,
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
                detached: !IS_WIN, // own process group on POSIX so we can signal the whole tree
                windowsHide: true
            })
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            this._controllerLog('error', `Failed to spawn: ${msg}`)
            this._finalize(null, null, msg)
            throw error
        }

        const runId = this.runId
        const isCurrent = () => this.child === child && this.runId === runId
        this.child = child
        this.pid = child.pid ?? null

        child.stdout?.on('data', d => {
            if (isCurrent()) this._ingest('stdout', d)
        })
        child.stderr?.on('data', d => {
            if (isCurrent()) this._ingest('stderr', d)
        })

        child.once('spawn', () => {
            if (!isCurrent()) return
            if (this.state === 'starting') this.state = 'running'
            this._controllerLog('info', `Run started (pid ${this.pid}).`)
            this._emitStatus('running')
        })

        child.once('error', error => {
            if (!isCurrent()) return
            const msg = error instanceof Error ? error.message : String(error)
            this._controllerLog('error', `Process error: ${msg}`)
            this._finalize(null, null, msg)
        })

        child.once('close', (code, signal) => {
            if (isCurrent()) this._finalize(code, signal)
        })

        return {
            runId: this.runId,
            pid: this.pid,
            startedAt: this.startedAt,
            operation: this.runState.operation,
            command,
            args
        }
    }

    /** @param {{force?: boolean, runId?: unknown}} options */
    stop({ force = false, runId } = {}) {
        if (this.state === 'idle') {
            throw Object.assign(new Error('Cannot stop: no run is in progress.'), { code: 'NOT_RUNNING' })
        }

        if (runId !== undefined && runId !== this.runId) {
            throw Object.assign(new Error('Cannot stop: the requested run is no longer active.'), {
                code: 'RUN_CHANGED'
            })
        }

        const wasStopping = this.state === 'stopping'
        this.state = 'stopping'
        if (wasStopping && force) {
            this._controllerLog('warn', 'Force-stopping run (SIGKILL)…')
            this._killTree('SIGKILL')
        }
        if (!wasStopping) {
            this._controllerLog('warn', force ? 'Force-stopping run (SIGKILL)…' : 'Stopping run (SIGTERM)…')
            this._emitStatus('stopping')
            this._killTree(force ? 'SIGKILL' : 'SIGTERM')

            this._killTimer = setTimeout(() => {
                if (this.state !== 'idle') {
                    this._controllerLog('warn', `Did not exit within ${this.stopTimeoutMs}ms - sending SIGKILL.`)
                    this._killTree('SIGKILL')
                }
            }, this.stopTimeoutMs)
            if (typeof this._killTimer.unref === 'function') this._killTimer.unref()
        }

        return new Promise(resolve => {
            let settled = false
            const done = () => {
                if (settled) return
                settled = true
                clearTimeout(safety)
                this.removeListener('exit', done)
                resolve(this.lastExit)
            }
            this.once('exit', done)
            const safety = setTimeout(done, this.stopTimeoutMs + 5000)
            if (typeof safety.unref === 'function') safety.unref()
        })
    }

    async restart(overrides = {}) {
        this._assertCanStart()
        if (this._restarting)
            throw Object.assign(new Error('A restart is already in progress.'), { code: 'ALREADY_RUNNING' })
        this._resolveArgs(overrides.args)
        this._resolveEnv(overrides.env)
        this._restarting = true
        try {
            if (this.state !== 'idle') await this.stop({ force: Boolean(overrides.force) })
            return this._start(overrides)
        } finally {
            this._restarting = false
        }
    }

    getStatus() {
        return {
            name: this.name,
            version: this.version,
            state: this.state,
            shuttingDown: this._shuttingDown,
            runId: this.state === 'idle' ? null : this.runId,
            pid: this.pid,
            startedAt: this.state === 'idle' ? null : this.startedAt,
            operation: this.state === 'idle' ? (this.lastExit?.operation ?? null) : this.runState.operation,
            command: `${this.currentCommand} ${this.currentArgs.join(' ')}`.trim(),
            lastExit: this.lastExit,
            logCount: this.logBuffer.length,
            logBufferSize: this.logBufferSize,
            latestLogId: this.logSeq,
            run: summarizeRunState(this.runState)
        }
    }

    getPoints() {
        const run = summarizeRunState(this.runState)
        const accounts = run.accounts.map(a => ({
            email: a.email,
            level: a.level ?? null,
            pointsProgress: a.pointsProgress ?? null,
            pointsRemaining: a.pointsRemaining ?? null,
            lifetimeEarn: a.lifetimeEarn ?? null,
            accountUpdatedAt: a.accountUpdatedAt ?? null,
            resetAt: a.resetAt ?? null,
            resetAtSource: a.resetAtSource ?? null,
            collected: a.pointsKnown === false ? null : (a.collectedPoints ?? a.live.gained),
            pointsKnown: a.pointsKnown !== false,
            balance: a.live.balance ?? a.finalPoints ?? null,
            initialPoints: a.initialPoints,
            bySource: a.live.bySource,
            earnable: a.earnable,
            searchSummary: a.searchSummary ?? null,
            appQuotaState: a.appQuotaState ?? null,
            streaks: a.streaks ?? [],
            punchCards: a.punchCards ?? [],
            streakProtection: a.streakProtection,
            edgeBrowsing: a.edgeBrowsing,
            status: a.status ?? 'running',
            done: a.endedAt != null,
            success: a.success,
            error: a.error,
            completion: a.completion
        }))

        return {
            state: this.state,
            operation: run.operation,
            runId: this.state === 'idle' ? null : this.runId,
            running: this.state !== 'idle',
            live: this.state === 'running' || this.state === 'starting',
            startedAt: this.state === 'idle' ? null : this.startedAt,
            currentAccount: run.live.currentAccount,
            balance: run.live.currentBalance,
            collected: run.collected,
            pointsKnown: run.pointsKnown,
            completion: run.completion,
            updatedAt: run.live.updatedAt,
            finished: run.finished,
            totals: run.totals,
            accountsTotal: run.accountsTotal,
            accountsSeen: run.accountsSeen,
            accounts,
            lastExit: this.lastExit
        }
    }

    /** @param {{limit?: number | null, afterId?: number | null, minLevel?: string | null}} options */
    getLogs({ limit = 200, afterId = null, minLevel = null } = {}) {
        let logs = this.logBuffer
        if (afterId != null) logs = logs.filter(e => e.id > afterId)
        if (minLevel) {
            const floor = severityRank(minLevel)
            logs = logs.filter(e => severityRank(e.level) >= floor)
        }
        if (limit != null && logs.length > limit) {
            logs = afterId == null ? logs.slice(-limit) : logs.slice(0, limit)
        }
        return { logs, latestLogId: this.logSeq, count: logs.length }
    }

    getErrors({ limit = 100, includeWarnings = true } = {}) {
        const floor = severityRank(includeWarnings ? 'warn' : 'error')
        let errors = this.logBuffer.filter(e => severityRank(e.level) >= floor)
        if (limit != null && errors.length > limit) errors = errors.slice(errors.length - limit)
        const accountErrors = this.runState.order
            .map(email => this.runState.accounts[email])
            .filter(a => a.error)
            .map(a => ({ email: a.email, error: a.error }))
        return { errors, accountErrors, count: errors.length }
    }

    getHistory() {
        return this.history
    }

    note(level, message) {
        this._controllerLog(level, message)
    }

    dockerLog(line) {
        const safeLine = sanitizeLogMessage(line)
        const parsed = parseLogLine(safeLine, 'docker')
        if (parsed.parsed) {
            this._appendLog({ ...parsed, consoleAllowed: false })
            return
        }
        const level = /\bERROR\b/i.test(safeLine) ? 'error' : /\bWARN(?:ING)?\b/i.test(safeLine) ? 'warn' : 'info'
        this._appendLog({
            ts: new Date().toISOString(),
            level,
            user: 'docker',
            platform: 'MAIN',
            title: 'DOCKER',
            message: safeLine,
            source: 'docker',
            parsed: false,
            raw: safeLine,
            consoleAllowed: false
        })
    }

    beginShutdown() {
        this._shuttingDown = true
    }

    _assertCanStart() {
        if (this._shuttingDown) {
            throw Object.assign(new Error('Cannot start: the control API is shutting down.'), {
                code: 'SHUTTING_DOWN'
            })
        }
    }

    validateOverrides(overrides = {}) {
        this._resolveArgs(overrides.args)
        return this._resolveEnv(overrides.env)
    }

    _resolveArgs(argsOverride) {
        if (argsOverride == null) return this.defaultArgs
        if (!Array.isArray(argsOverride) || !argsOverride.every(a => typeof a === 'string')) {
            throw Object.assign(new Error('`args` must be an array of strings.'), { code: 'BAD_REQUEST' })
        }
        if (argsOverride.some(arg => !['-dev'].includes(arg))) {
            throw Object.assign(new Error('Only the -dev bot argument is accepted; executable arguments are fixed.'), {
                code: 'BAD_REQUEST'
            })
        }
        return [...this.defaultArgs, ...argsOverride]
    }

    _resolveEnv(envOverride) {
        const env = {
            ...process.env,
            FORCE_COLOR: '0',
            NO_COLOR: '1',
            REWARDS_CONTROL_EVENTS: '1',
            REWARDS_RUN_ID: randomUUID()
        }
        if (envOverride != null) {
            if (typeof envOverride !== 'object' || Array.isArray(envOverride)) {
                throw Object.assign(new Error('`env` must be a JSON object.'), { code: 'BAD_REQUEST' })
            }

            for (const [key, value] of Object.entries(envOverride)) {
                if (!ENV_KEY_RE.test(key) || RESERVED_ENV_KEYS.has(key.toUpperCase())) {
                    throw Object.assign(new Error(`Invalid environment variable name: ${JSON.stringify(key)}.`), {
                        code: 'BAD_REQUEST'
                    })
                }
                if (BLOCKED_ENV.has(key.toUpperCase()) || (!CONFIG_ENV_KEYS.has(key) && !ACCOUNT_ENV_RE.test(key))) {
                    throw Object.assign(new Error('Environment override is not allowed: ' + key), {
                        code: 'BAD_REQUEST'
                    })
                }
                if (value == null) continue
                if (!['string', 'number', 'boolean'].includes(typeof value)) {
                    throw Object.assign(
                        new Error(`Environment override ${key} must be a string, number, boolean, or null.`),
                        { code: 'BAD_REQUEST' }
                    )
                }
                env[key] = String(value)
            }
        }
        return env
    }

    _ingest(source, chunk) {
        const bufKey = source === 'stderr' ? '_stderrBuf' : '_stdoutBuf'
        this[bufKey] += this._decoders[source].write(chunk)

        let idx
        while ((idx = this[bufKey].indexOf('\n')) !== -1) {
            const line = this[bufKey].slice(0, idx).replace(/\r$/, '')
            this[bufKey] = this[bufKey].slice(idx + 1)
            this._handleLine(source, line.slice(0, 65536))
        }
        if (this[bufKey].length > 65536) {
            this._handleLine(source, this[bufKey].slice(0, 65536) + ' [truncated]')
            this[bufKey] = ''
        }
    }

    _flushPartial() {
        for (const key of ['_stdoutBuf', '_stderrBuf']) {
            const source = key === '_stderrBuf' ? 'stderr' : 'stdout'
            const rest = this[key] + this._decoders[source].end()
            if (rest && rest.trim()) {
                this._handleLine(source, rest.replace(/\r$/, ''))
            }
            this[key] = ''
        }
    }

    _handleLine(source, rawLine) {
        if (rawLine === '') return
        const entry = parseLogLine(rawLine, source)
        this._appendLog(entry)
        if (entry.runId && entry.runId !== this.runId) return
        if (
            entry.level === 'error' &&
            ['MAIN-ERROR', 'UNCAUGHT-EXCEPTION', 'UNHANDLED-REJECTION', 'CLUSTER-WORKER-ERROR'].includes(entry.title)
        ) {
            this.runState.executionError = entry.message
        }
        const milestone = applyLogToRunState(this.runState, entry)
        if (milestone) this._emitStatus(milestone)
    }

    _appendLog(entry) {
        entry.color = resolveLogColor(entry.level, entry.data, entry.color)
        entry.id = ++this.logSeq
        entry.receivedAt = new Date().toISOString()
        this.logBuffer.push(entry)
        if (this.logBuffer.length > this.logBufferSize) this.logBuffer.shift()
        this.emit('log', entry)
    }

    _controllerLog(level, message) {
        message = sanitizeLogMessage(message)
        const ts = new Date().toISOString()
        this._appendLog({
            ts,
            level,
            user: 'API',
            platform: 'MAIN',
            title: 'CONTROLLER',
            message,
            source: 'controller',
            parsed: false,
            raw: formatLogLine({ ts, user: 'API', level, platform: 'MAIN', title: 'CONTROLLER', message })
        })
    }

    _emitStatus(reason) {
        this.emit('status', { reason, ...this.getStatus() })
    }

    _killTree(signal) {
        if (!this.child || this.pid == null) return
        try {
            if (IS_WIN && signal === 'SIGTERM' && this.child.connected) {
                this.child.send({ __control: 'stop' }, () => {})
            } else if (IS_WIN) {
                const child = this.child
                const taskkill = spawn('taskkill', ['/pid', String(this.pid), '/T', '/F'], { windowsHide: true })
                taskkill.once('error', error => {
                    this._controllerLog('warn', `Could not terminate process tree: ${error.message}`)
                    child.kill(signal)
                })
            } else {
                try {
                    process.kill(-this.pid, signal)
                } catch {
                    this.child.kill(signal)
                }
            }
        } catch {
            // Ignore
        }
    }

    /** @param {number | null} code @param {NodeJS.Signals | null} signal @param {string | null} errorMessage */
    _finalize(code, signal, errorMessage = null) {
        if (this._finalized) return
        this._finalized = true

        if (this._killTimer) {
            clearTimeout(this._killTimer)
            this._killTimer = null
        }

        this._flushPartial()
        errorMessage ??= this.runState.executionError

        const endedAt = new Date().toISOString()
        const cancelled =
            this.state === 'stopping' || signal === 'SIGTERM' || signal === 'SIGINT' || code === 130 || code === 143
        const failed = code !== 0 || errorMessage != null
        const accounts = this.runState.order.map(email => this.runState.accounts[email])
        const expectedAccounts = this.runState.accountsTotal ?? this.runState.totals?.accountsProcessed
        let incomplete = expectedAccounts == null ? !accounts.length : accounts.length < expectedAccounts
        for (const account of accounts) {
            if (!account.endedAt) {
                incomplete = true
                account.success = false
                account.status = cancelled ? 'cancelled' : 'failed'
                account.endedAt = endedAt
                account.pointsKnown = false
                account.collectedPoints = null
                account.finalPoints = null
                account.error ??=
                    errorMessage ??
                    (cancelled
                        ? 'Run cancelled before final account verification'
                        : 'Run exited before final account verification')
            }
        }
        if (incomplete && this.runState.totals) {
            this.runState.totals.pointsKnown = false
            this.runState.totals.collected = null
        }
        const reachedRunEnd = this.runState.runEnded && this.runState.terminalStatus !== 'interrupted'
        const legacyPartialExit = code === 1 && reachedRunEnd && this.runState.terminalStatus === 'partial'
        const executionComplete =
            !cancelled &&
            !signal &&
            errorMessage == null &&
            reachedRunEnd &&
            !incomplete &&
            (code === 0 || legacyPartialExit)
        const rewardStatus = cancelled
            ? 'cancelled'
            : errorMessage != null && !accounts.length && !this.runState.runEnded
              ? 'failed'
              : !executionComplete
                ? 'interrupted'
                : this.runState.terminalStatus === 'partial' || accounts.some(account => account.success === false)
                  ? 'partial'
                  : 'completed'
        const sessionsIncomplete = this.runState.sessionGeneration?.steps.some(step =>
            ['pending', 'running'].includes(step.status)
        )
        const status = this.runState.sessionGeneration
            ? this._finalizeSessions(endedAt, cancelled, failed, errorMessage)
            : rewardStatus
        this.runState.finished = true
        this.runState.executionComplete = this.runState.sessionGeneration
            ? !cancelled && !signal && errorMessage == null && !sessionsIncomplete
            : executionComplete
        this.runState.pendingDelay = null
        this.runState.terminalStatus = status
        this.lastExit = {
            runId: this.runId,
            operation: this.runState.operation,
            code: code ?? null,
            signal: signal ?? null,
            at: endedAt,
            status,
            executionComplete: this.runState.executionComplete
        }
        if (errorMessage) this.lastExit.error = errorMessage
        else if (status === 'interrupted') {
            this.lastExit.error = incomplete
                ? 'Run exited before all accounts had final results'
                : 'Run exited without a completed RUN-END record'
        }

        const label =
            errorMessage != null
                ? `error: ${errorMessage}`
                : `code ${code ?? 'n/a'}${signal ? ` / signal ${signal}` : ''}`
        this._controllerLog(
            status === 'completed' ? 'info' : status === 'partial' || status === 'cancelled' ? 'warn' : 'error',
            `Run ${status} (${label}).`
        )

        this.history.unshift({
            runId: this.runId,
            startedAt: this.startedAt,
            endedAt,
            exit: this.lastExit,
            run: summarizeRunState(this.runState)
        })
        if (this.history.length > this.historySize) this.history.pop()

        this.child = null
        this.pid = null
        this.state = 'idle'

        try {
            saveRunHistory(this.historyPath, this.history)
        } catch {
            this._controllerLog('warn', 'Could not persist run history.')
        }
        this._emitStatus('exit')
        this.emit('exit', { ...this.lastExit })
    }

    _finalizeSessions(endedAt, cancelled, failed, errorMessage) {
        const progress = this.runState.sessionGeneration
        if (!progress) return 'failed'
        const incomplete = progress.steps.some(step => step.status === 'pending' || step.status === 'running')
        for (const step of progress.steps) {
            if (step.status === 'pending' || step.status === 'running') {
                step.status = cancelled ? 'cancelled' : 'failed'
                step.endedAt = endedAt
                step.error =
                    errorMessage ??
                    (cancelled ? 'Session regeneration cancelled' : 'Session runner exited before saving this session')
            }
        }
        const completed = progress.steps.filter(step => step.status === 'completed').length
        if (cancelled) return 'cancelled'
        if (incomplete) return 'interrupted'
        if (errorMessage != null) return 'failed'
        if (!failed && completed > 0 && completed === progress.steps.length) return 'completed'
        return completed ? 'partial' : 'failed'
    }
}
