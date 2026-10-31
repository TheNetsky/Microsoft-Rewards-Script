import crypto from 'node:crypto'
import { sendJson } from './http.js'

export function createAccessControl({ token, corsOrigin }) {
    function applyCors(res) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin)
        res.setHeader('Vary', 'Origin')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key, If-Match, Last-Event-ID')
        res.setHeader('Access-Control-Expose-Headers', 'ETag')
        res.setHeader('Access-Control-Max-Age', '86400')
    }

    function tokenFromReq(req, url) {
        const auth = req.headers['authorization']
        if (typeof auth === 'string') {
            const bearer = /^Bearer\s+(.+)$/i.exec(auth)
            if (bearer) return (bearer[1] ?? '').trim()
        }
        const apiKey = req.headers['x-api-key']
        if (typeof apiKey === 'string' && apiKey.trim()) return apiKey.trim()
        const q = url.searchParams.get('token')
        if (q && url.pathname.replace(/\/+$/, '') === '/events') return q
        return null
    }

    function safeEqual(a, b) {
        const bufA = Buffer.from(String(a))
        const bufB = Buffer.from(String(b))
        if (bufA.length !== bufB.length) return false
        return crypto.timingSafeEqual(bufA, bufB)
    }

    function isAuthorized(req, url) {
        if (!token) return true
        const provided = tokenFromReq(req, url)
        if (!provided) return false
        return safeEqual(provided, token)
    }

    return (req, res, url) => {
        if (!token) {
            let host
            try {
                host = new URL(`http://${req.headers.host || 'localhost'}`).hostname
            } catch {
                sendJson(res, 400, { error: 'Invalid request host.', code: 'BAD_REQUEST' })
                return false
            }
            const origin = req.headers.origin
            if ((origin && origin !== corsOrigin) || !['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
                sendJson(res, 403, {
                    error: 'Untrusted local API origin or host. Configure API_TOKEN for remote access.'
                })
                return false
            }
        }
        applyCors(res)
        if (req.method === 'OPTIONS') {
            res.writeHead(204)
            res.end()
            return false
        }
        if (!isAuthorized(req, url)) {
            sendJson(res, 401, {
                error: 'Unauthorized',
                hint: 'Provide the API token via Authorization: Bearer or X-API-Key. Browser EventSource may use ?token= only on /events.'
            })
            return false
        }
        return true
    }
}
