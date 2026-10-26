import { describe, expect, it } from 'vitest';
import { DEF_BOARD } from './constants.js';
import { getBoardPropertyUpdate, getSafeBoardSettings } from './boardSettings.js';

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

describe('getBoardPropertyUpdate', () => {
    it('keeps square grid dimensions matched when changing cell width or height', () => {
        const boardSettings = {
            ...DEF_BOARD,
            settings: {
                ...DEF_BOARD.settings,
                grid: { ...DEF_BOARD.settings.grid, square: true, aspect: 1 },
            },
        };

        expect(getBoardPropertyUpdate(boardSettings, 'grid', 'cellWidth', 4, { width: 800, height: 600 })).toEqual({
            boardSettings: {
                ...boardSettings,
                settings: { ...boardSettings.settings, grid: { ...boardSettings.settings.grid, cellWidth: 4, cellHeight: 5 } },
            },
            pending: false,
        });
        expect(getBoardPropertyUpdate(boardSettings, 'grid', 'cellHeight', 2, { width: 800, height: 600 }).boardSettings.settings.grid.cellWidth).toBe(2);
    });

    it('sets pending only for grid visibility or aspect changes', () => {
        const visibleUpdate = getBoardPropertyUpdate(DEF_BOARD, 'grid', 'visible', true, { width: 800, height: 600 });
        const opacityUpdate = getBoardPropertyUpdate(DEF_BOARD, 'grid', 'opacity', 0.5, { width: 800, height: 600 });

        expect(visibleUpdate.boardSettings.settings.grid.visible).toBe(true);
        expect(visibleUpdate.pending).toBe(true);
        expect(opacityUpdate.boardSettings.settings.grid.opacity).toBe(0.5);
        expect(opacityUpdate.pending).toBe(false);
    });

    it('hides the background when its URL is cleared and rejects unknown settings groups', () => {
        expect(getBoardPropertyUpdate({
            ...DEF_BOARD,
            settings: { ...DEF_BOARD.settings, bg: { url: '/image.png', visible: true } },
        }, 'bg', 'url', '', { width: 800, height: 600 })).toMatchObject({
            boardSettings: { settings: { bg: { url: '', visible: false } } },
            pending: true,
        });
        expect(getBoardPropertyUpdate(DEF_BOARD, 'unknown', 'value', true, { width: 800, height: 600 })).toBeNull();
    });
});