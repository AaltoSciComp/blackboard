import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db, resetDb, FakePool } from './fake-pg.js'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

// Take the plain-http/dev branch in server.js without reading Docker secrets.
process.env.NODE_ENV = 'test'
process.env.SERVER_SECRET = 'test-server-secret'

const SERVER_SECRET = 'test-server-secret'
const KNOWN_HASH = '$2b$10$knownhashforthetests'

// A valid presenter token for session id 1, matching isPresenter():
// jwt.verify(token, sd[sid].presenterhash + SERVER_SECRET)
function presenterToken(sidHash) {
    return jwt.sign({ role: 'presenter' }, sidHash + SERVER_SECRET)
}

async function seedSession(overrides = {}) {
    const session = {
        id: 1,
        viewerpw: '',
        presenterpw: KNOWN_HASH,
        sessionname: 'Test session',
        ispublic: false,
        lastlogin: new Date(),
        lastview: null,
        settings: { boards: { ab: 1, sb: 1, nvb: 4 }, ui: {}, line: {}, laser: { size: 1, color: '#ff0000' } },
        ...overrides,
    }
    db.sessions.push(session)
    return session
}

let app
let sd

beforeAll(async () => {
    const server = await import('../src/server.js')
    // server.js only connects lazily, so swapping the pool before the first
    // request guarantees no real database connection is ever attempted.
    server.__setPoolForTesting(new FakePool())
    app = server.app
    sd = server.sd
})

beforeEach(() => {
    resetDb()
    // The server keeps a module-level session cache (sd) that survives the
    // fake-database reset; clear it so stale password hashes from earlier
    // tests cannot leak into later ones.
    sd.length = 0
})

describe('GET /sessions', () => {
    it('returns public sessions with has_pw flag', async () => {
        await seedSession({ ispublic: true, viewerpw: 'secret' })
        await seedSession({ id: 2, ispublic: false, viewerpw: '' })

        const res = await request(app).get('/sessions').expect(200)

        expect(res.body).toHaveLength(1)
        expect(res.body[0]).toMatchObject({ id: 1, sessionname: 'Test session', has_pw: true })
        expect(res.body[0]).not.toHaveProperty('presenterpw')
    })
})

describe('POST /login/:sessionid', () => {
    describe('creating a new session (sessionid = 0)', () => {
        it('requires a non-empty presenter password', async () => {
            const res = await request(app)
                .post('/login/0')
                .send({ presenterpw: '', sessionname: 'x' })
            expect(res.status).toBe(400)
        })

        it('requires a non-empty session name', async () => {
            const res = await request(app)
                .post('/login/0')
                .send({ presenterpw: 'pw', sessionname: '' })
            expect(res.status).toBe(400)
        })

        it('creates a session and returns a presenter token', async () => {
            const res = await request(app)
                .post('/login/0')
                .send({ presenterpw: 'pw', sessionname: 'New', viewerpw: '', ispublic: false })
                .expect(200)

            expect(res.body.sessionInfo.sessionname).toBe('New')
            expect(typeof res.body.token).toBe('string')
            expect(db.sessions).toHaveLength(1)
        })
    })

    describe('joining an existing session', () => {
        // A real bcrypt hash so bcrypt.compare can actually succeed.
        // Low cost factor keeps the test fast.
        const PRESENTER_PW = 'v3rysecretpw'
        const REAL_HASH = bcrypt.hashSync(PRESENTER_PW, 4)

        it('accepts the correct presenter password and returns a valid token', async () => {
            await seedSession({ presenterpw: REAL_HASH, viewerpw: 'viewpw', sessionname: 'Lecture 3' })

            const res = await request(app)
                .post('/login/1')
                .send({ presenterpw: PRESENTER_PW })
                .expect(200)

            // The presenter password must never be echoed back
            expect(JSON.stringify(res.body)).not.toContain(PRESENTER_PW)
            expect(res.body.sessionInfo).toMatchObject({
                id: 1,
                sessionname: 'Lecture 3',
                viewerpw: 'viewpw',
            })
            expect(res.body.settings).toBeDefined()

            // The token must verify with the same secret isPresenter() uses:
            // presenterhash + SERVER_SECRET
            const decoded = jwt.verify(res.body.token, REAL_HASH + SERVER_SECRET)
            expect(decoded.role).toBe('presenter')

            // The server-side session cache should now be populated
            expect(sd[1]).toMatchObject({ presenterhash: REAL_HASH, sessionid: 1 })
        })

        it('rejects an unknown session', async () => {
            const res = await request(app)
                .post('/login/999')
                .send({ presenterpw: 'pw' })
            expect(res.status).toBe(404)
        })

        it('rejects a wrong password with 401', async () => {
            // bcrypt.compare against a bogus hash fails, so login is rejected
            // Note: our KNOWN_HASH is not a real bcrypt hash, so any password
            // will fail here.
            await seedSession()
            const res = await request(app).post('/login/1').send({ presenterpw: 'wrong' })
            expect(res.status).toBe(401)
        })
    })
})

