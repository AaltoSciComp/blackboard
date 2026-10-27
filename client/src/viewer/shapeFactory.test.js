import { describe, expect, it } from 'vitest';
import {
    createShapeSpec,
    getArrowPoints,
    scaleShapeDetailProperty,
    toPixelPoints,
} from './shapeFactory.js';

const W = 1000; // layer width px
const H = 500; // layer height px

function baseShape(shapetype, shapedetails = {}, extra = {}) {
    // x/y and Line shapedata points are fractions (0..1); sized details and
    // arrow shapedata are percentages (0..100)
    return { shapetype, x: 0.01, y: 0.02, stroke: '#fff', fill: '#000', shapedetails: { strokeWidth: 1, ...shapedetails }, ...extra };
}

describe('toPixelPoints', () => {
    it('flattens shapedata relative points to pixel pairs', () => {
        const shapedata = [[0, 0.1, 0.2], [15, 0.5, 1.0]];
        expect(toPixelPoints(shapedata, W, H)).toEqual([100, 100, 500, 500]);
    });

    it('returns an empty array for missing data', () => {
        expect(toPixelPoints(undefined, W, H)).toEqual([]);
        expect(toPixelPoints([], W, H)).toEqual([]);
    });
});

describe('getArrowPoints', () => {
    it('converts the current relative arrow format', () => {
        const shapedata = [[0, 0, 0], [15, 10, 20]];
        expect(getArrowPoints(shapedata, W, H)).toEqual([0, 0, 100, 100]);
    });

    it('converts the legacy flat arrow format', () => {
        // Old format: [x1, y1, x2, y2] with percentage end coordinates
        const shapedata = [0, 0, 10, 20];
        expect(getArrowPoints(shapedata, W, H)).toEqual([0, 0, 100, 100]);
    });

    it('returns an empty array for missing data', () => {
        expect(getArrowPoints(undefined, W, H)).toEqual([]);
        expect(getArrowPoints([], W, H)).toEqual([]);
    });
});

