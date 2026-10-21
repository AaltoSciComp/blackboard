import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

const originalNodeEnv = process.env.NODE_ENV
process.env.NODE_ENV = 'test'

// error-handler logs through npmlog; redirect its output so the test report
// is not flooded with the (intentional) error stacks.
const logger = require('npmlog')
logger.stream = { write: () => {} }

const errorHandler = require('../src/error-handler.js')

afterAll(() => {
    if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
    } else {
        process.env.NODE_ENV = originalNodeEnv
    }
})

function makeRes(accept = '*/*') {
    const res = {
        statusCode: 200,
        headersSent: false,
        status(code) {
            this.statusCode = code
            return this
        },
        type(t) {
            this.contentType = t
            return this
        },
        json(body) {
            this.jsonBody = body
            return this
        },
        send(body) {
            this.sendBody = body
            return this
        },
        format(serializers) {
            const chosen = accept === 'text/plain'
                ? serializers.default
                : serializers['application/json'] ?? serializers.default
            chosen()
        },
    }
    return res
}

describe('error-handler middleware', () => {
    let req, res, next

    beforeEach(() => {
        req = {}
        res = makeRes()
        next = vi.fn()
    })

    it('uses the status code from the error object', () => {
        const err = Object.assign(new Error('nope'), { status: 403 })
        errorHandler(err, req, res, next)
        expect(res.statusCode).toBe(403)
    })

    it('accepts statusCode as an alias', () => {
        const err = Object.assign(new Error('nope'), { statusCode: 404 })
        errorHandler(err, req, res, next)
        expect(res.statusCode).toBe(404)
    })

    it('falls back to the response status code when the error has none', () => {
        const err = new Error('nope')
        res.statusCode = 503
        errorHandler(err, req, res, next)
        expect(res.statusCode).toBe(503)
    })

    it('falls back to 500 when nothing provides a usable status', () => {
        errorHandler(new Error('nope'), req, res, next)
        expect(res.statusCode).toBe(500)
    })

    it('ignores non-error status codes on the error object', () => {
        const err = Object.assign(new Error('nope'), { status: 200 })
        errorHandler(err, req, res, next)
        expect(res.statusCode).toBe(500)
    })

    it('includes the error message in the JSON body outside production', () => {
        const err = new Error('visible message')
        errorHandler(err, req, res, next)
        expect(res.jsonBody.message).toContain('visible message')
    })

    it('uses the plain-text response for text/plain requests', () => {
        const err = new Error('visible message')
        res = makeRes('text/plain')
        errorHandler(err, req, res, next)
        expect(res.contentType).toBe('text/plain')
        expect(res.sendBody).toContain('visible message')
    })

    it('does not include error details in production responses', async () => {
        process.env.NODE_ENV = 'production'
        vi.resetModules()

        try {
            const productionLogger = require('npmlog')
            productionLogger.stream = { write: () => {} }
            const productionErrorHandler = (await import('../src/error-handler.js')).default
            productionErrorHandler(new Error('private details'), req, res, next)
            expect(res.jsonBody).toEqual({ message: undefined })
        } finally {
            process.env.NODE_ENV = 'test'
            vi.resetModules()
        }
    })

    it('delegates to next() when headers are already sent', () => {
        const err = Object.assign(new Error('nope'), { status: 500 })
        res.headersSent = true
        errorHandler(err, req, res, next)
        expect(next).toHaveBeenCalledWith(err)
        expect(res.statusCode).toBe(200) // untouched
    })
})
