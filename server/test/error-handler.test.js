import { describe, it, expect, vi, beforeEach } from 'vitest'

// error-handler logs through npmlog; redirect its output so the test report
// is not flooded with the (intentional) error stacks.
const logger = require('npmlog')
logger.stream = { write: () => {} }

const errorHandler = require('../src/error-handler.js')

function makeRes() {
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
            const chosen = serializers['application/json'] ?? serializers.default
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
        // NODE_ENV is not "production" under vitest, so the body should be present
        expect(res.jsonBody.message).toContain('visible message')
    })

    it('delegates to next() when headers are already sent', () => {
        const err = Object.assign(new Error('nope'), { status: 500 })
        res.headersSent = true
        errorHandler(err, req, res, next)
        expect(next).toHaveBeenCalledWith(err)
        expect(res.statusCode).toBe(200) // untouched
    })
})
