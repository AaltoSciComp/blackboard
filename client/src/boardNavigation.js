import { SWIPE_X_THRESHOLD, SWIPE_Y_THRESHOLD } from './constants.js';

export function getBoardNavigationTarget(where, currentBoard, numBoards, boardLimits) {
    let newBoard;
    switch (where) {
        case 'next':
            newBoard = parseInt(currentBoard) + 1;
            break;
        case 'previous':
            newBoard = Math.max(parseInt(currentBoard) - 1, 1);
            break;
        case 'down':
            newBoard = Math.max(1, currentBoard - parseInt(Math.sqrt(numBoards)));
            break;
        case 'up':
            newBoard = Math.min(boardLimits.end, currentBoard + parseInt(Math.sqrt(numBoards)));
            break;
        case 'last':
            newBoard = parseInt(boardLimits.end);
            break;
        case 'first':
        default:
            newBoard = 1;
            break;
    }

    return { new: newBoard, changed: currentBoard === newBoard ? false : true };
}

export function getBoardDirectionFromSwipe(swipeX, swipeY) {
    if (Math.abs(swipeX) > Math.abs(swipeY)) {
        if (swipeX > SWIPE_X_THRESHOLD) return 'previous';
        if (swipeX < -SWIPE_X_THRESHOLD) return 'next';
    } else {
        if (swipeY > SWIPE_Y_THRESHOLD) return 'down';
        if (swipeY < -SWIPE_Y_THRESHOLD) return 'up';
    }

    return null;
}

export function getShapeHistoryActionFromSwipe(swipeX, swipeY) {
    if (Math.abs(swipeX) <= Math.abs(swipeY)) return null;
    if (swipeX > SWIPE_X_THRESHOLD) return 'undo';
    if (swipeX < -SWIPE_X_THRESHOLD) return 'redo';
    return null;
}