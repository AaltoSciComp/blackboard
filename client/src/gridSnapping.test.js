import { describe, expect, it } from 'vitest';
import { SQRT2_DIV2 } from './constants.js';
import { getEllipseSnapOffset, getGridBlockSize, getGridSnappedCoordinates, getSnappedAnchorPosition } from './gridSnapping.js';

describe('getGridBlockSize', () => {
    it('calculates horizontal and vertical grid spacing independently', () => {
        expect(getGridBlockSize(
            { width: 800, height: 600 },
            { cellWidth: 5, cellHeight: 10 }
        )).toEqual({ x: '40.00000', y: '60.00000' });
    });

    it('rounds calculated spacing to five decimal places', () => {
        expect(getGridBlockSize(
            { width: 1366, height: 768 },
            { cellWidth: 2.5, cellHeight: 3.3 }
        )).toEqual({ x: '34.15000', y: '25.34400' });
    });
});

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

describe('getSnappedAnchorPosition', () => {
    const gridBlockSize = { x: 100, y: 80 };
    const oldPosition = { x: 15, y: 16 };

    it.each([
        [{ x: 104, y: 17 }, { x: 100, y: 16 }],
        [{ x: 14, y: 79 }, { x: 15, y: 80 }],
        [{ x: 104, y: 79 }, { x: 100, y: 80 }],
        [{ x: 30, y: 35 }, { x: 30, y: 35 }],
    ])('constrains proposed anchor position %j to %j', (newPosition, expected) => {
        expect(getSnappedAnchorPosition(oldPosition, newPosition, gridBlockSize)).toEqual(expected);
    });

    it('does not snap when the distance equals the tolerance', () => {
        expect(getSnappedAnchorPosition(oldPosition, { x: 90, y: 16 }, gridBlockSize)).toEqual({ x: 90, y: 16 });
    });
});

describe('getEllipseSnapOffset', () => {
    const gridBlockSize = { x: 100, y: 80 };

    it('offsets center-based ellipse coordinates when half dimensions are off grid', () => {
        expect(getEllipseSnapOffset(40, 40, gridBlockSize)).toEqual({ x: 50, y: 40 });
    });

    it('does not offset dimensions aligned with grid lines or at strict thresholds', () => {
        expect(getEllipseSnapOffset(200, 160, gridBlockSize)).toEqual({ x: 0, y: 0 });
        expect(getEllipseSnapOffset(20, 16, gridBlockSize)).toEqual({ x: 0, y: 0 });
        expect(getEllipseSnapOffset(180, 144, gridBlockSize)).toEqual({ x: 0, y: 0 });
    });

    it('uses absolute dimensions', () => {
        expect(getEllipseSnapOffset(-40, -40, gridBlockSize)).toEqual({ x: 50, y: 40 });
    });
});