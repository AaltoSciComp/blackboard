import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useResizeObserver } from './use-resize-observer.js';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useResizeObserver', () => {
    it('observes the element and publishes rounded dimensions on the next frame', () => {
        const element = document.createElement('div');
        const ref = { current: element };
        let resizeCallback;
        let frameCallback;
        const observe = vi.fn();
        const unobserve = vi.fn();
        const cancelAnimationFrame = vi.fn();
        const requestAnimationFrame = vi.fn((callback) => {
            frameCallback = callback;
            return 23;
        });

        class MockResizeObserver {
            constructor(callback) {
                resizeCallback = callback;
            }

            observe = observe;
            unobserve = unobserve;
        }

        vi.stubGlobal('ResizeObserver', MockResizeObserver);
        vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
        vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);

        const { result, unmount } = renderHook(() => useResizeObserver({ ref }));

        expect(observe).toHaveBeenCalledWith(element);
        expect(result.current).toEqual({});

        act(() => resizeCallback([{ contentRect: { width: 120.6, height: 45.2 } }]));
        expect(requestAnimationFrame).toHaveBeenCalledOnce();

        act(() => frameCallback());
        expect(result.current).toEqual({ width: 121, height: 45 });

        unmount();
        expect(cancelAnimationFrame).toHaveBeenCalledWith(23);
        expect(unobserve).toHaveBeenCalledWith(element);
    });

    it('does nothing when the ref has no element', () => {
        const observerConstructor = vi.fn();
        vi.stubGlobal('ResizeObserver', observerConstructor);

        const { result } = renderHook(() => useResizeObserver({ ref: { current: null } }));

        expect(result.current).toEqual({});
        expect(observerConstructor).not.toHaveBeenCalled();
    });
});