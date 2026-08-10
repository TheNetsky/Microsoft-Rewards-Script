import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

import { parseLogLine, createRunState, applyLogToRunState, summarizeRunState, severityRank } from './logParser.js'

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

export class ProcessManager extends EventEmitter {
    constructor({
        command,
        args = [],
        cwd,
        stopTimeoutMs = 15000,
        logBufferSize = 2000,
        historySize = 20,
        name = 'microsoft-rewards-script',
        version = '0.0.0'
    }) {
        super()
        this.setMaxListeners(0)

        this.command = command
        this.defaultArgs = args
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
        this.lastExit = null
        this.currentArgs = args

        this.runState = createRunState()
        this.logBuffer = []
        this.logSeq = 0
        this.history = []

        this._stdoutBuf = ''
        this._stderrBuf = ''
        this._killTimer = null
        this._finalized = false
    }

    start(overrides = {}) {
        if (this.state !== 'idle') {
            const err = new Error(`Cannot start: a run is already ${this.state}.`)
            err.code = 'ALREADY_RUNNING'
            throw err
        }

        const args = this._resolveArgs(overrides.args)
        const env = this._resolveEnv(overrides.env)

        this.state = 'starting'
        this.runState = createRunState()
        this.startedAt = new Date().toISOString()
        this.lastExit = null
        this.currentArgs = args
        this._stdoutBuf = ''
        this._stderrBuf = ''
        this._finalized = false

        this._controllerLog('info', `Starting run: ${this.command} ${args.join(' ')}`.trim())

        let child
        try {
            child = spawn(this.command, args, {
                cwd: this.cwd,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: !IS_WIN, // own process group on POSIX so we can signal the whole tree
                windowsHide: true
            })
        } catch (error) {
            this.state = 'idle'
            const msg = error instanceof Error ? error.message : String(error)
            this._controllerLog('error', `Failed to spawn: ${msg}`)
            this.lastExit = { code: null, signal: null, at: new Date().toISOString(), error: msg }
            this._emitStatus('spawn-error')
            throw error
        }

        this.child = child
        this.pid = child.pid ?? null

        child.stdout?.on('data', d => this._ingest('stdout', d))
        child.stderr?.on('data', d => this._ingest('stderr', d))

        child.once('spawn', () => {
            this.state = 'running'
            this._controllerLog('info', `Run started (pid ${this.pid}).`)
            this._emitStatus('running')
        })

        child.once('error', error => {
            const msg = error instanceof Error ? error.message : String(error)
            this._controllerLog('error', `Process error: ${msg}`)
            this._finalize(null, null, msg)
        })

        child.once('exit', (code, signal) => this._finalize(code, signal))

        return { pid: this.pid, startedAt: this.startedAt, command: this.command, args }
    }

