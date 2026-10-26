export function getBoardGridWindow(currentBoard, visibleBoardCount) {
    const to = Math.max(currentBoard, visibleBoardCount);
    return {
        from: to - visibleBoardCount + 1,
        to,
    };
}