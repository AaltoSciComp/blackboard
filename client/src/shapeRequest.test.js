import { describe, expect, it } from 'vitest';
import {
    createShapeCloneRequestBody,
    createShapeRequestBody,
    createShapeTransformRequestBody,
    createShapeUpdateRequestBody,
} from './shapeRequest.js';

const stageSize = { width: 200, height: 100 };

function makeAttributes(name, extra = {}) {
    return {
        boardId: 4,
        startTime: 123,
        name,
        x: 50,
        y: 25,
        stroke: '#123456',
        fill: '#abcdef',
        strokeWidth: 2,
        strokeEnabled: true,
        fillEnabled: false,
        closed: false,
        ...extra,
    };
}

describe('createShapeRequestBody', () => {
    it('serializes line attributes and point data', () => {
        const points = [[1, 2, 3]];
        const { requestBody } = createShapeRequestBody(
            makeAttributes('Line', { bezier: true, tension: '0.4' }),
            points,
            stageSize
        );

        expect(requestBody).toMatchObject({
            boardid: 4,
            starttime: '123',
            shapetype: 'Line',
            x: '0.25',
            y: '0.25',
            shapedetails: { strokeWidth: 1, bezier: true, tension: 0.4 },
            shapedata: points,
        });
    });

    it('serializes arrow endpoints as board-relative values', () => {
        const { requestBody } = createShapeRequestBody(
            makeAttributes('Arrow', { points: [0, 0, 100, 50] }),
            [],
            stageSize
        );

        expect(requestBody.shapedata).toEqual([[0, 0, 0], [0, 50, 50]]);
    });

    it('uses a zero endpoint for an arrow with no complete endpoint', () => {
        const { requestBody } = createShapeRequestBody(makeAttributes('Arrow', { points: [0, 0] }), [], stageSize);

        expect(requestBody.shapedata).toEqual([[0, 0, 0], [0, 0, 0]]);
    });

    it.each([
        ['Rect', { width: 100, height: 20 }, { width: 50, height: 20 }],
        ['Circle', { radius: 10 }, { radius: 5 }],
        ['Dot', { radius: 10 }, { radius: 5 }],
        ['Ellipse', { radiusX: 20, radiusY: 10 }, { radiusX: 10, radiusY: 10 }],
        ['Grid', { hspacing: 20, vspacing: 10, width: 100, height: 50 }, { hspacing: 10, vspacing: 10, width: 50, height: 50 }],
    ])('converts %s dimensions to percentages', (name, attributes, details) => {
        const { requestBody } = createShapeRequestBody(makeAttributes(name, attributes), [], stageSize);

        expect(requestBody.shapedetails).toMatchObject(details);
    });

    it.each([
        ['Rect', { width: 0, height: 0 }, 'Rectangle requires a non-zero width or height'],
        ['Circle', { radius: 0 }, 'Circle requires a non-zero radius'],
        ['Ellipse', { radiusX: 0, radiusY: 0 }, 'Ellipse requires a non-zero X and Y radius'],
        ['Grid', { hspacing: 20, vspacing: 10, width: 0, height: 50 }, 'Grid needs to be at least one grid square in size'],
        ['Unknown', {}, 'Unknown shape type'],
    ])('rejects invalid %s attributes with the existing message', (name, attributes, error) => {
        expect(createShapeRequestBody(makeAttributes(name, attributes), [], stageSize)).toEqual({ error });
    });
});

describe('createShapeTransformRequestBody', () => {
    it('includes default transforms and board-relative dimensions', () => {
        const requestBody = createShapeTransformRequestBody(
            { x: 50, y: 25, width: 100, height: 50, radiusX: 20, radiusY: 10 },
            4,
            stageSize
        );

        expect(requestBody).toEqual({
            boardid: 4,
            shapedetails: { rotation: 0, scaleX: 1, scaleY: 1, radiusX: 10, radiusY: 10, width: 50, height: 50 },
            x: '0.25',
            y: '0.25',
        });
    });

    it('serializes transformed arrows using relative endpoint data', () => {
        const requestBody = createShapeTransformRequestBody(
            { name: 'Arrow', x: 20, y: 10, rotation: 30, scaleX: 2, scaleY: 0.5, points: [0, 0, 100, 50] },
            7,
            stageSize
        );

        expect(requestBody).toEqual({
            boardid: 7,
            shapedetails: { rotation: 30, scaleX: 2, scaleY: 0.5 },
            x: '0.1',
            y: '0.1',
            shapedata: [[0, 0, 0], [0, 50, 50]],
        });
    });
});

describe('createShapeCloneRequestBody', () => {
    it('serializes large database ids as strings and keeps relative coordinates numeric', () => {
        const requestBody = createShapeCloneRequestBody(
            { x: 50, y: 25 },
            9007199254740993n,
            stageSize
        );

        expect(requestBody).toEqual({ shapeId: '9007199254740993', x: 0.25, y: 0.25 });
    });
});

describe('createShapeUpdateRequestBody', () => {
    it('adds the current board and serializes a start time without mutating the input', () => {
        const properties = { starttime: 1234, shapedetails: { fillEnabled: false } };

        expect(createShapeUpdateRequestBody(properties, 5)).toEqual({
            starttime: '1234',
            shapedetails: { fillEnabled: false },
            boardid: 5,
        });
        expect(properties).toEqual({ starttime: 1234, shapedetails: { fillEnabled: false } });
    });

    it('preserves updates that have no start time', () => {
        expect(createShapeUpdateRequestBody({ stroke: '#123456' }, 2)).toEqual({
            stroke: '#123456',
            boardid: 2,
        });
    });
});