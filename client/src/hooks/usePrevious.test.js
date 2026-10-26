import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import usePrevious from './usePrevious.js';

afterEach(cleanup);

describe('usePrevious', () => {
    it('returns the value from the previous render', () => {
        const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
            initialProps: { value: 'Line' },
        });

        expect(result.current).toBeUndefined();

        rerender({ value: 'Pointer' });
        expect(result.current).toBe('Line');

        rerender({ value: 'Delete' });
        expect(result.current).toBe('Pointer');
    });
});