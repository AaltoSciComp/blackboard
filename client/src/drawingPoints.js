import { pointsDistance } from './Utils.js';

export function shouldRecordDrawingPoint(previousPoint, pointTime, x, y, intervalThreshold, distanceThreshold) {
    const elapsed = pointTime - previousPoint[0];
    const distance = pointsDistance(previousPoint[1], previousPoint[2], x, y);
    return elapsed >= intervalThreshold && distance > distanceThreshold;
}

export function getClosestPointIndexWithinRadius(points, x, y, radius) {
    let closestIndex = -1;
    let closestDistance = Infinity;

    points.forEach((point, index) => {
        const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
        if (distance < radius && distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    return closestIndex;
}

export function getPolylinePenUpAction(distance, distanceThreshold, finished, pointArrayLength, savedPointCount) {
    if (distance < distanceThreshold && !finished) {
        return {
            action: 'discard',
            removeLastPoint: pointArrayLength > savedPointCount * 2,
        };
    }
    if (distance >= distanceThreshold && !finished) {
        return { action: 'intermediate' };
    }
    if (finished) {
        return { action: pointArrayLength > 4 ? 'finish' : 'too-short' };
    }
    return { action: 'continue' };
}