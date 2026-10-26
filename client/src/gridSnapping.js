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

export function getSnappedAnchorPosition(oldPosition, newPosition, gridBlockSize, tolerance = 10) {
    const closestX = Math.round(newPosition.x / gridBlockSize.x) * gridBlockSize.x;
    const closestY = Math.round(newPosition.y / gridBlockSize.y) * gridBlockSize.y;
    const snappedX = Math.abs(newPosition.x - closestX) < tolerance;
    const snappedY = Math.abs(newPosition.y - closestY) < tolerance;

    if (snappedX && !snappedY) {
        return { x: closestX, y: oldPosition.y };
    }
    if (snappedY && !snappedX) {
        return { x: oldPosition.x, y: closestY };
    }
    if (snappedX && snappedY) {
        return { x: closestX, y: closestY };
    }
    return newPosition;
}

export function getEllipseSnapOffset(width, height, gridBlockSize) {
    const modX = Math.abs(width) * 0.5 % gridBlockSize.x;
    const modY = Math.abs(height) * 0.5 % gridBlockSize.y;

    return {
        x: modX > 0.1 * gridBlockSize.x && modX < 0.9 * gridBlockSize.x ? gridBlockSize.x * 0.5 : 0,
        y: modY > 0.1 * gridBlockSize.y && modY < 0.9 * gridBlockSize.y ? gridBlockSize.y * 0.5 : 0,
    };
}