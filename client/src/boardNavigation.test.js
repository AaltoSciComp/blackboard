import { describe, expect, it } from 'vitest';
import { getBoardDirectionFromSwipe, getBoardLimitsForCurrentBoard, getBoardNavigationTarget, getShapeHistoryActionFromSwipe } from './boardNavigation.js';

describe('getBoardLimitsForCurrentBoard', () => {
    it.each([
        [2, { from: 4, to: 6, end: 8 }, { from: 2, to: 4, end: 8 }],
        [8, { from: 4, to: 6, end: 8 }, { from: 6, to: 8, end: 8 }],
        [5, { from: 4, to: 6, end: 8 }, { from: 4, to: 6, end: 8 }],
        [11, { from: 4, to: 6, end: 8 }, { from: 9, to: 11, end: 11 }],
    ])('updates the visible window for board %i', (currentBoard, limits, expected) => {
        expect(getBoardLimitsForCurrentBoard(currentBoard, 3, limits)).toEqual(expected);
    });
});

describe('getBoardNavigationTarget', () => {
    const boardLimits = { end: 8 };

    it.each([
        ['next', 3, 4, true],
        ['previous', 3, 2, true],
        ['previous', 1, 1, false],
        ['down', 6, 3, true],
        ['down', 2, 1, true],
        ['up', 6, 8, true],
        ['last', 8, 8, false],
        ['first', 4, 1, true],
        ['unknown', 1, 1, false],
    ])('returns the target and changed flag for %s from board %i', (direction, currentBoard, target, changed) => {
        expect(getBoardNavigationTarget(direction, currentBoard, 9, boardLimits)).toEqual({
            new: target,
            changed,
        });
    });
});

describe('getBoardDirectionFromSwipe', () => {
    it.each([
        [60, 0, 'previous'],
        [-60, 0, 'next'],
        [0, 40, 'down'],
        [0, -40, 'up'],
        [80, 40, 'previous'],
        [40, 40, 'down'],
        [50, 0, null],
        [-50, 0, null],
        [0, 30, null],
        [0, -30, null],
    ])('maps swipe displacement (%i, %i) to %s', (swipeX, swipeY, direction) => {
        expect(getBoardDirectionFromSwipe(swipeX, swipeY)).toBe(direction);
    });
});

describe('getShapeHistoryActionFromSwipe', () => {
    it.each([
        [60, 0, 'undo'],
        [-60, 0, 'redo'],
        [50, 0, null],
        [-50, 0, null],
        [0, 60, null],
        [100, 120, null],
        [40, 40, null],
    ])('maps horizontal swipe (%i, %i) to %s', (swipeX, swipeY, action) => {
        expect(getShapeHistoryActionFromSwipe(swipeX, swipeY)).toBe(action);
    });
});