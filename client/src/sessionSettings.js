export function createSessionSettings(currentBoard, boardLimits, numBoards, ui, lineProperties, laserProperties) {
    return {
        boards: { ab: currentBoard, sb: boardLimits.from, nvb: numBoards },
        ui,
        line: lineProperties,
        laser: laserProperties,
    };
}