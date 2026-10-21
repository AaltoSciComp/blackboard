import { describe, it, expect } from 'vitest'
const { pdf_drawLine, pdf_makeKonvaGrid } = require('../src/pdf_utils.js')

// A canvas2d-like recorder: every call is logged so the tests can assert on
// the drawing operations that pdf_utils performs.
function mockContext() {
    const calls = []
    const record =
        (name) =>
        (...args) => {
            calls.push({ fn: name, args })
        }
    const ctx = {
        calls,
        strokeStyle: '',
        fillStyle: '',
        beginPath: record('beginPath'),
        closePath: record('closePath'),
        moveTo: record('moveTo'),
        lineTo: record('lineTo'),
        stroke: record('stroke'),
        fill: record('fill'),
        save: record('save'),
        restore: record('restore'),
        translate: record('translate'),
        rotate: record('rotate'),
        quadraticCurveTo: record('quadraticCurveTo'),
        bezierCurveTo: record('bezierCurveTo'),
    }
    return ctx
}

const fns = (ctx) => ctx.calls.map((c) => c.fn)
const countOf = (ctx, name) => fns(ctx).filter((f) => f === name).length

describe('pdf_drawLine', () => {
    it('does nothing for empty point lists', () => {
        const ctx = mockContext()
        pdf_drawLine(ctx, { stroke: '#000' }, [])
        expect(ctx.calls).toHaveLength(0)
    })

    it('draws a plain polyline with lineTo between points', () => {
        const ctx = mockContext()
        // [x0,y0,x1,y1,x2,y2]
        pdf_drawLine(
            ctx,
            { tension: 0, bezier: false, closed: false, x: 0, y: 0, strokeEnabled: true, stroke: '#123456' },
            [0, 0, 10, 5, 20, 9]
        )
        expect(fns(ctx).slice(0, 2)).toEqual(['beginPath', 'moveTo'])
        // lineTo for points[2..3] and points[4..5]
        const lineTos = ctx.calls.filter((c) => c.fn === 'lineTo').map((c) => c.args)
        expect(lineTos).toEqual([
            [10, 5],
            [20, 9],
        ])
        expect(ctx.strokeStyle).toBe('#123456')
        expect(countOf(ctx, 'stroke')).toBe(1)
        expect(countOf(ctx, 'fill')).toBe(0) // open, strokeEnabled only strokes
    })

    it('strokes only when strokeEnabled is false-ish for open lines', () => {
        const ctx = mockContext()
        pdf_drawLine(
            ctx,
            { tension: 0, bezier: false, closed: false, x: 0, y: 0, strokeEnabled: false },
            [0, 0, 10, 5]
        )
        expect(countOf(ctx, 'stroke')).toBe(0)
    })

    it('closes and fills closed shapes', () => {
        const ctx = mockContext()
        pdf_drawLine(
            ctx,
            { tension: 0, bezier: false, closed: true, x: 0, y: 0, strokeEnabled: true },
            [0, 0, 10, 0, 10, 10, 0, 10]
        )
        expect(countOf(ctx, 'closePath')).toBe(1)
        expect(countOf(ctx, 'fill')).toBe(1)
        expect(countOf(ctx, 'stroke')).toBe(1)
    })

    it('uses bezier curves for complete point groups when tension is 0', () => {
        const ctx = mockContext()
        // The first pair is the start; each cubic segment uses six more values.
        pdf_drawLine(
            ctx,
            { tension: 0, bezier: true, closed: false, x: 0, y: 0, strokeEnabled: true },
            [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]
        )
        const curves = ctx.calls.filter((c) => c.fn === 'bezierCurveTo')
        expect(curves).toHaveLength(2)
        expect(curves.every((curve) => curve.args.every(Number.isFinite))).toBe(true)
        expect(countOf(ctx, 'lineTo')).toBe(0)
    })

    it('ignores an incomplete trailing bezier point group', () => {
        const ctx = mockContext()
        pdf_drawLine(
            ctx,
            { tension: 0, bezier: true, closed: false, x: 0, y: 0, strokeEnabled: true },
            [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]
        )
        const curves = ctx.calls.filter((c) => c.fn === 'bezierCurveTo')
        expect(curves).toHaveLength(1)
        expect(curves[0].args.every(Number.isFinite)).toBe(true)
    })

    it('uses quadratic/bezier curves when tension is non-zero', () => {
        const ctx = mockContext()
        const points = []
        for (let i = 0; i < 10; i++) points.push(i, i * 2)
        pdf_drawLine(
            ctx,
            { tension: 0.4, bezier: false, closed: false, x: 0, y: 0, strokeEnabled: true },
            points
        )
        // Open tension lines start and end with a quadratic curve...
        expect(countOf(ctx, 'quadraticCurveTo')).toBe(2)
        // ...with bezier segments in between (all bezierCurveTo args must be finite numbers)
        for (const c of ctx.calls.filter((c) => c.fn === 'bezierCurveTo')) {
            expect(c.args.every(Number.isFinite)).toBe(true)
        }
    })

    it('draws an arrowhead with pointerAtEnding', () => {
        const ctx = mockContext()
        pdf_drawLine(
            ctx,
            {
                tension: 0,
                bezier: false,
                closed: false,
                x: 0,
                y: 0,
                strokeEnabled: true,
                pointerAtEnding: true,
                pointerLength: 6,
                pointerWidth: 6,
            },
            [0, 0, 0, 0, 20, 10] // arrow format: start 0,0 then absolute end
        )
        expect(countOf(ctx, 'save')).toBe(1)
        expect(countOf(ctx, 'rotate')).toBe(1)
        // 2 lineTo calls for the shaft (points[2..5]) + 2 for the arrowhead triangle
        expect(countOf(ctx, 'lineTo')).toBe(4)
        expect(countOf(ctx, 'restore')).toBe(1)
    })
})

