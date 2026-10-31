/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} value */
export function sendJson(res, status, value) {
    if (res.destroyed || res.writableEnded) return
    if (res.headersSent) return void res.destroy()
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(value))
}

/** @param {import('node:http').IncomingMessage} req @returns {Promise<unknown>} */
function readJsonBody(req, limitBytes = 1_000_000, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        let size = 0
        let settled = false
        /** @type {Buffer[]} */
        const chunks = []
        const timer = setTimeout(
            () => fail(Object.assign(new Error('Request body timed out.'), { code: 'BODY_TIMEOUT' })),
            timeoutMs
        )
        timer.unref()
        const cleanup = () => {
            clearTimeout(timer)
            req.off('data', onData)
            req.off('end', onEnd)
            req.off('aborted', onAborted)
            req.off('error', fail)
            chunks.length = 0
        }
        /** @param {unknown} error */
        const fail = error => {
            if (settled) return
            settled = true
            cleanup()
            req.resume()
            reject(error)
        }
        const onAborted = () =>
            fail(Object.assign(new Error('Request body was interrupted.'), { code: 'REQUEST_ABORTED' }))
        /** @param {Buffer} chunk */
        const onData = chunk => {
            size += chunk.length
            if (size > limitBytes)
                return fail(Object.assign(new Error('Request body too large.'), { code: 'BODY_TOO_LARGE' }))
            chunks.push(chunk)
        }
        const onEnd = () => {
            if (settled) return
            const raw = Buffer.concat(chunks).toString('utf8').trim()
            try {
                const body = raw ? JSON.parse(raw) : {}
                settled = true
                cleanup()
                resolve(body)
            } catch {
                fail(Object.assign(new Error('Invalid JSON body.'), { code: 'BAD_JSON' }))
            }
        }
        req.on('data', onData)
        req.once('end', onEnd)
        req.once('aborted', onAborted)
        req.once('error', fail)
        if (req.destroyed) onAborted()
        else if (Number(req.headers['content-length']) > limitBytes)
            fail(Object.assign(new Error('Request body too large.'), { code: 'BODY_TOO_LARGE' }))
    })
}

/** @param {string} message */
export function requestError(message, code = 'BAD_REQUEST', status = 400) {
    return Object.assign(new Error(message), { code, status })
}

/** @param {Record<string, unknown>} body @param {readonly string[]} allowed */
export function rejectUnknownFields(body, allowed) {
    const unknown = Object.keys(body).filter(key => !allowed.includes(key))
    if (unknown.length)
        throw requestError(`Unknown request field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`)
}

/** @param {import('node:http').IncomingMessage} req @returns {Promise<Record<string, unknown>>} */
export async function readJsonObject(req) {
    const body = await readJsonBody(req)
    if (typeof body !== 'object' || body === null || Array.isArray(body))
        throw Object.assign(new Error('Body must be a JSON object.'), { code: 'BAD_REQUEST' })
    return /** @type {Record<string, unknown>} */ (body)
}

/** @param {import('node:http').ServerResponse} res @param {unknown} error @param {(error: unknown) => void} report */
export function sendRequestError(res, error, report) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    const requestedStatus = error && typeof error === 'object' && 'status' in error ? error.status : undefined
    const status =
        typeof requestedStatus === 'number' && [400, 403, 404, 405, 409, 412, 422, 503].includes(requestedStatus)
            ? requestedStatus
            : code === 'BODY_TOO_LARGE'
              ? 413
              : code === 'BODY_TIMEOUT'
                ? 408
                : ['BAD_JSON', 'BAD_REQUEST', 'REQUEST_ABORTED'].includes(code)
                  ? 400
                  : 500
    if (status === 500) report(error)
    if (res.destroyed || res.writableEnded) return
    if (!res.headersSent && ['BODY_TOO_LARGE', 'BODY_TIMEOUT'].includes(code)) res.setHeader('Connection', 'close')
    sendJson(res, status, {
        error: status === 500 ? 'Internal server error' : error instanceof Error ? error.message : 'Invalid request',
        code: code || 'INTERNAL_ERROR'
    })
}

/** @param {string} value */
export function containsControlCharacters(value) {
    return [...value].some(character => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
    })
}
