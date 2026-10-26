export function getInitialBoardConfiguration(boards, settings) {
    const numBoards = parseInt(boards.nvb);
    const activeBoard = parseInt(boards.ab);
    const startBoard = parseInt(boards.sb);
    const lastBoard = settings.reduce((largest, row) => Math.max(largest, parseInt(row.boardid)), 1);

    return {
        numBoards,
        activeBoard,
        startBoard,
        boardLimits: {
            from: startBoard,
            to: startBoard + numBoards - 1,
            end: lastBoard > 0 ? lastBoard : 1,
        },
    };
}