describe('pdf_makeKonvaGrid', () => {
    const baseShape = () => ({
        x: 0,
        y: 0,
        stroke: '#ffffff',
        shapedetails: { width: 50, height: 40, hspacing: 10, vspacing: 10, strokeWidth: 1, opacity: 1 },
    })

    it('saves and restores the context', () => {
        const ctx = mockContext()
        pdf_makeKonvaGrid(ctx, baseShape(), 1, 1)
        // One outer save/restore pair plus beginPath/stroke per grid line
        expect(ctx.calls[0].fn).toBe('save')
        expect(fns(ctx).at(-1)).toBe('restore')
        expect(countOf(ctx, 'save')).toBe(1)
        expect(countOf(ctx, 'restore')).toBe(1)
    })

    it('draws the expected number of vertical and horizontal lines', () => {
        const ctx = mockContext()
        // width 50 / hspacing 10 => 5 cells => 6 vertical lines
        // height 40 / vspacing 10 => 4 cells => 5 horizontal lines
        pdf_makeKonvaGrid(ctx, baseShape(), 1, 1)
        expect(countOf(ctx, 'beginPath')).toBe(6 + 5)
    })

    it('falls back to one line per direction on a zero-size grid', () => {
        const ctx = mockContext()
        const shape = baseShape()
        // spacing falls back to size/10, but with a zero-size grid nothing is
        // positive: a single line per direction is drawn instead
        shape.shapedetails.width = 0
        shape.shapedetails.height = 0
        pdf_makeKonvaGrid(ctx, shape, 1, 1)
        // width/height 0 -> vLines = hLines = 0, each loop runs once (i = 0)
        expect(countOf(ctx, 'beginPath')).toBe(2)
    })

    it('translates the context into the grid origin', () => {
        const ctx = mockContext()
        const shape = baseShape()
        shape.x = 0.25
        shape.y = 0.5
        pdf_makeKonvaGrid(ctx, shape, 2, 4)
        const translate = ctx.calls.find((c) => c.fn === 'translate')
        expect(translate.args).toEqual([0.25 * 2 * 100, 0.5 * 4 * 100])
    })
})
