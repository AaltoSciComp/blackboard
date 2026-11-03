import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createWetInk, getControlPoints } from './wetInk.js';

// jsdom canvas has no 2D context implementation; stub a recording context so
// we can assert the exact path commands issued (the fidelity contract).
function makeRecordingCtx() {
    const ops = [];
    const ctx = {};
    for (const name of [
        'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo',
        'stroke', 'clearRect', 'setTransform', 'save', 'restore', 'rect', 'clip',
    ]) {
        ctx[name] = vi.fn((...args) => ops.push({ name, args }));
    }
    let strokeStyle = '', lineWidth = 0, lineCap = '', lineJoin = '';
    Object.defineProperty(ctx, 'strokeStyle', { get: () => strokeStyle, set: (v) => { strokeStyle = v; ops.push({ name: 'strokeStyle', args: [v] }); } });
    Object.defineProperty(ctx, 'lineWidth', { get: () => lineWidth, set: (v) => { lineWidth = v; ops.push({ name: 'lineWidth', args: [v] }); } });
    Object.defineProperty(ctx, 'lineCap', { get: () => lineCap, set: (v) => { lineCap = v; } });
    Object.defineProperty(ctx, 'lineJoin', { get: () => lineJoin, set: (v) => { lineJoin = v; } });
    ctx._ops = ops;
    return ctx;
}

function makeCanvas() {
    const canvas = { width: 0, height: 0, style: {}, getContext: () => recordingCtx };
    return canvas;
}

let recordingCtx;

beforeEach(() => {
    recordingCtx = makeRecordingCtx();
});

describe('getControlPoints', () => {
    it('matches Konva Catmull-Rom control point math', () => {
        // Konva: fa = t*d01/dSum; p1 = p1 - fa*(p2-p0); p2 = p1 + fb*(p2-p0)
        const [p1x, p1y, p2x, p2y] = getControlPoints(0, 0, 10, 0, 20, 10, 0.3);
        const d01 = 10, d12 = Math.sqrt(100 + 100), dSum = d01 + d12;
        const fa = (0.3 * d01) / dSum, fb = (0.3 * d12) / dSum;
        // p1 = p1 - fa*(p2-p0); p2 = p1 + fb*(p2-p0)  (p1 = the middle point)
        expect(p1x).toBeCloseTo(10 - fa * 20, 10);
        expect(p1y).toBeCloseTo(0 - fa * 10, 10);
        expect(p2x).toBeCloseTo(10 + fb * 20, 10);
        expect(p2y).toBeCloseTo(0 + fb * 10, 10);
    });

    it('collapses control points when all three points coincide', () => {
        expect(getControlPoints(5, 5, 5, 5, 5, 5, 0.3)).toEqual([5, 5, 5, 5]);
    });
});

describe('wet ink straight-line mode (<=4 points)', () => {
    it('redraws the full polyline on every point (control points are context-dependent)', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#fff', strokeWidth: 3 }, 0, false);

        session.addPoint(10, 10);
        session.addPoint(20, 20);
        session.addPoint(30, 10);

        const strokes = recordingCtx._ops.filter(op => op.name === 'stroke');
        expect(strokes.length).toBe(3); // one stroke per addPoint
        // Each redraw traces the whole polyline from p0
        const moveTos = recordingCtx._ops.filter(op => op.name === 'moveTo');
        expect(moveTos.length).toBe(3); // one per stroke, all starting at p0
        expect(moveTos.every(m => m.args[0] === 10 && m.args[1] === 10)).toBe(true);
        const lineTos = recordingCtx._ops.filter(op => op.name === 'lineTo');
        expect(lineTos.length).toBe(3); // 0 + 1 + 2 lineTos across the redraws
        // (full trace: every redraw starts at p0, so no stale fragments)
    });

    it('collects points for the committed Konva shape', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#fff', strokeWidth: 3 }, 0, false);
        session.addPoint(1, 2);
        session.addPoint(3, 4);
        expect(session.getPoints()).toEqual([1, 2, 3, 4]);
        expect(session.getPointCount()).toBe(2);
    });
});

