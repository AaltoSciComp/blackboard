/**
 * Konva shape construction for the presentation viewer.
 *
 * Instead of constructing Konva nodes directly, these functions return a
 * plain { konvaClass, attrs } specification, which the viewer then feeds to
 * the matching Konva constructor. Keeping the conversion from database
 * percentage coordinates to pixel attributes in a pure function means the
 * whole coordinate math can be unit tested without a browser, and the logic
 * stays in one place shared by live drawing (draw_shape), replay (playShapes)
 * and board rendering (initBoard).
 *
 * Coordinate conventions (see also shapeRequest.js, the inverse direction):
 * - shape.x / shape.y: board position as percentage of board size
 * - shape.shapedata: array of [timeOffsetMs, xPct, yPct] points
 * - shape.shapedetails.*: sizes in percentage of board width (or height)
 */

import { pctToPixels } from '../pixelUtils.js';

/**
 * Wipes are drawn by erasing instead of painting.
 */
function compositeOperation(shape) {
    return shape.stroke === 'wipe' ? 'destination-out' : 'source-over';
}

/**
 * Points array for a Line/Polyline shape: flattened [x, y] pixel pairs.
 * Used when a whole line can be drawn in one go (drawAsap / cached boards).
 */
export function toPixelPoints(shapedata, layerWidth, layerHeight) {
    const points = [];
    if (!shapedata) return points;
    for (const point of shapedata) {
        points.push(point[1] * layerWidth, point[2] * layerHeight);
    }
    return points;
}

/**
 * Arrow Konva points, supporting both the current relative format
 * [[0, 0, 0], [0, rel_x_pct, rel_y_pct]] and the legacy flat format
 * [0, x1, y1, x2, y2] with percentage values.
 */
export function getArrowPoints(shapedata, layerWidth, layerHeight) {
    if (!shapedata || !shapedata.length) return [];
    if (shapedata.length === 4) {
        // Old format: [0, x1, y1, x2, y2] with percentage values
        return [0, 0, pctToPixels(shapedata[2], layerWidth), pctToPixels(shapedata[3], layerHeight)];
    }
    if (shapedata.length === 2) {
        // Current format: [[0, 0, 0], [0, rel_x, rel_y]] with percentage values
        return [0, 0, pctToPixels(shapedata[1][1], layerWidth), pctToPixels(shapedata[1][2], layerHeight)];
    }
    return [];
}

/**
 * Build the Konva constructor name and attributes for a shape coming from
 * the database, scaled to the given layer size.
 *
 * Returns null for unknown shape types so the caller can skip them without
 * crashing the whole render.
 */
