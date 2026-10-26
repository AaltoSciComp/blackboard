import { describe, expect, it } from 'vitest';
import {
    enqueueShapeDeletion,
    enqueueShapeRecolor,
    takeShapeDeletionBatch,
    takeShapeRecolorBatch,
} from './shapeMutationQueue.js';

describe('shape mutation queue', () => {
    it('deduplicates deletion ids and drains the current batch', () => {
        const queue = new Set();
        enqueueShapeDeletion(queue, 12n);
        enqueueShapeDeletion(queue, 12n);
        enqueueShapeDeletion(queue, 13n);

        expect(takeShapeDeletionBatch(queue)).toEqual([12n, 13n]);
        expect(queue.size).toBe(0);
    });

    it('keeps work queued after a deletion batch is taken', () => {
        const queue = new Set([20n]);

        expect(takeShapeDeletionBatch(queue)).toEqual([20n]);
        enqueueShapeDeletion(queue, 21n);

        expect(takeShapeDeletionBatch(queue)).toEqual([21n]);
    });

    it('groups recolor ids by color and avoids duplicate ids', () => {
        const queue = {};
        enqueueShapeRecolor(queue, '#123456', 4n);
        enqueueShapeRecolor(queue, '#123456', 4n);
        enqueueShapeRecolor(queue, '#123456', 5n);
        enqueueShapeRecolor(queue, '#abcdef', 6n);

        expect(takeShapeRecolorBatch(queue)).toEqual({ color: '#123456', databaseIds: [4n, 5n] });
        expect(queue).toEqual({ '#abcdef': [6n] });
        expect(takeShapeRecolorBatch(queue)).toEqual({ color: '#abcdef', databaseIds: [6n] });
        expect(takeShapeRecolorBatch(queue)).toBeNull();
    });

    it('ignores falsy database ids', () => {
        const deletions = new Set();
        const recolors = {};

        expect(enqueueShapeDeletion(deletions, 0n)).toBe(false);
        expect(enqueueShapeRecolor(recolors, '#123456', 0n)).toBe(false);
        expect(deletions.size).toBe(0);
        expect(recolors).toEqual({});
    });
});