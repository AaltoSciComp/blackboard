import { SQRT2_DIV2 } from './constants.js';

export function getGridBlockSize(stageSize, gridProperties) {
    return {
        x: (stageSize.width * gridProperties.cellWidth * 0.01).toFixed(5),
        y: (stageSize.height * gridProperties.cellHeight * 0.01).toFixed(5),
    };
}

export function getGridSnappedCoordinates(x, y, gridBlockSize, useSqrt = false) {
    const blockX = useSqrt ? gridBlockSize.x * SQRT2_DIV2 : gridBlockSize.x;
    const blockY = useSqrt ? gridBlockSize.y * SQRT2_DIV2 : gridBlockSize.y;

    return [
        Math.round(x / blockX) * blockX,
        Math.round(y / blockY) * blockY,
    ];
}