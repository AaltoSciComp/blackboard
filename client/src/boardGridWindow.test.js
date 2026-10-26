import { describe, expect, it } from 'vitest';
import { getBoardGridWindow } from './boardGridWindow.js';

describe('getBoardGridWindow', () => {
    it.each([
        [1, 4, { from: 1, to: 4 }],
        [10, 4, { from: 7, to: 10 }],
        [3, 1, { from: 3, to: 3 }],
    ])('keeps the current board at the end of the visible range', (currentBoard, visibleBoardCount, expected) => {
        expect(getBoardGridWindow(currentBoard, visibleBoardCount)).toEqual(expected);
    });
});