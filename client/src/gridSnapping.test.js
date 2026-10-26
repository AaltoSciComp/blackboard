import { describe, expect, it } from 'vitest';
import { SQRT2_DIV2 } from './constants.js';
import { getGridSnappedCoordinates } from './gridSnapping.js';

describe('getGridSnappedCoordinates', () => {
    const gridBlockSize = { x: 10, y: 20 };

    it('rounds positive coordinates to the nearest grid intersections', () => {
        expect(getGridSnappedCoordinates(24, 29, gridBlockSize)).toEqual([20, 20]);
        expect(getGridSnappedCoordinates(26, 31, gridBlockSize)).toEqual([30, 40]);
    });

    it('rounds negative coordinates using the same grid spacing', () => {
        expect(getGridSnappedCoordinates(-16, -31, gridBlockSize)).toEqual([-20, -40]);
    });

    it('uses reduced spacing for the diagonal-adjusted mode', () => {
        expect(getGridSnappedCoordinates(12, 22, gridBlockSize, true)).toEqual([
            Math.round(12 / (10 * SQRT2_DIV2)) * (10 * SQRT2_DIV2),
            Math.round(22 / (20 * SQRT2_DIV2)) * (20 * SQRT2_DIV2),
        ]);
    });
});