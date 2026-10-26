import { pixelsToPct, toRelativeCoords } from './Utils.js';

export function createShapeRequestBody(attrs, pointsData, stageSize) {
    const requestBody = {
        boardid: attrs.boardId,
        visible: true,
        starttime: attrs.startTime.toString(),
        shapetype: attrs.name,
        x: toRelativeCoords(attrs.x, stageSize.width).toString(),
        y: toRelativeCoords(attrs.y, stageSize.height).toString(),
        stroke: attrs.stroke,
        fill: attrs.fill,
        shapedetails: {
            strokeWidth: pixelsToPct(attrs.strokeWidth, stageSize.width),
            strokeEnabled: attrs.strokeEnabled,
            fillEnabled: attrs.fillEnabled,
            closed: attrs.closed,
        },
    };

    switch (attrs.name) {
        case 'Line':
        case 'Polyline':
            requestBody.shapedetails.bezier = attrs.bezier;
            requestBody.shapedetails.tension = Number(attrs.tension);
            requestBody.shapedata = pointsData;
            break;
        case 'Arrow':
            requestBody.shapedata = attrs.points.length === 4
                ? [[0, 0, 0], [0, pixelsToPct(attrs.points[2], stageSize.width), pixelsToPct(attrs.points[3], stageSize.height)]]
                : [[0, 0, 0], [0, 0, 0]];
            break;
        case 'Rect':
            if (attrs.width === 0 && attrs.height === 0) {
                return { error: 'Rectangle requires a non-zero width or height' };
            }
            requestBody.shapedetails.width = pixelsToPct(attrs.width, stageSize.width);
            requestBody.shapedetails.height = pixelsToPct(attrs.height, stageSize.height);
            break;
        case 'Circle':
        case 'Dot':
            if (attrs.radius === 0) {
                return { error: 'Circle requires a non-zero radius' };
            }
            requestBody.shapedetails.radius = pixelsToPct(attrs.radius, stageSize.width);
            break;
        case 'Ellipse':
            if (attrs.radiusX === 0 && attrs.radiusY === 0) {
                return { error: 'Ellipse requires a non-zero X and Y radius' };
            }
            requestBody.shapedetails.radiusX = pixelsToPct(attrs.radiusX, stageSize.width);
            requestBody.shapedetails.radiusY = pixelsToPct(attrs.radiusY, stageSize.height);
            break;
        case 'Grid':
            requestBody.shapedetails.hspacing = Number(pixelsToPct(attrs.hspacing, stageSize.width));
            requestBody.shapedetails.vspacing = Number(pixelsToPct(attrs.vspacing, stageSize.height));
            requestBody.shapedetails.width = pixelsToPct(attrs.width, stageSize.width);
            requestBody.shapedetails.height = pixelsToPct(attrs.height, stageSize.height);
            if (requestBody.shapedetails.width === 0 || requestBody.shapedetails.height === 0) {
                return { error: 'Grid needs to be at least one grid square in size' };
            }
            break;
        default:
            return { error: 'Unknown shape type' };
    }

    return { requestBody };
}

export function createShapeTransformRequestBody(attrs, currentBoard, stageSize) {
    const requestBody = {
        boardid: currentBoard,
        shapedetails: {
            rotation: attrs.rotation ?? 0,
            scaleX: attrs.scaleX ?? 1,
            scaleY: attrs.scaleY ?? 1,
        },
        x: toRelativeCoords(attrs.x, stageSize.width).toString(),
        y: toRelativeCoords(attrs.y, stageSize.height).toString(),
    };

    if (attrs.name === 'Arrow' && attrs.points) {
        requestBody.shapedata = [
            [0, 0, 0],
            [0, pixelsToPct(attrs.points[2], stageSize.width), pixelsToPct(attrs.points[3], stageSize.height)],
        ];
    }

    if (attrs.radiusX) requestBody.shapedetails.radiusX = pixelsToPct(attrs.radiusX, stageSize.width);
    if (attrs.radiusY) requestBody.shapedetails.radiusY = pixelsToPct(attrs.radiusY, stageSize.height);
    if (attrs.width) requestBody.shapedetails.width = pixelsToPct(attrs.width, stageSize.width);
    if (attrs.height) requestBody.shapedetails.height = pixelsToPct(attrs.height, stageSize.height);

    return requestBody;
}

export function createShapeCloneRequestBody(attrs, sourceDatabaseId, stageSize) {
    return {
        shapeId: String(sourceDatabaseId),
        x: toRelativeCoords(attrs.x, stageSize.width),
        y: toRelativeCoords(attrs.y, stageSize.height),
    };
}

export function createShapeUpdateRequestBody(properties, currentBoard) {
    const requestBody = { ...properties, boardid: currentBoard };
    if (requestBody.starttime) requestBody.starttime = requestBody.starttime.toString();
    return requestBody;
}