import { describe, expect, it, vi } from 'vitest';
import { getViewerHelperGridSpec } from './viewerGrid.js';
import { debounce } from './viewerCore.js';

describe('getViewerHelperGridSpec', () => {
    it('computes line coordinates from percentage cell sizes', () => {
        // 1000x500 layer: hSpacing = 500 * 10% = 50, vSpacing = 1000 * 10% = 100
        const spec = getViewerHelperGridSpec(1000, 500, {
            cellWidth: 10,
            cellHeight: 10,
            stroke: '#123456',
            strokeWidth: 0.1,
            opacity: 0.8,
        });

        // 500/50 = 10 horizontal + 1000/100 = 10 vertical lines
        expect(spec.lines).toHaveLength(20);
        // Horizontal lines run the full width, vertical lines the full height
        expect(spec.lines[0]).toEqual({ x: 0, y: 50, points: [0, 0, 1000, 0] });
        expect(spec.lines[10]).toEqual({ x: 100, y: 0, points: [0, 0, 0, 500] });
        expect(spec.stroke).toBe('#123456');
        expect(spec.strokeWidth).toBe(1); // 0.1 pct of 1000 = 1
        expect(spec.opacity).toBe(0.8);
    });

    it('falls back to default cells, stroke and opacity', () => {
        const spec = getViewerHelperGridSpec(800, 600, {});

        // Defaults: cellWidth 38, cellHeight 20 -> vSpacing 304, hSpacing 120
        expect(spec.lines.filter(l => l.x === 0)).toHaveLength(Math.floor(600 / 120));
        expect(spec.lines.filter(l => l.y === 0)).toHaveLength(Math.floor(800 / 304));
        expect(spec.stroke).toBe('#fff');
        expect(spec.strokeWidth).toBe(1); // Number(NaN) || 1
        expect(spec.opacity).toBe(0.5);
    });

    it('returns no lines when spacing exceeds the layer size', () => {
        const spec = getViewerHelperGridSpec(100, 100, { cellWidth: 200, cellHeight: 200 });
        expect(spec.lines).toEqual([]);
    });
});

describe('debounce', () => {
    it('collapses rapid calls into one deferred invocation', async () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced(1);
        debounced(2);
        debounced(3);
        expect(fn).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(999);
        expect(fn).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith(3);

        vi.useRealTimers();
    });
});
