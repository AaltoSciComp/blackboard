import { describe, expect, it } from 'vitest';
import { getInitialBoardConfiguration } from './initialBoardConfig.js';

describe('getInitialBoardConfiguration', () => {
    it('parses saved board settings and derives limits from the largest board id', () => {
        expect(getInitialBoardConfiguration(
            { nvb: '4', ab: '7', sb: '5' },
            [{ boardid: '1' }, { boardid: '9' }, { boardid: '6' }]
        )).toEqual({
            numBoards: 4,
            activeBoard: 7,
            startBoard: 5,
            boardLimits: { from: 5, to: 8, end: 9 },
        });
    });

    it('uses board one as the end when no positive board ids exist', () => {
        expect(getInitialBoardConfiguration(
            { nvb: '3', ab: '1', sb: '1' },
            [{ boardid: '0' }, { boardid: '-2' }]
        ).boardLimits).toEqual({ from: 1, to: 3, end: 1 });
    });
});