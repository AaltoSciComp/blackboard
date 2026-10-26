import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentBoardAtom } from '../atoms.js';
import Background from './Background.jsx';

const { rectProps } = vi.hoisted(() => ({ rectProps: { current: null } }));

vi.mock('react-konva', async () => {
    const React = await import('react');
    return {
        Rect: (props) => {
            rectProps.current = props;
            return React.createElement('div', { 'data-testid': 'background-rect' });
        },
    };
});

afterEach(() => {
    cleanup();
    rectProps.current = null;
});

function renderBackground({ currentBoard = 0, stageSize, bgProps, boardSettings }) {
    const store = createStore();
    store.set(currentBoardAtom, currentBoard);
    return render(
        <Provider store={store}>
            <Background stageSize={stageSize} bgProps={bgProps} boardSettings={boardSettings} />
        </Provider>
    );
}

describe('Background', () => {
    it('shows and scales the current board image when its background is visible', () => {
        const image = {};
        renderBackground({
            currentBoard: 1,
            stageSize: { width: 800, height: 600 },
            bgProps: { 1: { blobsrc: 'blob:board-image', image, x: 400, y: 300 } },
            boardSettings: { color: '#ffffff', settings: { bg: { visible: true } } },
        });

        expect(rectProps.current).toMatchObject({
            width: 800,
            height: 600,
            fill: null,
            fillPatternImage: image,
            fillPatternScaleX: 2,
            fillPatternScaleY: 2,
            listening: false,
        });
    });

    it('uses the board color when no visible background image is available', () => {
        renderBackground({
            stageSize: { width: 800, height: 600 },
            bgProps: { 0: { x: 0, y: 0 } },
            boardSettings: { color: '#abc123', settings: { bg: { visible: true } } },
        });

        expect(rectProps.current).toMatchObject({
            fill: '#abc123',
            fillPatternScaleX: 800,
            fillPatternScaleY: 600,
        });
    });
});