import { describe, expect, it } from 'vitest';
import { DEF_BOARD } from './constants.js';
import { getSafeBoardSettings } from './boardSettings.js';

describe('getSafeBoardSettings', () => {
    it('fills missing background and grid settings from defaults', () => {
        expect(getSafeBoardSettings({})).toEqual(DEF_BOARD.settings);
        expect(getSafeBoardSettings({ bg: {}, grid: {} })).toEqual(DEF_BOARD.settings);
    });

    it('preserves explicitly saved falsy values', () => {
        expect(getSafeBoardSettings({
            bg: { visible: false, url: '' },
            grid: { visible: false, strokeWidth: 0, opacity: 0, cellWidth: 0, snap: false },
        })).toEqual({
            bg: { visible: false, url: '' },
            grid: {
                ...DEF_BOARD.settings.grid,
                visible: false,
                strokeWidth: 0,
                opacity: 0,
                cellWidth: 0,
                snap: false,
            },
        });
    });

    it('preserves saved values and supplies only absent fields', () => {
        expect(getSafeBoardSettings({
            bg: { visible: true, url: '/image.png' },
            grid: { stroke: '#123456', cellHeight: 12, square: false },
        })).toEqual({
            bg: { visible: true, url: '/image.png' },
            grid: {
                ...DEF_BOARD.settings.grid,
                stroke: '#123456',
                cellHeight: 12,
                square: false,
            },
        });
    });
});