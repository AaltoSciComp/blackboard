import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBoardCache } from './viewerCache.js';

function makeStorage() {
    const data = new Map();
    return {
        data,
        getItem: vi.fn((k) => (data.has(k) ? data.get(k) : null)),
        setItem: vi.fn((k, v) => data.set(k, v)),
        removeItem: vi.fn((k) => data.delete(k)),
    };
}

// Identity "compression" so tests can assert on the stored payload directly.
const compress = (s) => s;
const decompress = (s) => s || null;

function makeCache() {
    const store = makeStorage();
    const backupStore = makeStorage();
    const requestBoard = vi.fn();
    const cache = createBoardCache({ sid: 42, store, backupStore, compress, decompress, requestBoard });
    return { cache, store, backupStore, requestBoard };
}

describe('board cache modification times', () => {
    it('defaults unknown boards to time 0 and tracks set times', () => {
        const { cache } = makeCache();

        expect(cache.getCachedTime(7)).toBe(0);
        cache.setCachedTime(7, 1000);
        expect(cache.getCachedTime(7)).toBe(1000);
        expect(cache.cacheIsUpToDate(7, 1000)).toBe(true);
        expect(cache.cacheIsUpToDate(7, 999)).toBe(true);
        expect(cache.cacheIsUpToDate(7, 1001)).toBe(false);
    });
});

describe('board cache session storage', () => {
    it('stores compressed board data under the sid-scoped key', () => {
        const { cache, store } = makeCache();
        const board = { mod: 1000, data: { boardid: 3 } };

        cache.setCachedBoard(3, board);

        expect(store.setItem).toHaveBeenCalledWith('board_42_3', JSON.stringify(board));
        expect(cache.getCachedBoard(3)).toEqual(board);
    });

    it('returns null for boards that were never cached', () => {
        const { cache } = makeCache();
        expect(cache.getCachedBoard(3)).toBeNull();
    });

    it('requests fresh data and returns false when the board is dirty', () => {
        const { cache, requestBoard } = makeCache();
        cache.setCachedBoard(3, { mod: 1000, data: { boardid: 3 } });
        cache.cacheDirty[3] = true;

        expect(cache.getCachedBoard(3)).toBe(false);
        expect(requestBoard).toHaveBeenCalledWith(3);
    });

    it('clears the dirty flag when new data is cached', () => {
        const { cache } = makeCache();
        cache.cacheDirty[3] = true;

        cache.setCachedBoard(3, { mod: 1000, data: {} });

        expect(cache.cacheDirty[3]).toBe(false);
    });
});

describe('board cache backup (offline) mode', () => {
    it('prefers the backup store and falls back to the session store', () => {
        const { cache, store, backupStore } = makeCache();
        const board = { mod: 1000, data: { boardid: 5 } };

        cache.setCachedBoard(5, board, true);
        expect(backupStore.setItem).toHaveBeenCalledWith('board_42_5', JSON.stringify(board));

        expect(cache.getCachedBoard(5, true)).toEqual(board);

        // Remove the backup copy: session cache fallback kicks in
        backupStore.removeItem('board_42_5');
        store.setItem('board_42_5', JSON.stringify(board));
        expect(cache.getCachedBoard(5, true)).toEqual(board);
    });

    it('ignores the dirty flag in backup mode (offline = no server)', () => {
        const { cache, backupStore, requestBoard } = makeCache();
        const board = { mod: 1000, data: { boardid: 5 } };
        backupStore.setItem('board_42_5', JSON.stringify(board));
        cache.cacheDirty[5] = true;

        expect(cache.getCachedBoard(5, true)).toEqual(board);
        expect(requestBoard).not.toHaveBeenCalled();
    });
});

describe('backupAndDeleteCachedBoards', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('copies known boards to backup and clears them from the session cache', () => {
        const { cache, store, backupStore } = makeCache();
        const board3 = { mod: 10, data: { boardid: 3 } };
        const board4 = { mod: 20, data: { boardid: 4 } };
        cache.setCachedBoard(3, board3);
        cache.setCachedBoard(4, board4);

        cache.backupAndDeleteCachedBoards();

        expect(backupStore.getItem('board_42_3')).toBe(JSON.stringify(board3));
        expect(backupStore.getItem('board_42_4')).toBe(JSON.stringify(board4));
        expect(store.getItem('board_42_3')).toBeNull();
        expect(store.getItem('board_42_4')).toBeNull();
        // Times reset so empty boards are not trusted when coming back online
        expect(cache.getCachedTime(3)).toBe(0);
        expect(cache.getCachedTime(4)).toBe(0);
    });

    it('leaves unknown boards untouched', () => {
        const { cache, backupStore } = makeCache();
        cache.boardsModified[9] = undefined; // sparse array hole from setCachedTime

        cache.backupAndDeleteCachedBoards();

        expect(backupStore.setItem).not.toHaveBeenCalled();
    });
});
