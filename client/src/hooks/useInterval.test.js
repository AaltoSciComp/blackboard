import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useInterval from './useInterval.js';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('useInterval', () => {
    it('uses the latest callback without restarting the interval', () => {
        vi.useFakeTimers();
        const firstCallback = vi.fn();
        const latestCallback = vi.fn();
        const { rerender, unmount } = renderHook(
            ({ callback }) => useInterval(callback, 1000),
            { initialProps: { callback: firstCallback } }
        );

        act(() => vi.advanceTimersByTime(1000));
        expect(firstCallback).toHaveBeenCalledOnce();

        rerender({ callback: latestCallback });
        act(() => vi.advanceTimersByTime(1000));
        expect(firstCallback).toHaveBeenCalledOnce();
        expect(latestCallback).toHaveBeenCalledOnce();

        unmount();
        act(() => vi.advanceTimersByTime(2000));
        expect(latestCallback).toHaveBeenCalledOnce();
    });

    it('does not schedule ticks when delay is null', () => {
        vi.useFakeTimers();
        const callback = vi.fn();
        renderHook(() => useInterval(callback, null));

        act(() => vi.advanceTimersByTime(5000));

        expect(callback).not.toHaveBeenCalled();
    });
});