    stop({ force = false } = {}) {
        if (this.state === 'idle') {
            const err = new Error('Cannot stop: no run is in progress.')
            err.code = 'NOT_RUNNING'
            throw err
        }

        const wasStopping = this.state === 'stopping'
        this.state = 'stopping'
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
                resolve(this.lastExit)
            }
            this.once('exit', done)
            const safety = setTimeout(done, this.stopTimeoutMs + 5000)
            if (typeof safety.unref === 'function') safety.unref()
        })
    }

    async restart(overrides = {}) {
        if (this.state !== 'idle') {
            await this.stop({ force: Boolean(overrides.force) }).catch(() => {})
        }
        await new Promise(r => setTimeout(r, 300))
        return this.start(overrides)
    }

    getStatus() {
        return {
            name: this.name,
            version: this.version,
            state: this.state,
            pid: this.pid,
            startedAt: this.state === 'idle' ? null : this.startedAt,
            command: `${this.command} ${this.currentArgs.join(' ')}`.trim(),
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
            collected: a.collectedPoints ?? a.live.gained,
            balance: a.live.balance ?? a.finalPoints ?? null,
            initialPoints: a.initialPoints,
            bySource: a.live.bySource,
            earnable: a.earnable,
            streakProtection: a.streakProtection,
            edgeBrowsing: a.edgeBrowsing,
            done: a.success != null,
            success: a.success,
            error: a.error
        }))

        return {
            state: this.state,
            running: this.state !== 'idle',
            live: this.state === 'running' || this.state === 'starting',
            startedAt: this.state === 'idle' ? null : this.startedAt,
            currentAccount: run.live.currentAccount,
            balance: run.live.currentBalance,
            collected: run.collected,
            updatedAt: run.live.updatedAt,
            finished: run.finished,
            totals: run.totals,
            accountsTotal: run.accountsTotal,
            accountsSeen: run.accountsSeen,
            accounts,
            lastExit: this.lastExit
        }
    }

    getLogs({ limit = 200, afterId = null, minLevel = null } = {}) {
        let logs = this.logBuffer
        if (afterId != null) logs = logs.filter(e => e.id > afterId)
        if (minLevel) {
            const floor = severityRank(minLevel)
            logs = logs.filter(e => severityRank(e.level) >= floor)
        }
        if (afterId == null && limit != null && logs.length > limit) {
            logs = logs.slice(logs.length - limit)
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

    _resolveArgs(argsOverride) {
        if (argsOverride == null) return this.defaultArgs
        if (!Array.isArray(argsOverride) || !argsOverride.every(a => typeof a === 'string')) {
            const err = new Error('`args` must be an array of strings.')
            err.code = 'BAD_REQUEST'
            throw err
        }
        return argsOverride
    }

    _resolveEnv(envOverride) {
        const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
        if (envOverride != null) {
            if (typeof envOverride !== 'object' || Array.isArray(envOverride)) {
                const err = new Error('`env` must be a JSON object.')
                err.code = 'BAD_REQUEST'
                throw err
            }

            for (const [key, value] of Object.entries(envOverride)) {
                if (!ENV_KEY_RE.test(key) || RESERVED_ENV_KEYS.has(key.toUpperCase())) {
                    const err = new Error(`Invalid environment variable name: ${JSON.stringify(key)}.`)
                    err.code = 'BAD_REQUEST'
                    throw err
                }
                if (BLOCKED_ENV.has(key.toUpperCase())) continue
                if (value == null) continue
                if (!['string', 'number', 'boolean'].includes(typeof value)) {
                    const err = new Error(`Environment override ${key} must be a string, number, boolean, or null.`)
                    err.code = 'BAD_REQUEST'
                    throw err
                }
                env[key] = String(value)
            }
        }
        return env
    }

    _ingest(source, chunk) {
        const bufKey = source === 'stderr' ? '_stderrBuf' : '_stdoutBuf'
        this[bufKey] += chunk.toString('utf8')

        let idx
        while ((idx = this[bufKey].indexOf('\n')) !== -1) {
            const line = this[bufKey].slice(0, idx).replace(/\r$/, '')
            this[bufKey] = this[bufKey].slice(idx + 1)
            this._handleLine(source, line)
        }
    }

    _flushPartial() {
        for (const key of ['_stdoutBuf', '_stderrBuf']) {
            const rest = this[key]
            if (rest && rest.trim()) {
                const source = key === '_stderrBuf' ? 'stderr' : 'stdout'
                this._handleLine(source, rest.replace(/\r$/, ''))
            }
            this[key] = ''
        }
    }

    _handleLine(source, rawLine) {
        if (rawLine === '') return
        const entry = parseLogLine(rawLine, source)
        this._appendLog(entry)
        const milestone = applyLogToRunState(this.runState, entry)
        if (milestone) this._emitStatus(milestone)
    }

    _appendLog(entry) {
        entry.id = ++this.logSeq
        entry.receivedAt = new Date().toISOString()
        this.logBuffer.push(entry)
        if (this.logBuffer.length > this.logBufferSize) this.logBuffer.shift()
        this.emit('log', entry)
    }

    _controllerLog(level, message) {
        this._appendLog({
            ts: null,
            level,
            user: 'API',
            platform: null,
            title: 'CONTROLLER',
            message,
            source: 'controller',
            parsed: false,
            raw: message
        })
    }

    _emitStatus(reason) {
        this.emit('status', { reason, ...this.getStatus() })
    }

    _killTree(signal) {
        if (!this.child || this.pid == null) return
        try {
            if (IS_WIN) {
                spawn('taskkill', ['/pid', String(this.pid), '/T', '/F'], { windowsHide: true })
            } else {
                try {
                    process.kill(-this.pid, signal)
                } catch {
                    this.child.kill(signal)
                }
            }
        } catch {}
    }

    _finalize(code, signal, errorMessage = null) {
        if (this._finalized) return
        this._finalized = true

        if (this._killTimer) {
            clearTimeout(this._killTimer)
            this._killTimer = null
        }

        this._flushPartial()

        const endedAt = new Date().toISOString()
        this.lastExit = { code: code ?? null, signal: signal ?? null, at: endedAt }
        if (errorMessage) this.lastExit.error = errorMessage

        const label =
            errorMessage != null
                ? `error: ${errorMessage}`
                : `code ${code ?? 'n/a'}${signal ? ` / signal ${signal}` : ''}`
        this._controllerLog(code === 0 && errorMessage == null ? 'info' : 'error', `Run finished (${label}).`)

        this.history.unshift({
            startedAt: this.startedAt,
            endedAt,
            exit: this.lastExit,
            run: summarizeRunState(this.runState)
        })
        if (this.history.length > this.historySize) this.history.pop()

        this.child = null
        this.pid = null
        this.state = 'idle'

        this._emitStatus('exit')
        this.emit('exit', { ...this.lastExit })
    }
}

export default ProcessManager
