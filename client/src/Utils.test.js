import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createOutlineClone,
    getPresenterToken,
    getUsedColors,
    isValidUrl,
    makeKonvaGrid,
    pctToPixels,
    pixelsToPct,
    pointsDistance,
    rgb2hex,
    shallowEqual,
    sleep,
    toRelativeCoords,
} from './Utils.js';
import { log } from './logging.js';

vi.mock('./logging.js', () => ({ log: vi.fn() }));

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    sessionStorage.clear();
});

describe('coordinate and width conversions', () => {
    it('converts canvas coordinates and widths with the documented precision', () => {
        expect(toRelativeCoords(12.345678, 100)).toBe(0.12346);
        expect(pixelsToPct(12.34567, 100)).toBe(12.34567);
        expect(pctToPixels(12.345, 100)).toBe(12.35);
    });
});

describe('sleep', () => {
    it('resolves after the requested delay', async () => {
        vi.useFakeTimers();
        let resolved = false;
        const promise = sleep(250).then(() => { resolved = true; });

        await vi.advanceTimersByTimeAsync(249);
        expect(resolved).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await promise;
        expect(resolved).toBe(true);
    });
});

describe('shallowEqual', () => {
    it('compares own key counts and values without deep comparison', () => {
        expect(shallowEqual({ a: 1, b: 'two' }, { b: 'two', a: 1 })).toBe(true);
        expect(shallowEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
        expect(shallowEqual({ a: { value: 1 } }, { a: { value: 1 } })).toBe(false);
    });
});

describe('isValidUrl', () => {
    it('accepts absolute URLs and rejects relative or malformed values', () => {
        expect(isValidUrl('https://example.test/image.png')).toBe(true);
        expect(isValidUrl('/image.png')).toBe(false);
        expect(isValidUrl('not a url')).toBe(false);
    });
});

describe('pointsDistance', () => {
    it('returns Manhattan distance for points in any direction', () => {
        expect(pointsDistance(2, 3, 8, 11)).toBe(14);
        expect(pointsDistance(-2, 5, 1, -1)).toBe(9);
    });
});

describe('makeKonvaGrid', () => {
    it('fills the background and draws each vertical and horizontal grid line', () => {
        const context = {
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            closePath: vi.fn(),
            fillStrokeShape: vi.fn(),
        };
        const shape = {
            attrs: { hspacing: 10, vspacing: 5, fill: '#eee', fillEnabled: true },
            width: () => 20,
            height: () => 10,
        };

        makeKonvaGrid.call(shape, context, shape);

        expect(context.fillRect).toHaveBeenCalledWith(0, 0, 20, 10);
        expect(context.beginPath).toHaveBeenCalledTimes(6);
        expect(context.closePath).toHaveBeenCalledTimes(6);
        expect(context.fillStrokeShape).toHaveBeenCalledTimes(6);
        expect(context.fillStrokeShape).toHaveBeenCalledWith(shape);
        expect(context.moveTo).toHaveBeenNthCalledWith(1, 0, 0);
        expect(context.lineTo).toHaveBeenNthCalledWith(1, 0, 10);
    });
});

describe('rgb2hex', () => {
    it('converts rgb values to two-digit hexadecimal channels', () => {
        expect(rgb2hex('rgb(0, 15, 255)')).toBe('#000fff');
        expect(rgb2hex('rgba(0, 15, 255, 1)')).toBe(false);
    });
});

describe('createOutlineClone', () => {
    it('creates a transparent outline clone', () => {
        const clone = {};
        const shape = { clone: vi.fn(() => clone) };

        expect(createOutlineClone(shape)).toBe(clone);
        expect(shape.clone).toHaveBeenCalledWith({ clone: true, fillEnabled: false, strokeEnabled: true, opacity: 0 });
    });

    it('logs and returns false when cloning fails', () => {
        const shape = { clone: vi.fn(() => null) };

        expect(createOutlineClone(shape)).toBe(false);
        expect(log).toHaveBeenCalledWith(expect.any(Number), 'Failed to create outline clone from shape');
    });
});

describe('getPresenterToken', () => {
    it('retrieves the token for a session from session storage', () => {
        sessionStorage.setItem('presentertoken_42', 'token-42');

        expect(getPresenterToken(42)).toBe('token-42');
        expect(getPresenterToken(8)).toBeNull();
    });
});

describe('getUsedColors', () => {
    it('fetches the requested color collection with the session token', async () => {
        sessionStorage.setItem('presentertoken_42', 'token-42');
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ colors: ['#123456'] }) });
        vi.stubGlobal('fetch', fetchMock);

        await expect(getUsedColors('stroke', 42)).resolves.toEqual({ colors: ['#123456'] });
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/shapesinfo/stroke/42'), expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ Authorization: 'Bearer token-42' }),
        }));
    });

    it('rejects unsuccessful responses with their status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

        await expect(getUsedColors('fill', 42)).rejects.toBe('Error (503) occurred');
    });
});