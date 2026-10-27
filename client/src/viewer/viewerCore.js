/**
 * Pure helper functions for the presentation viewer, separated from Konva /
 * socket.io / DOM usage so they can be unit tested with vitest and shared
 * with the React presenter app where relevant.
 */

/**
 * Board grid layouts supported by the viewer, keyed by the number of visible
 * boards. Keep in sync with the grid sizes offered by the presenter UI
 * (components/ThumbnailNav.jsx: 1, 2, 4, 9, 16).
 */
export const BOARD_GRID_CONFIGS = {
    1: { rows: 1, cols: 1 },
    2: { rows: 2, cols: 1 },
    4: { rows: 2, cols: 2 },
    9: { rows: 3, cols: 3 },
    16: { rows: 4, cols: 4 },
};

/**
 * Return the { rows, cols } layout for a given number of visible boards.
 * Falls back to a single board for unknown values (viewer_used to crash
 * with "conf[numVisBoards] is undefined" for unsupported values).
 */
export function getBoardGridConfig(numVisBoards) {
    return BOARD_GRID_CONFIGS[Number(numVisBoards)] || BOARD_GRID_CONFIGS[1];
}

/**
 * Compute the range of logical board numbers currently visible, given the
 * starting board set by the presenter, the number of visible boards and a
 * viewer-side offset measured in "pages" of visible boards.
 *
 * The view never starts before board 1.
 */
export function getViewRange(startingBoard, numVisBoards, offset) {
    const f = startingBoard + offset * numVisBoards;
    const t = startingBoard + numVisBoards - 1 + offset * numVisBoards;
    if (f > 0) {
        return { from: f, to: t };
    }
    return { from: 1, to: numVisBoards };
}

/**
 * Map a logical (database) board number to its physical canvas index
 * (1..numVisBoards) within the current view, or null if the board is
 * outside the visible range.
 */
export function getPhysicalCanvasId(logicalCanvasId, from, to) {
    if (logicalCanvasId > to || logicalCanvasId < from) {
        return null;
    }
    return logicalCanvasId - (from - 1);
}

/**
 * True if the given logical board number is within the visible range.
 */
export function boardIsInView(board, from, to) {
    return board >= from && board <= to;
}

/**
 * Only handle events (e.g. window resize) once per `ms` milliseconds.
 */
export function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn.apply(this, args);
        }, ms);
    };
}

/**
 * Makes any async function chainable so that consecutive calls run one at a
 * time in order (needed so that shape coordinates are not mixed up when
 * multiple boards are drawn simultaneously).
 *
 * Unlike the original inline viewer version, a rejected call does not jam
 * the chain: the next call still runs after the failure settles.
 *
 * Source: https://dev.to/chromiumdev/cancellable-async-functions-in-javascript-5gp7
 */
export function makeChainable(fn) {
    let p = Promise.resolve(true);
    return (...args) => {
        p = p.then(() => fn(...args), () => fn(...args));
        return p;
    };
}
