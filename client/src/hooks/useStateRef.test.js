import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import useStateRef from './useStateRef.js';

afterEach(cleanup);

describe('useStateRef', () => {
    it('keeps its ref synchronized with state and stable across renders', () => {
        const { result } = renderHook(() => useStateRef(4));
        const stateRef = result.current[2];

        expect(result.current[0]).toBe(4);
        expect(stateRef.current).toBe(4);

        act(() => result.current[1](7));
        expect(result.current[0]).toBe(7);
        expect(result.current[2]).toBe(stateRef);
        expect(stateRef.current).toBe(7);

        act(() => result.current[1]((value) => value + 1));
        expect(result.current[0]).toBe(8);
        expect(stateRef.current).toBe(8);
    });
});