describe('createShapeSpec', () => {
    it('builds a Line with pixel coordinates and wipe compositing', () => {
        const shape = baseShape('Line', { bezier: true, tension: 0.5, strokeEnabled: true, closed: false }, {
            shapedata: [[0, 0.1, 0.2], [5, 0.3, 0.4]],
        });

        const spec = createShapeSpec(shape, W, H);

        expect(spec.konvaClass).toBe('Line');
        expect(spec.attrs).toMatchObject({
            name: 'Line',
            bezier: true,
            tension: 0.5,
            strokeEnabled: true,
            points: [100, 100],
            x: 10,
            y: 10,
            stroke: '#fff',
            strokeWidth: 10,
            fill: '#000',
            fillEnabled: undefined,
            globalCompositeOperation: 'source-over',
            strokeScaleEnabled: false,
        });
    });

    it('uses destination-out for wipe strokes and preserves custom names (TempLine)', () => {
        const shape = baseShape('Line', {}, { stroke: 'wipe', name: 'TempLine', shapedata: [] });

        const spec = createShapeSpec(shape, W, H);

        expect(spec.attrs.name).toBe('TempLine');
        expect(spec.attrs.globalCompositeOperation).toBe('destination-out');
    });

    it('builds an Arrow with pointer dimensions scaled from stroke width', () => {
        const shape = baseShape('Arrow', { strokeEnabled: true, strokeWidth: 1 }, {
            shapedata: [[0, 0, 0], [0, 50, 100]],
        });

        const spec = createShapeSpec(shape, W, H);

        expect(spec.konvaClass).toBe('Arrow');
        expect(spec.attrs).toMatchObject({
            name: 'Arrow',
            points: [0, 0, 500, 500],
            pointerLength: 24, // (10 + 2) * 2
            pointerWidth: 24,
        });
    });

    it('builds a Grid with spacing converted to pixels', () => {
        const shape = baseShape('Grid', { width: 100, height: 100, hspacing: 10, vspacing: 20 });

        const spec = createShapeSpec(shape, W, H);

        expect(spec.konvaClass).toBe('Shape');
        expect(spec.attrs).toMatchObject({
            name: 'Grid',
            width: 1000,
            height: 500,
            hspacing: 100,
            vspacing: 100,
        });
    });

    it('builds a Rect with pixel width and height', () => {
        const shape = baseShape('Rect', { width: 50, height: 25 });

        const spec = createShapeSpec(shape, W, H);

        expect(spec.konvaClass).toBe('Rect');
        expect(spec.attrs).toMatchObject({ name: 'Rect', width: 500, height: 125 });
    });

    it('builds an Ellipse from radiusX/radiusY', () => {
        const shape = baseShape('Ellipse', { radiusX: 10, radiusY: 20, strokeEnabled: true });

        const spec = createShapeSpec(shape, W, H);

        expect(spec.konvaClass).toBe('Ellipse');
        expect(spec.attrs).toMatchObject({ radiusX: 100, radiusY: 100 });
    });

    it('builds a Circle from a legacy radius', () => {
        const shape = baseShape('Circle', { radius: 10, strokeEnabled: true });

        const spec = createShapeSpec(shape, W, H);

        // Circle with radius uses the Ellipse class with equal radii fallback
        expect(spec.konvaClass).toBe('Ellipse');
        expect(spec.attrs.radiusX).toBe(100);
        expect(spec.attrs.radiusY).toBe(100);
    });

    it('builds a Dot as a filled Circle using the stroke color', () => {
        const shape = baseShape('Dot', { radius: 1 });

        const spec = createShapeSpec(shape, W, H);

        expect(spec.konvaClass).toBe('Circle');
        expect(spec.attrs).toMatchObject({
            name: 'Dot',
            radius: 10,
            strokeWidth: 0,
            fillEnabled: true,
            fill: '#fff', // stroke color
            x: 10,
            y: 10,
        });
    });

    it('applies rotation defaults to sized shapes', () => {
        const shape = baseShape('Rect', { width: 10, height: 10, rotation: 45 });

        const spec = createShapeSpec(shape, W, H);

        expect(spec.attrs).toMatchObject({ rotation: 45, width: 100, height: 50 });
    });

    it('applies scale to Line shapes', () => {
        const shape = baseShape('Line', { rotation: 10, scaleX: 2 }, { shapedata: [] });

        const spec = createShapeSpec(shape, W, H);

        expect(spec.attrs).toMatchObject({ rotation: 10, scaleX: 2, scaleY: 1 });
    });

    it('returns null for unknown shape types', () => {
        expect(createShapeSpec(baseShape('Hexagon'), W, H)).toBeNull();
        expect(createShapeSpec(baseShape(undefined), W, H)).toBeNull();
    });
});

describe('scaleShapeDetailProperty', () => {
    it('scales pixel-based properties per node type', () => {
        expect(scaleShapeDetailProperty('Rect', 'width', 10, W, H)).toBe(100);
        expect(scaleShapeDetailProperty('Rect', 'height', 10, W, H)).toBe(50);
        expect(scaleShapeDetailProperty('Ellipse', 'radiusX', 10, W, H)).toBe(100);
        expect(scaleShapeDetailProperty('Ellipse', 'radiusY', 10, W, H)).toBe(50);
        expect(scaleShapeDetailProperty('Dot', 'radius', 2, W, H)).toBe(20);
    });

    it('returns undefined for properties applied as-is', () => {
        expect(scaleShapeDetailProperty('Rect', 'rotation', 45, W, H)).toBeUndefined();
        expect(scaleShapeDetailProperty('Line', 'bezier', true, W, H)).toBeUndefined();
        expect(scaleShapeDetailProperty('Line', 'strokeWidth', 1, W, H)).toBeUndefined();
        expect(scaleShapeDetailProperty('Unknown', 'width', 10, W, H)).toBeUndefined();
    });
});
