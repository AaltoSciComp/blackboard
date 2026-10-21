import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db, resetDb, FakePool } from './fake-pg.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { io as ioClient } from 'socket.io-client'

// Take the plain-http/dev branch in server.js without reading Docker secrets.
process.env.NODE_ENV = 'test'
process.env.SERVER_SECRET = 'test-server-secret'

const SERVER_SECRET = 'test-server-secret'
const PRESENTER_PW = 'v3rysecretpw'
const VIEWER_PW = 'viewpw'
// Low bcrypt cost factor keeps these tests fast.
const REAL_HASH = bcrypt.hashSync(PRESENTER_PW, 4)

function presenterToken(hash) {
    return jwt.sign({ role: 'presenter' }, hash + SERVER_SECRET)
}
function adminToken() {
    return jwt.sign({ role: 'admin' }, SERVER_SECRET)
}

// A socket.io connection helper that fails fast instead of hanging the suite.
function connectClient(url, timeout = 2000) {
    return new Promise((resolve, reject) => {
        const socket = ioClient(url, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
        })
        const t = setTimeout(() => {
            socket.close()
            reject(new Error('connect timeout'))
        }, timeout)
        socket.on('connect', () => {
            clearTimeout(t)
            resolve(socket)
        })
        socket.on('connect_error', (e) => {
            clearTimeout(t)
            socket.close()
            reject(e)
        })
    })
}

// Wait for the next occurrence of `event` on `socket`.
function waitFor(socket, event, timeout = 2000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(
            () => reject(new Error(`timeout waiting for "${event}"`)),
            timeout
        )
        socket.once(event, (...args) => {
            clearTimeout(t)
            // With connectionStateRecovery enabled, socket.io appends the
            // recovery session id as an extra argument — ignore everything
            // after the payload itself.
            resolve(args[0])
        })
    })
}

// Wait for a board_data event for a specific board id (other boards may be
// in flight from viewer_login's initial fetch, so we filter by boardid).
function waitForBoard(socket, boardid, timeout = 2000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(
            () => {
                socket.off('board_data', onBoard)
                reject(new Error(`timeout waiting for board_data of board ${boardid}`))
            },
            timeout
        )
        function onBoard(payload) {
            if (payload?.data?.boardid === boardid) {
                clearTimeout(t)
                socket.off('board_data', onBoard)
                resolve(payload)
            }
        }
        socket.on('board_data', onBoard)
    })
}

function seedSession(overrides = {}) {
    const session = {
        id: 1,
        viewerpw: VIEWER_PW,
        presenterpw: REAL_HASH,
        sessionname: 'Test session',
        ispublic: false,
        lastlogin: new Date(),
        lastview: null,
        settings: {
            boards: { ab: 1, sb: 1, nvb: 4 },
            ui: {},
            line: {},
            laser: { size: 1, color: '#ff0000' },
        },
        ...overrides,
    }
    db.sessions.push(session)
    return session
}

let io, httpServer, baseUrl
let sd

beforeAll(async () => {
    const server = await import('../src/server.js')
    server.__setPoolForTesting(new FakePool())
    io = server.io
    sd = server.sd
    httpServer = server.server
    // io was bound to this server object at import time; start it on an
    // ephemeral port so real websocket clients can connect.
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const { port } = httpServer.address()
    baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve))
})

beforeEach(() => {
    resetDb()
    sd.length = 0
})

describe('socket.io: viewer_login', () => {
    it('grants a viewer token and board config on correct password', async () => {
        seedSession()
        const socket = await connectClient(baseUrl)
        try {
            socket.emit('viewer_login', { sid: 1, pw: VIEWER_PW, offset: 0 })
            const payload = await waitFor(socket, 'login_success')

            expect(payload).toMatchObject({
                nvb: 4,
                ab: 1,
                sb: 1,
            })
            expect(typeof payload.token).toBe('string')
            // Token must verify with the same secret isLogged() uses
            const decoded = jwt.verify(payload.token, VIEWER_PW + SERVER_SECRET)
            expect(decoded.role).toBe('viewer')
        } finally {
            socket.close()
        }
    })

    it('rejects a wrong password and disconnects', async () => {
        seedSession()
        const socket = await connectClient(baseUrl)
        try {
            const failed = waitFor(socket, 'login_failed')
            const disconnected = new Promise((resolve) =>
                socket.on('disconnect', resolve)
            )
            socket.emit('viewer_login', { sid: 1, pw: 'wrong', offset: 0 })

            const reason = await failed
            expect(reason).toMatch(/Incorrect password/)
            await disconnected
        } finally {
            socket.close()
        }
    })

    it('reports a missing session', async () => {
        // No session seeded -> session data cannot be loaded
        const socket = await connectClient(baseUrl)
        try {
            socket.emit('viewer_login', { sid: 42, pw: '', offset: 0 })
            const reason = await waitFor(socket, 'login_failed')
            expect(reason).toMatch(/Session data not found/)
        } finally {
            socket.close()
        }
    })
})

