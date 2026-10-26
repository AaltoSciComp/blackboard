import { describe, expect, it } from 'vitest';
import { getClosestPointIndexWithinRadius, getPolylinePenUpAction, shouldRecordDrawingPoint } from './drawingPoints.js';

describe('shouldRecordDrawingPoint', () => {
    const previousPoint = [100, 0.2, 0.3];

    it('requires both the elapsed-time and distance thresholds', () => {
        expect(shouldRecordDrawingPoint(previousPoint, 128, 0.22, 0.31, 28, 0.02)).toBe(true);
        expect(shouldRecordDrawingPoint(previousPoint, 127, 0.22, 0.31, 28, 0.02)).toBe(false);
        expect(shouldRecordDrawingPoint(previousPoint, 128, 0.21, 0.31, 28, 0.02)).toBe(false);
    });

    it('uses an inclusive time boundary and a strict distance boundary', () => {
        expect(shouldRecordDrawingPoint(previousPoint, 128, 0.22, 0.3, 28, 0.02)).toBe(false);
        expect(shouldRecordDrawingPoint(previousPoint, 128, 0.220001, 0.3, 28, 0.02)).toBe(true);
    });
});

describe('getClosestPointIndexWithinRadius', () => {
    it('returns the closest point inside the radius', () => {
        expect(getClosestPointIndexWithinRadius(
            [{ x: 2, y: 0 }, { x: 5, y: 0 }, { x: 3, y: 0 }],
            0,
            0,
            4
        )).toBe(0);
    });

    it('excludes points on the radius and returns -1 when none qualify', () => {
        expect(getClosestPointIndexWithinRadius([{ x: 3, y: 4 }], 0, 0, 5)).toBe(-1);
        expect(getClosestPointIndexWithinRadius([], 0, 0, 5)).toBe(-1);
    });

    it('keeps the first point when candidates are equally close', () => {
        expect(getClosestPointIndexWithinRadius([{ x: -1, y: 0 }, { x: 1, y: 0 }], 0, 0, 2)).toBe(0);
    });
});

describe('getPolylinePenUpAction', () => {
    it('discards a too-close unfinished point and removes it only when unsaved', () => {
        expect(getPolylinePenUpAction(0.01, 0.02, false, 8, 3)).toEqual({ action: 'discard', removeLastPoint: true });
        expect(getPolylinePenUpAction(0.01, 0.02, false, 6, 3)).toEqual({ action: 'discard', removeLastPoint: false });
    });

    it('keeps an unfinished point at the exact distance threshold as an intermediate', () => {
        expect(getPolylinePenUpAction(0.02, 0.02, false, 8, 3)).toEqual({ action: 'intermediate' });
    });

    it('finishes only polylines with at least three coordinate pairs', () => {
        expect(getPolylinePenUpAction(0, 0.02, true, 6, 2)).toEqual({ action: 'finish' });
        expect(getPolylinePenUpAction(0, 0.02, true, 4, 2)).toEqual({ action: 'too-short' });
    });
});