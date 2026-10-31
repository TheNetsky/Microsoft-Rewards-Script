import { sendJson } from './http.js'

/** @typedef {{ id: number } & Record<string, unknown>} StreamLog */
/** @typedef {import('node:events').EventEmitter & { getStatus(): unknown, getLogs(options: { limit?: number | null, afterId?: number }): { logs: StreamLog[], latestLogId: number } }} StreamSource */

const MAX_CLIENTS = 50
const MAX_QUEUED_BYTES = 1024 * 1024
const DRAIN_TIMEOUT_MS = 60000

/** @param {StreamSource} source @param {number} logBufferSize */
export function createEventStream(source, logBufferSize) {
    let clients = 0
    /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {URL} url */
    return (req, res, url) => {
        if (clients >= MAX_CLIENTS) return sendJson(res, 503, { error: 'Too many event streams; retry later.' })
        clients++
        let closed = false
        let blocked = false
        let queuedBytes = 0
        /** @type {string[]} */
        const queue = []
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        let drainTimer
        /** @type {ReturnType<typeof setInterval> | undefined} */
        let heartbeat
        const cleanup = () => {
            if (closed) return
            closed = true
            clients--
            clearTimeout(drainTimer)
            clearInterval(heartbeat)
            source.off('log', onLog)
            source.off('status', onStatus)
            source.off('exit', onExit)
            res.off('drain', flush)
            req.off('aborted', disconnect)
            queue.length = 0
            queuedBytes = 0
        }
        const disconnect = () => {
            cleanup()
            res.destroy()
        }
        const flush = () => {
            if (closed) return
            blocked = false
            clearTimeout(drainTimer)
            while (queue.length && !closed) {
                const frame = /** @type {string} */ (queue.shift())
                queuedBytes -= Buffer.byteLength(frame)
                try {
                    if (!res.write(frame)) {
                        blocked = true
                        drainTimer = setTimeout(disconnect, DRAIN_TIMEOUT_MS)
                        drainTimer.unref()
                        break
                    }
                } catch {
                    disconnect()
                }
            }
        }
        /** @param {string} frame */
        const write = frame => {
            if (closed || res.destroyed || res.writableEnded) return
            const size = Buffer.byteLength(frame)
            if (queuedBytes + size + res.writableLength > MAX_QUEUED_BYTES) return disconnect()
            queue.push(frame)
            queuedBytes += size
            if (!blocked) flush()
        }
        /** @param {string} event @param {unknown} data @param {number} [id] */
        const send = (event, data, id) =>
            write(`${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        /** @param {StreamLog} entry */
        const onLog = entry => send('log', entry, entry.id)
        /** @param {unknown} status */
        const onStatus = status => send('status', status)
        /** @param {unknown} exit */
        const onExit = exit => send('exit', exit)

        res.once('close', cleanup)
        res.once('error', disconnect)
        req.once('aborted', disconnect)
        res.on('drain', flush)
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no'
        })
        res.flushHeaders()
        send('hello', source.getStatus())
        const retained = source.getLogs({ limit: null })
        const lastId = Number(req.headers['last-event-id'])
        const oldestId = retained.logs[0]?.id ?? retained.latestLogId + 1
        const validCursor = Number.isSafeInteger(lastId) && lastId > 0
        const gap = validCursor && (lastId < oldestId - 1 || lastId > retained.latestLogId)
        const replay = Math.floor(
            Math.max(0, Math.min(Number(url.searchParams.get('replay') ?? 100) || 0, logBufferSize))
        )
        const logs =
            validCursor && !gap
                ? retained.logs.filter(entry => entry.id > lastId)
                : replay
                  ? retained.logs.slice(-replay)
                  : []
        for (const entry of logs) {
            if (closed) break
            onLog(entry)
        }
        if (gap)
            send(
                'reset',
                {
                    reason: 'log-cursor-expired',
                    latestLogId: retained.latestLogId,
                    message: 'Reload /status and /points; some earlier logs are no longer retained.'
                },
                retained.latestLogId
            )
        if (closed) return
        source.on('log', onLog)
        source.on('status', onStatus)
        source.on('exit', onExit)
        heartbeat = setInterval(() => {
            if (!blocked) write(': ping\n\n')
        }, 15000)
        heartbeat.unref()
    }
}
