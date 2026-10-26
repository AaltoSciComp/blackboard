import { describe, expect, it } from 'vitest';
import { createSessionSettings } from './sessionSettings.js';

describe('createSessionSettings', () => {
    it('combines active board limits and current UI, line, and laser settings', () => {
        const ui = { complex: false, showFps: true };
        const lineProperties = { width: 0.2, bezier: true };
        const laserProperties = { size: 2, color: '#ff0000' };

        expect(createSessionSettings(7, { from: 5, to: 8, end: 10 }, 4, ui, lineProperties, laserProperties)).toEqual({
            boards: { ab: 7, sb: 5, nvb: 4 },
            ui,
            line: lineProperties,
            laser: laserProperties,
        });
    });
});