describe('wet ink tension mode (>4 points, the app default)', () => {
    it('uses quadratic first/last caps and cubic middle segments like Konva', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#fff', strokeWidth: 3 }, 0.3, true);
        // 6 points -> interior points 1..4 -> tension path active
        const pts = [[0, 0], [10, 5], [20, 0], [30, 8], [40, 2], [50, 10]];
        pts.forEach(([x, y]) => session.addPoint(x, y));

        // Only the LAST redraw's ops matter (earlier ones were cleared):
        // 1 quadratic start cap + cubic middles + 1 quadratic end cap.
        // 6 points -> 4 interior triples -> 3 cubics between the caps.
        const strokeIdxs = recordingCtx._ops.map((op, i) => op.name === 'stroke' ? i : -1).filter(i => i >= 0);
        const lastPass = recordingCtx._ops.slice(strokeIdxs[strokeIdxs.length - 2] + 1, strokeIdxs[strokeIdxs.length - 1] + 1);
        const quads = lastPass.filter(op => op.name === 'quadraticCurveTo');
        const cubics = lastPass.filter(op => op.name === 'bezierCurveTo');
        expect(quads.length).toBe(2); // start + end caps
        expect(cubics.length).toBe(3); // middle segments (4 interior triples -> 3 cubics)

        // Fidelity: every interior point must be a cubic ENDPOINT (not a
        // control point). Konva's cubic walk starts at tp[4] so that
        // cp1 = cp2 of the previous triple, cp2 = cp1 of the next triple,
        // end = the point itself. Getting this wrong shows up as spikes
        // overshooting tangentially on turns.
        const p2 = [20, 0], p3 = [30, 8], p4 = [40, 2];
        const cubicEnds = cubics.map(op => [op.args[4], op.args[5]]);
        expect(cubicEnds).toContainEqual(p2);
        expect(cubicEnds).toContainEqual(p3);
        expect(cubicEnds).toContainEqual(p4);
        // And no cubic may END at a control point of the spline
        const controlPoints = lastPass
            .filter(op => op.name === 'bezierCurveTo')
            .flatMap(op => [[op.args[0], op.args[1]], [op.args[2], op.args[3]]]);
        for (const end of cubicEnds) {
            expect(controlPoints).not.toContainEqual(end);
        }
    });

    it('clears stale ink before every redraw (no double-line ghosting)', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#fff', strokeWidth: 3 }, 0.3, true);
        const pts = [[0, 0], [10, 5], [20, 0], [30, 8], [40, 2], [50, 10]];
        pts.forEach(([x, y]) => session.addPoint(x, y));

        // Every addPoint after the first must clearRect before stroking,
        // otherwise stale curve fragments accumulate (the two-lines bug).
        const ops = recordingCtx._ops;
        let lastClear = -1, lastStroke = -1, clearBeforeEveryStroke = true;
        for (let i = 0; i < ops.length; i++) {
            if (ops[i].name === 'clearRect') lastClear = i;
            if (ops[i].name === 'stroke') {
                if (lastStroke >= 0 && lastClear < lastStroke) clearBeforeEveryStroke = false;
                lastStroke = i;
            }
        }
        expect(clearBeforeEveryStroke).toBe(true);
    });
});

describe('wet ink bezier mode (bezier=true, tension=0)', () => {
    it('consumes points as cubic segments of 6 values like Konva', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#fff', strokeWidth: 3 }, 0, true);
        // 7 points: p0 + 6 values = one cubic segment (p1..p3 as cp1/cp2/end)
        const pts = [[0, 0], [10, 5], [20, 0], [30, 8], [40, 2], [50, 10], [60, 4]];
        pts.forEach(([x, y]) => session.addPoint(x, y));

        const strokeIdxs = recordingCtx._ops.map((op, i) => op.name === 'stroke' ? i : -1).filter(i => i >= 0);
        const lastPass = recordingCtx._ops.slice(strokeIdxs[strokeIdxs.length - 2] + 1, strokeIdxs[strokeIdxs.length - 1] + 1);
        const cubics = lastPass.filter(op => op.name === 'bezierCurveTo');
        // Konva bezier branch: cubic per 6 values from n=2. 7 points = 12
        // values after p0 -> 2 cubics.
        expect(cubics.length).toBe(2);
        // First cubic: cp1=p1, cp2=p2, end=p3 (raw points, no tension math)
        expect(cubics[0].args).toEqual([10, 5, 20, 0, 30, 8]);
        expect(cubics[1].args).toEqual([40, 2, 50, 10, 60, 4]);
        // And no lineTos in bezier mode
        expect(lastPass.filter(op => op.name === 'lineTo').length).toBe(0);
    });
});