describe('presenter-only endpoints', () => {
    it('rejects requests with no Authorization header', async () => {
        await seedSession()
        const res = await request(app).get('/boardsettings/all/1')
        expect(res.status).toBe(403)
    })

    it('rejects requests with an invalid token', async () => {
        await seedSession()
        const res = await request(app)
            .get('/boardsettings/all/1')
            .set('Authorization', 'Bearer not-a-real-token')
        expect(res.status).toBe(403)
    })
})

describe('PUT /shape/:sessionid', () => {
    let token

    beforeEach(async () => {
        await seedSession()
        token = presenterToken(KNOWN_HASH)
    })

    const validLine = () => ({
        boardid: 1,
        visible: true,
        starttime: '1652453720284',
        shapetype: 'Line',
        x: '0.1',
        y: '0.2',
        stroke: '#ffffff',
        fill: '#000000',
        shapedetails: { strokeWidth: 0.15, tension: 0.3, bezier: true, strokeEnabled: true },
        shapedata: [
            [0, 0.0195, -0.01522],
            [10, 0.02, -0.01],
        ],
    })

    it('stores a shape and returns its id when authorized', async () => {
        const res = await request(app)
            .put('/shape/1')
            .set('Authorization', `Bearer ${token}`)
            .send(validLine())
            .expect(200)

        expect(res.body.id).toBeGreaterThan(0)
        expect(db.shapes).toHaveLength(1)
        expect(db.shapes[0]).toMatchObject({ sessionid: 1, boardid: 1, shapetype: 'Line' })
    })

    it('rejects a shape with an invalid shapetype', async () => {
        const bad = validLine()
        // shapetype is an enum in the OpenAPI spec; a nonsense value must be
        // rejected by the request validator with 400 before any DB access.
        bad.shapetype = 'Nonsense'
        const res = await request(app)
            .put('/shape/1')
            .set('Authorization', `Bearer ${token}`)
            .send(bad)
        expect(res.status).toBe(400)
    })

    it('rejects a Line without shapedata', async () => {
        const bad = validLine()
        delete bad.shapedata
        const res = await request(app)
            .put('/shape/1')
            .set('Authorization', `Bearer ${token}`)
            .send(bad)
        expect(res.status).toBe(400)
    })
})

describe('DELETE /session/:sessionid', () => {
    it('deletes the session and its data when authorized', async () => {
        await seedSession()
        db.boards.push({ id: 1, sessionid: 1, bgcolor: '#284646', settings: {} })
        db.shapes.push({ id: 1, sessionid: 1, boardid: 1, visible: true })

        const token = presenterToken(KNOWN_HASH)
        const res = await request(app)
            .delete('/session/1')
            .set('Authorization', `Bearer ${token}`)
            .expect(200)

        expect(res.body).toEqual({ status: 'success' })
        expect(db.sessions).toHaveLength(0)
        expect(db.boards).toHaveLength(0)
        expect(db.shapes).toHaveLength(0)
    })
})