export function createShapeSpec(shape, layerWidth, layerHeight) {
    const details = shape.shapedetails || {};
    const strokeWidthPx = pctToPixels(details.strokeWidth, layerWidth);
    const common = {
        x: shape.x * layerWidth,
        y: shape.y * layerHeight,
        stroke: shape.stroke,
        strokeWidth: strokeWidthPx,
        fill: shape.fill,
        fillEnabled: details.fillEnabled,
        rotation: details.rotation || 0,
    };

    switch (shape.shapetype) {
        case 'Line':
        case 'Polyline':
            return {
                konvaClass: 'Line',
                attrs: {
                    name: shape.name ? shape.name : 'Line',
                    bezier: details.bezier,
                    tension: Number(details.tension),
                    strokeEnabled: details.strokeEnabled,
                    points: shape.shapedata && shape.shapedata.length
                        ? [shape.shapedata[0][1] * layerWidth, shape.shapedata[0][2] * layerHeight]
                        : [],
                    lineCap: 'round',
                    lineJoin: 'round',
                    closed: details.closed,
                    shadowForStrokeEnabled: false,
                    perfectDrawEnabled: false,
                    strokeScaleEnabled: false, // Needed for cleaner resizing
                    globalCompositeOperation: compositeOperation(shape),
                    scaleX: details.scaleX || 1,
                    scaleY: details.scaleY || 1,
                    ...common,
                },
            };
        case 'Arrow': {
            const arrowPoints = getArrowPoints(shape.shapedata, layerWidth, layerHeight);
            return {
                konvaClass: 'Arrow',
                attrs: {
                    name: 'Arrow',
                    strokeEnabled: details.strokeEnabled,
                    points: arrowPoints,
                    lineCap: 'round',
                    lineJoin: 'round',
                    closed: details.closed,
                    globalCompositeOperation: compositeOperation(shape),
                    pointerLength: (strokeWidthPx + 2) * 2,
                    pointerWidth: (strokeWidthPx + 2) * 2,
                    scaleX: details.scaleX || 1,
                    scaleY: details.scaleY || 1,
                    ...common,
                },
            };
        }
        case 'Grid':
            return {
                konvaClass: 'Shape',
                attrs: {
                    name: 'Grid',
                    width: pctToPixels(details.width, layerWidth),
                    height: pctToPixels(details.height, layerHeight),
                    hspacing: pctToPixels(details.hspacing, layerWidth) || 0,
                    vspacing: pctToPixels(details.vspacing, layerHeight) || 0,
                    ...common,
                },
            };
        case 'Rect':
            return {
                konvaClass: 'Rect',
                attrs: {
                    name: 'Rect',
                    width: pctToPixels(details.width, layerWidth),
                    height: pctToPixels(details.height, layerHeight),
                    globalCompositeOperation: compositeOperation(shape),
                    shadowForStrokeEnabled: false,
                    perfectDrawEnabled: false,
                    ...common,
                },
            };
        case 'Ellipse':
        case 'Circle': {
            let radius = null;
            if (typeof details.radius !== 'undefined') radius = pctToPixels(details.radius, layerWidth);
            return {
                konvaClass: 'Ellipse',
                attrs: {
                    name: 'Ellipse',
                    radiusX: radius ? radius : pctToPixels(details.radiusX, layerWidth),
                    radiusY: radius ? radius : pctToPixels(details.radiusY, layerHeight),
                    strokeEnabled: details.strokeEnabled,
                    globalCompositeOperation: compositeOperation(shape),
                    shadowForStrokeEnabled: false,
                    perfectDrawEnabled: false,
                    ...common,
                },
            };
        }
        case 'Dot':
            // Dots are always filled with the stroke color and have no stroke
            return {
                konvaClass: 'Circle',
                attrs: {
                    name: 'Dot',
                    radius: pctToPixels(details.radius, layerWidth),
                    stroke: shape.stroke,
                    strokeWidth: 0,
                    fillEnabled: true,
                    fill: shape.stroke,
                    x: shape.x * layerWidth,
                    y: shape.y * layerHeight,
                },
            };
        default:
            // Bail out if shape not known, but don't crash
            return null;
    }
}

/**
 * Percentage-shapedetails keys that are scaled to pixels when a shape is
 * live-updated (shape_modified) for a given Konva node name. Used by the
 * viewer to know which numeric geometry attributes need rescaling and which
 * can be applied as-is.
 */
export const PIXEL_SCALED_DETAILS = {
    Dot: ['radius'],
    Ellipse: ['radiusX', 'radiusY'],
    Rect: ['width', 'height'],
    Grid: ['width', 'height'],
    Line: [],
    Arrow: [],
};

/**
 * The layer size a shapedetails property should be scaled against.
 * Everything is a percentage of board width except vertical sizes.
 */
const HEIGHT_BASED_DETAILS = ['height', 'radiusY', 'vspacing'];

/**
 * Rescale a single shapedetails property to pixels for the given node name.
 * Returns undefined for properties that are not geometry-based (those can be
 * passed through unchanged).
 */
export function scaleShapeDetailProperty(name, property, value, layerWidth, layerHeight) {
    const scaled = PIXEL_SCALED_DETAILS[name];
    if (!scaled || !scaled.includes(property)) return undefined;
    const dimension = HEIGHT_BASED_DETAILS.includes(property) ? layerHeight : layerWidth;
    return pctToPixels(value, dimension);
}
