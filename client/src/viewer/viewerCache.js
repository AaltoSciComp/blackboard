/**
 * Board caching for the presentation viewer, extracted from the inline
 * viewer script so it can be unit tested. All ambient dependencies
 * (sessionStorage/localStorage, LZString compression, and the socket
 * request used when a board has local changes) are injected so the cache
 * works both in the browser and in tests.
 *
 * Cache semantics (keep in sync with the server):
 * - boardsModified[board] holds the last modification time we have cached.
 * - cacheDirty[board] marks boards whose shapes/settings changed locally
 *   (shape_modified, draw_shape, ...) without a fresh board_data message;
 *   such boards must be re-requested from the server instead of trusting
 *   the cached copy.
 * - In offline mode ("backup" mode) boards are read preferentially from
 *   localStorage, where a permanent copy was made when the viewer went
 *   offline.
 */

export function createBoardCache({ sid, store, backupStore, compress, decompress, requestBoard }) {
    const boardsModified = []; // modification times for locally cached boards (for faster access)
    const cacheDirty = [];     // these boards have dynamic changes which have not been loaded into cache yet

    const cacheKey = (id) => 'board_' + sid + '_' + id;

    function setCachedTime(board, mod) {
        boardsModified[board] = mod;
        return true;
    }

    function getCachedTime(board) {
        if (typeof boardsModified[board] === 'undefined') {
            return 0;
        }
        return boardsModified[board];
    }

    function cacheIsUpToDate(board, mod) {
        return getCachedTime(board) >= mod;
    }

    /**
     * Store board data (as {mod, data}) in the session cache, or in the
     * permanent (local storage) backup cache when backup is true.
     */
    function setCachedBoard(id, data, backup = false) {
        setCachedTime(id, data.mod);
        if (backup) {
            return backupStore.setItem(cacheKey(id), compress(JSON.stringify(data)));
        }
        cacheDirty[id] = false;
        return store.setItem(cacheKey(id), compress(JSON.stringify(data)));
    }

    /**
     * Get board data from cache.
     *
     * When usebackup is set (offline mode), read from the permanent backup
     * and fall back to the session cache. Otherwise, if the board has been
     * marked dirty, request fresh data from the server via requestBoard and
     * return false to signal "no usable cache".
     */
    function getCachedBoard(id, usebackup = false) {
        let b;
        if (usebackup) {
            b = decompress(backupStore.getItem(cacheKey(id)));
            // Try temp storage if backup not found
            if (!b) b = decompress(store.getItem(cacheKey(id)));
        } else {
            // If not using backup (= offline mode), check if board has changed since last cached
            if (cacheDirty[id] === true) {
                requestBoard(id);
                return false;
            }
            // If no shapes / board properties have changed, it's safe to use cached data
            b = decompress(store.getItem(cacheKey(id)));
        }
        if (b) return JSON.parse(b);
        return null;
    }

    /**
     * Called when the viewer goes offline (or all boards are cleared):
     * copies all known cached boards to the permanent backup store and
     * removes them from the session cache so stale data is not used when
     * coming back online.
     */
    function backupAndDeleteCachedBoards() {
        boardsModified.forEach((el, idx) => {
            if (el) {
                const cache = getCachedBoard(idx, false);
                if (cache) setCachedBoard(idx, cache, true);
                store.removeItem(cacheKey(idx));
                // prevent using empty boards from sessionStorage when coming back online
                setCachedTime(idx, 0);
            }
        });
    }

    return {
        boardsModified,
        cacheDirty,
        setCachedTime,
        getCachedTime,
        cacheIsUpToDate,
        setCachedBoard,
        getCachedBoard,
        backupAndDeleteCachedBoards,
    };
}
