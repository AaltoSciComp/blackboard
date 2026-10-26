import { describe, expect, it } from 'vitest';
import { getToolSettingsUpdates } from './toolSettings.js';

describe('getToolSettingsUpdates', () => {
    const lineProperties = { width: 0.25, bezier: false, lineTension: 0.3 };

    it.each([
        [null, true],
        ['true', true],
        ['false', false],
    ])('restores the Line smoothing preference %s', (savedBezier, expectedBezier) => {
        expect(getToolSettingsUpdates({ name: 'Line' }, lineProperties, savedBezier)).toEqual({
            lineProperties: { ...lineProperties, bezier: expectedBezier },
            snapToGrid: false,
        });
    });

    it('disables smoothing for Polyline without changing other line properties', () => {
        expect(getToolSettingsUpdates({ name: 'Polyline' }, lineProperties, 'true')).toEqual({
            lineProperties: { ...lineProperties, bezier: false },
            snapToGrid: false,
        });
    });

    it('enables grid snapping when Grid is selected', () => {
        expect(getToolSettingsUpdates({ name: 'Grid' }, lineProperties, null)).toEqual({
            lineProperties: null,
            snapToGrid: true,
        });
    });

    it('leaves line settings unchanged for other tools', () => {
        expect(getToolSettingsUpdates({ name: 'Ellipse' }, lineProperties, null)).toEqual({
            lineProperties: null,
            snapToGrid: false,
        });
    });
});