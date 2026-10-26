import { describe, expect, it } from 'vitest';
import { getSimpleModeUpdates } from './uiMode.js';

describe('getSimpleModeUpdates', () => {
    it('switches unsupported settings to simple-mode-compatible values', () => {
        const currentTool = { name: 'Ellipse', label: 'Ellipse', simple: false };
        const fill = { color: '#123456', enabled: true };
        const stroke = { color: '#abcdef', enabled: false };
        const ui = { complex: true, mouse: true };
        const drawTool = { name: 'Line', label: 'Draw', simple: true };

        expect(getSimpleModeUpdates(currentTool, fill, stroke, ui, drawTool)).toEqual({
            tool: drawTool,
            fill: { color: '#123456', enabled: false },
            stroke: { color: '#abcdef', enabled: true },
            ui: { complex: false, mouse: true },
        });
    });

    it('leaves compatible tool, fill, and stroke unchanged', () => {
        const currentTool = { name: 'Line', simple: true };
        const fill = { color: '#123456', enabled: false };
        const stroke = { color: '#abcdef', enabled: true };
        const ui = { complex: true, mouse: false };

        expect(getSimpleModeUpdates(currentTool, fill, stroke, ui, { name: 'Line' })).toEqual({
            tool: null,
            fill: null,
            stroke: null,
            ui: { complex: false, mouse: false },
        });
    });
});