describe('socket.io: request_boards', () => {
    it('refuses to send boards without a valid token', async () => {
        seedSession()
        const socket = await connectClient(baseUrl)
        try {
            socket.emit('request_boards', {
                sid: 1,
                token: 'garbage',
                from: 1,
                to: 2,
            })
            const reason = await waitFor(socket, 'login_failed')
            expect(reason).toMatch(/Not authenticated/)
        } finally {
            socket.close()
        }
    })

    it('sends board data to an authenticated viewer', async () => {
        seedSession()
        const socket = await connectClient(baseUrl)
        try {
            // Log in first so the server-side session cache is populated and
            // the socket has joined the session room.
            socket.emit('viewer_login', { sid: 1, pw: VIEWER_PW, offset: 0 })
            const login = await waitFor(socket, 'login_success')

            // Request boards outside the range fetched by viewer_login (1-4),
            // so a matching board_data can only come from request_boards.
            const board7 = waitForBoard(socket, 7)
            socket.emit('request_boards', {
                sid: 1,
                token: login.token,
                from: 7,
                to: 7,
            })
            const data = await board7
            expect(data.data).toMatchObject({ boardid: 7 })
        } finally {
            socket.close()
        }
    })
})

describe('socket.io: claim_board', () => {
    it('accepts a valid presenter and broadcasts presenter_connected', async () => {
        seedSession()
        const socket = await connectClient(baseUrl)
        try {
            const connected = waitFor(socket, 'presenter_connected')
            socket.emit('claim_board', {
                sid: 1,
                token: presenterToken(REAL_HASH),
            })
            await connected
            // The claiming socket is recorded as the session's presenter
            expect(sd[1].presentersocket).toBeDefined()
        } finally {
            socket.close()
        }
    })

    it('rejects a non-presenter token', async () => {
        seedSession()
        const socket = await connectClient(baseUrl)
        try {
            socket.emit('claim_board', { sid: 1, token: 'not-a-token' })
            const err = await waitFor(socket, 'fatal_error')
            expect(err).toMatch(/Presenter credentials required/)
        } finally {
            socket.close()
        }
    })

    it('refuses to claim a board already held by a connected presenter', async () => {
        seedSession()
        const first = await connectClient(baseUrl)
        const token = presenterToken(REAL_HASH)
        first.emit('claim_board', { sid: 1, token })
        await waitFor(first, 'presenter_connected')

        const second = await connectClient(baseUrl)
        try {
            second.emit('claim_board', { sid: 1, token })
            const err = await waitFor(second, 'fatal_error')
            expect(err).toMatch(/Board already claimed/)
        } finally {
            first.close()
            second.close()
        }
    })
})

describe('socket.io: presenter-only relays', () => {
    it('relays laser_on to the room only when sent by the presenter', async () => {
        seedSession()
        const presenter = await connectClient(baseUrl)
        const viewer = await connectClient(baseUrl)
        // Viewer joins the session room via a successful login
        viewer.emit('viewer_login', { sid: 1, pw: VIEWER_PW, offset: 0 })
        await waitFor(viewer, 'login_success')

        presenter.emit('claim_board', { sid: 1, token: presenterToken(REAL_HASH) })
        await waitFor(presenter, 'presenter_connected')

        try {
            const received = waitFor(viewer, 'laser_on')
            presenter.emit('laser_on', {
                sid: 1,
                token: presenterToken(REAL_HASH),
                color: '#ff0000',
                size: 3,
            })
            expect(await received).toMatchObject({ color: '#ff0000', size: 3 })
        } finally {
            presenter.close()
            viewer.close()
        }
    })

    it('does not relay laser_on from a non-presenter', async () => {
        seedSession()
        const intruder = await connectClient(baseUrl)
        const token = jwt.sign({ role: 'viewer' }, VIEWER_PW + SERVER_SECRET)
        intruder.emit('viewer_login', { sid: 1, pw: VIEWER_PW, offset: 0 })
        await waitFor(intruder, 'login_success')

        try {
            let got = false
            intruder.on('laser_on', () => (got = true))
            intruder.emit('laser_on', {
                sid: 1,
                token,
                color: '#00ff00',
                size: 1,
            })
            // Give any (incorrect) relay a chance to arrive, then assert silence
            await new Promise((r) => setTimeout(r, 250))
            expect(got).toBe(false)
        } finally {
            intruder.close()
        }
    })
})

describe('socket.io: admin_notification', () => {
    it('broadcasts a message to everyone with a valid admin token', async () => {
        const receiver = await connectClient(baseUrl)
        const sender = await connectClient(baseUrl)
        try {
            const received = waitFor(receiver, 'admin_notification')
            sender.emit('admin_notification', {
                token: adminToken(),
                message: 'scheduled maintenance',
            })
            const text = await received
            expect(text).toMatch(/scheduled maintenance/)
        } finally {
            receiver.close()
            sender.close()
        }
    })

    it('ignores an admin_notification sent with an invalid token', async () => {
        const receiver = await connectClient(baseUrl)
        const sender = await connectClient(baseUrl)
        try {
            let got = false
            receiver.on('admin_notification', () => (got = true))
            sender.emit('admin_notification', {
                token: 'forged-token',
                message: 'should not broadcast',
            })
            await new Promise((r) => setTimeout(r, 250))
            expect(got).toBe(false)
        } finally {
            receiver.close()
            sender.close()
        }
    })
})