describe('stable prefix + live tail', () => {
    it('tail follows the cursor but is NOT part of the committed points', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#fff', strokeWidth: 3 }, 0.3, true);

        session.addPoint(0, 0);      // recorded (stable)
        session.setTail(50, 60);     // raw cursor move (preview only)
        session.setTail(70, 80);     // another raw move

        // Committed geometry = recorded points only
        expect(session.getPoints()).toEqual([0, 0]);
        expect(session.getPointCount()).toBe(1);

        // The tail IS rendered (as a segment to the cursor)
        const lineTos = recordingCtx._ops.filter(op => op.name === 'lineTo');
        expect(lineTos.some(op => op.args[0] === 70 && op.args[1] === 80)).toBe(true);
    });

    it('a new recorded point absorbs the tail (tail resets to null)', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#fff', strokeWidth: 3 }, 0.3, true);

        session.addPoint(0, 0);
        session.setTail(50, 60);
        session.addPoint(50, 60);   // cursor position becomes recorded

        expect(session.getPoints()).toEqual([0, 0, 50, 60]);
        // After absorbing, no tail segment to the old position is drawn
        const strokeIdxs = recordingCtx._ops.map((op, i) => op.name === 'stroke' ? i : -1).filter(i => i >= 0);
        const lastPass = recordingCtx._ops.slice(strokeIdxs[strokeIdxs.length - 2] + 1, strokeIdxs[strokeIdxs.length - 1] + 1);
        expect(lastPass.filter(op => op.name === 'lineTo' && op.args[0] === 50 && op.args[1] === 60).length).toBe(0);
    });

    it('recorded points are stable: later tail moves do not change them', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#fff', strokeWidth: 3 }, 0.3, true);

        session.addPoint(0, 0);
        session.addPoint(10, 5);
        const pointsBefore = session.getPoints();
        session.setTail(500, 500);
        session.setTail(-500, -500);
        expect(session.getPoints()).toEqual(pointsBefore);
    });
});

describe('session lifecycle', () => {
    it('clear() resets points and clears the canvas', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#fff', strokeWidth: 3 }, 0.3, true);
        session.addPoint(1, 2);
        session.addPoint(3, 4);
        session.clear();
        expect(session.getPointCount()).toBe(0);
        expect(recordingCtx._ops.some(op => op.name === 'clearRect')).toBe(true);
    });

    it('resize() scales the canvas by pixel ratio and sets the transform', () => {
        const canvas = makeCanvas();
        const session = createWetInk(canvas, { stroke: '#fff', strokeWidth: 3 });
        session.resize(800, 600, 2);
        expect(canvas.width).toBe(1600);
        expect(canvas.height).toBe(1200);
        expect(canvas.style.width).toBe('800px');
        expect(recordingCtx._ops.some(op => op.name === 'setTransform' && op.args[0] === 2)).toBe(true);
    });

    it('applies stroke style on begin', () => {
        const session = createWetInk(makeCanvas(), { stroke: '#fff', strokeWidth: 3 });
        session.begin({ stroke: '#123456', strokeWidth: 7 }, 0.3, true);
        const styleOps = recordingCtx._ops.filter(op => op.name === 'strokeStyle');
        expect(styleOps[styleOps.length - 1].args[0]).toBe('#123456');
        const widthOps = recordingCtx._ops.filter(op => op.name === 'lineWidth');
        expect(widthOps[widthOps.length - 1].args[0]).toBe(7);
    });
});
