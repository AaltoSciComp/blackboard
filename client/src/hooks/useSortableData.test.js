import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import useSortableData from './useSortableData.js';

afterEach(cleanup);

describe('useSortableData', () => {
    it('sorts a copy by the default key and toggles requested sort direction', () => {
        const sessions = [
            { id: 1, sessionname: 'Bravo', lastlogin: 10 },
            { id: 2, sessionname: 'Alpha', lastlogin: 30 },
            { id: 3, sessionname: 'Charlie', lastlogin: 20 },
        ];
        const originalOrder = sessions.map(({ id }) => id);
        const { result } = renderHook(() => useSortableData(sessions));

        expect(result.current.items.map(({ id }) => id)).toEqual([2, 3, 1]);
        expect(result.current.sortConfig).toEqual({ key: 'lastlogin', dir: 'desc' });
        expect(sessions.map(({ id }) => id)).toEqual(originalOrder);

        act(() => result.current.requestSort('sessionname'));
        expect(result.current.items.map(({ sessionname }) => sessionname)).toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(result.current.sortConfig).toEqual({ key: 'sessionname', dir: 'asc' });

        act(() => result.current.requestSort('sessionname'));
        expect(result.current.items.map(({ sessionname }) => sessionname)).toEqual(['Charlie', 'Bravo', 'Alpha']);
        expect(result.current.sortConfig).toEqual({ key: 'sessionname', dir: 'desc' });
        expect(sessions.map(({ id }) => id)).toEqual(originalOrder);
    });
});