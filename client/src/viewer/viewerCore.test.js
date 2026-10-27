import { describe, expect, it } from 'vitest';
import {
    boardIsInView,
    getBoardGridConfig,
    getPhysicalCanvasId,
    getViewRange,
    makeChainable,
} from './viewerCore.js';

describe('getBoardGridConfig', () => {
    it.each([
        [1, { rows: 1, cols: 1 }],
        [2, { rows: 2, cols: 1 }],
        [4, { rows: 2, cols: 2 }],
        [9, { rows: 3, cols: 3 }],
        [16, { rows: 4, cols: 4 }],
    ])('returns the layout for %i visible boards', (nvb, expected) => {
        expect(getBoardGridConfig(nvb)).toEqual(expected);
    });

    it('falls back to a single board for unsupported values', () => {
        expect(getBoardGridConfig(3)).toEqual({ rows: 1, cols: 1 });
        expect(getBoardGridConfig(0)).toEqual({ rows: 1, cols: 1 });
        expect(getBoardGridConfig('bogus')).toEqual({ rows: 1, cols: 1 });
    });
});

describe('getViewRange', () => {
    it('spans numVisBoards boards from the presenter starting board', () => {
        expect(getViewRange(5, 4, 0)).toEqual({ from: 5, to: 8 });
    });

    it('shifts the view by whole pages when an offset is set', () => {
        expect(getViewRange(5, 4, 2)).toEqual({ from: 13, to: 16 });
        expect(getViewRange(9, 4, -1)).toEqual({ from: 5, to: 8 });
    });

    it('never starts before board 1', () => {
        // 1 + (-1 * 4) = -3 -> clamp to 1..numVisBoards
        expect(getViewRange(1, 4, -1)).toEqual({ from: 1, to: 4 });
        // 3 + (-1 * 2) = 1 -> exactly 1 is allowed
        expect(getViewRange(3, 2, -1)).toEqual({ from: 1, to: 2 });
    });
});

describe('getPhysicalCanvasId', () => {
    it('maps logical boards inside the view to 1-based canvas indexes', () => {
        expect(getPhysicalCanvasId(5, 5, 8)).toBe(1);
        expect(getPhysicalCanvasId(8, 5, 8)).toBe(4);
    });

    it('returns null for boards outside the view', () => {
        expect(getPhysicalCanvasId(4, 5, 8)).toBeNull();
        expect(getPhysicalCanvasId(9, 5, 8)).toBeNull();
    });
});

describe('boardIsInView', () => {
    it.each([
        [5, true],
        [8, true],
        [4, false],
        [9, false],
    ])('reports board %i against the view 5..8', (board, expected) => {
        expect(boardIsInView(board, 5, 8)).toBe(expected);
    });
});

describe('makeChainable', () => {
    it('runs calls strictly one at a time in call order', async () => {
        const order = [];
        let releaseFirst;
        const first = new Promise((resolve) => { releaseFirst = resolve; });

        const fn = makeChainable(async (label, blocker) => {
            order.push('start:' + label);
            if (blocker) await blocker;
            order.push('end:' + label);
        });

        const p1 = fn('a', first);
        const p2 = fn('b');

        // Give the microtask queue a chance to start call "a"
        await Promise.resolve();
        expect(order).toEqual(['start:a']);

        releaseFirst();
        await Promise.all([p1, p2]);
        expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
    });

    it('keeps the chain alive after a rejection and resolves later calls', async () => {
        const fn = makeChainable(async (fail) => {
            if (fail) throw new Error('boom');
            return 'ok';
        });

        const failing = fn(true);
        const next = fn(false);

        await expect(failing).rejects.toThrow('boom');
        // The chain continues: the second call still runs after the first settles
        await expect(next).resolves.toBe('ok');
    });
});
