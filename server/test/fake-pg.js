/**
 * Minimal in-memory stand-in for the "pg" module used by server.js.
 *
 * Only the handful of query shapes actually issued by src/server.js are
 * supported; anything else throws so unexpected queries fail loudly in tests.
 *
 * Usage in tests (server.js exports a test-only pool injection hook):
 *   const server = await import('../src/server.js')
 *   server.__setPoolForTesting(new FakePool())
 */

export const db = {
    sessions: [], // cbsessions: {id, viewerpw, presenterpw, sessionname, ispublic, lastlogin, lastview, settings}
    boards: [],   // boards: {id, sessionid, bgcolor, settings}
    shapes: [],   // shapes: {id, sessionid, boardid, visible, starttime, shapetype, x, y, stroke, fill, shapedetails, shapedata}
}

let nextSessionId = 1
let nextShapeId = 1

export function resetDb() {
    db.sessions = []
    db.boards = []
    db.shapes = []
    nextSessionId = 1
    nextShapeId = 1
}

export class FakePool {
    constructor() {} // connection config is ignored

    // Real pg supports both promise and callback call styles; server.js uses
    // both, so mirror that here.
    query(sqlText, values = [], cb) {
        const p = this._query(sqlText, values)
        if (typeof cb === 'function') {
            p.then((res) => cb(null, res), (err) => cb(err))
        }
        return p
    }

    async _query(sqlText, values = []) {
        const sql = sqlText.replace(/\s+/g, ' ').trim()
        const lower = sql.toLowerCase()

        // --- cbsessions ------------------------------------------------
        if (lower.includes('insert into cbsessions')) {
            // insert into cbsessions (viewerpw, presenterpw, sessionname, ispublic, lastlogin, settings) ...
            const row = {
                id: nextSessionId++,
                viewerpw: values[0],
                presenterpw: values[1],
                sessionname: values[2],
                ispublic: values[3],
                lastlogin: new Date(),
                lastview: null,
                settings: values[4],
            }
            db.sessions.push(row)
            return { rows: [row], rowCount: 1 }
        }
        if (lower.includes('from cbsessions') && lower.startsWith('select')) {
            if (lower.includes('where ispublic')) {
                const rows = db.sessions
                    .filter((s) => s.ispublic === true)
                    .map((s) => ({
                        id: s.id,
                        sessionname: s.sessionname,
                        lastlogin: s.lastlogin,
                        lastview: s.lastview,
                        has_pw: s.viewerpw !== '',
                    }))
                return { rows, rowCount: rows.length }
            }
            // select * from cbsessions WHERE id = $1
            const rows = db.sessions.filter((s) => s.id === values[0])
            return { rows, rowCount: rows.length }
        }
        if (lower.includes('update cbsessions')) {
            return genericUpdate(db.sessions, sql, values)
        }
        if (lower.includes('delete from cbsessions')) {
            const before = db.sessions.length
            db.sessions = db.sessions.filter((s) => s.id !== values[0])
            return { rows: [], rowCount: before - db.sessions.length }
        }

        // --- shapes ----------------------------------------------------
        if (lower.includes('insert into shapes')) {
            // insert (sessionid, visible, starttime, shapetype, stroke, fill, x, y, boardid, shapedetails, shapedata)
            const row = {
                id: nextShapeId++,
                sessionid: values[0],
                visible: values[1],
                starttime: values[2],
                shapetype: values[3],
                stroke: values[4],
                fill: values[5],
                x: values[6],
                y: values[7],
                boardid: values[8],
                shapedetails: values[9],
                shapedata: values[10],
                erasetime: null,
            }
            db.shapes.push(row)
            return { rows: [{ id: row.id }], rowCount: 1 }
        }
        if (lower.includes('from shapes') && lower.startsWith('select')) {
            if (lower.includes('distinct')) {
                const col = lower.includes('distinct(fill') ? 'fill' : 'stroke'
                const rows = distinctValues(db.shapes, col, values[0])
                return { rows, rowCount: rows.length }
            }
            // Match every "<column> = $n" predicate in the query. Note that
            // some handlers do not pass every parameter (a known quirk), and
            // undefined simply matches nothing extra.
            const preds = [...sql.matchAll(/(sessionid|boardid|id)\s*=\s*\$(\d+)/gi)].map(
                (m) => ({ column: m[1].toLowerCase(), value: values[parseInt(m[2], 10) - 1] })
            )
            const rows = db.shapes.filter((s) =>
                preds.every((p) => p.value === undefined || s[p.column] === p.value)
            )
            return { rows, rowCount: rows.length }
        }
        if (lower.includes('update shapes')) {
            return genericUpdate(db.shapes, sql, values)
        }
        if (lower.includes('delete from shapes')) {
            const before = db.shapes.length
            db.shapes = db.shapes.filter((s) => s.sessionid !== values[0])
            return { rows: [], rowCount: before - db.shapes.length }
        }

        // --- boards ----------------------------------------------------
        if (lower.includes('from boards') && lower.startsWith('select')) {
            // select bgcolor, settings from boards WHERE sessionid = $1 and id = $2
            const rows = db.boards.filter(
                (b) => b.sessionid === values[0] && b.id === values[1]
            )
            return { rows, rowCount: rows.length }
        }
        if (lower.includes('update boards')) {
            return genericUpdate(db.boards, sql, values)
        }
        if (lower.includes('insert into boards')) {
            throw new Error('fake-pg: INSERT INTO boards not implemented')
        }
        if (lower.includes('delete from boards')) {
            const before = db.boards.length
            db.boards = db.boards.filter((b) => b.sessionid !== values[0])
            return { rows: [], rowCount: before - db.boards.length }
        }

        throw new Error('fake-pg: unsupported query: ' + sql)
    }

    async end() {}
    connect() {
        throw new Error('fake-pg: connect() is not supported')
    }
}

// Apply an "update <t> set col = $n, ... where id = <id>" style query.
// The id predicate may be parameterized ($n) or a literal number (PATCH /shape).
function genericUpdate(table, sql, values) {
    const pairs = [...sql.matchAll(/(\w+)\s*=\s*\$(\d+)/gi)].map((m) => ({
        column: m[1].toLowerCase(),
        value: values[parseInt(m[2], 10) - 1],
    }))
    let idValue
    const idParam = pairs.find((p) => p.column === 'id')
    if (idParam) {
        idValue = idParam.value
    } else {
        const m = sql.match(/where\s+sessionid\s*=\s*(\d+)\s+and\s+id\s*=\s*(\d+)/i)
        if (!m) throw new Error('fake-pg: no id predicate in: ' + sql)
        idValue = parseInt(m[2], 10)
    }
    let count = 0
    for (const row of table) {
        if (row.id !== idValue) continue
        for (const p of pairs) {
            if (p.column === 'id') continue
            row[p.column] = p.value
        }
        count++
    }
    return { rows: [], rowCount: count }
}

function distinctValues(rows, column, sessionid) {
    const seen = new Set()
    const out = []
    for (const r of rows) {
        if (r.sessionid !== sessionid) continue
        if (r[column] === undefined || r[column] === null) continue
        if (!seen.has(r[column])) {
            seen.add(r[column])
            out.push({ [column]: r[column] })
        }
    }
    return out
}
