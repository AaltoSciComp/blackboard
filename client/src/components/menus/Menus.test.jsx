import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentBoardAtom } from '../../atoms.js';
import { TOOLS } from '../../constants.js';
import { ContextMenu, getContextMenuOptions } from './ContextMenu.jsx';
import BackgroundImageMenu from './BackgroundImageMenu.jsx';
import BoardColorMenu from './BoardColorMenu.jsx';
import FillColorMenu from './FillColorMenu.jsx';
import FullScreenMenu from './FullScreenMenu.jsx';
import HelperGridMenu from './HelperGridMenu.jsx';
import LineColorMenu from './LineColorMenu.jsx';
import LineWidthMenu from './LineWidthMenu.jsx';
import ToolMenu from './ToolMenu.jsx';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('ContextMenu', () => {
    it('selects an option and keeps the menu within the viewport', () => {
        const onOptionSelected = vi.fn();
        const options = [{ id: 'clone', title: 'Clone' }, { id: 'delete', title: 'Delete' }];
        const { container } = render(
            <ContextMenu position={{ x: window.innerWidth - 20, y: window.innerHeight - 10 }} options={options} onOptionSelected={onOptionSelected} />
        );

        const menu = container.querySelector('.ctxmenu');
        expect(menu.style.left).toBe(`${window.innerWidth - 250}px`);
        expect(menu.style.top).toBe(`${window.innerHeight - 73}px`);
        fireEvent.click(screen.getByText('Delete'));
        expect(onOptionSelected).toHaveBeenCalledWith('delete');
    });

    it('offers shape-specific fill and stroke actions', () => {
        const options = getContextMenuOptions(
            {
                attrs: { name: 'Line' },
                fillEnabled: () => true,
                fill: () => '#ffffff',
                strokeEnabled: () => true,
                stroke: () => '#000000',
                bezier: () => false,
                closed: () => true,
            },
            { enabled: true, color: '#ff0000' },
            { enabled: true, color: '#00ff00' }
        );

        expect(options.map(({ id }) => id)).toEqual(expect.arrayContaining([
            'add_fill', 'remove_fill', 'recolor_stroke', 'remove_stroke', 'add_bezier', 'open_path', 'change_stroke_width', 'cancel',
        ]));
    });
});

describe('BackgroundImageMenu', () => {
    it('toggles image visibility for the current board', () => {
        const setBoardProperty = vi.fn();
        const store = createStore();
        store.set(currentBoardAtom, 2);

        render(
            <Provider store={store}>
                <BackgroundImageMenu
                    bg={{ url: 'https://example.test/background.png', visible: false }}
                    setBoardProperty={setBoardProperty}
                    updateBgImage={vi.fn()}
                    wideUI={false}
                />
            </Provider>
        );
        fireEvent.click(screen.getByTitle('Turn background image on/off'));

        expect(setBoardProperty).toHaveBeenCalledWith('bg', 'visible', true);
    });
});

describe('BoardColorMenu', () => {
    it('selects a previously used board color', () => {
        const handleBoardColorChange = vi.fn();
        const { container } = render(
            <BoardColorMenu
                boardColor="#ffffff"
                shapeColor="#000000"
                boardColors={['#123456']}
                handleBoardColorChange={handleBoardColorChange}
                handleBoardSettingsSave={vi.fn()}
                wideUI={false}
            />
        );

        fireEvent.click(screen.getByTitle('Set board color'));
        fireEvent.click(container.querySelector('.picker__swatch'));

        expect(handleBoardColorChange).toHaveBeenCalledWith('#123456');
    });
});

describe('FillColorMenu', () => {
    it('sets the fill to the eraser option', () => {
        const handleShapeColorChange = vi.fn();
        render(
            <FillColorMenu
                colorProp={{ color: '#123456', enabled: true }}
                boardColor="#ffffff"
                mode="Fill"
                fill={{ color: '#123456' }}
                stroke={{ color: '#000000' }}
                ui={{ complex: true, mouse: false }}
                sid={0}
                wideUI={false}
                handleShapeColorChange={handleShapeColorChange}
            />
        );

        fireEvent.click(screen.getByTitle('Set fill color'));
        fireEvent.click(screen.getByRole('button', { name: 'Eraser' }));

        expect(handleShapeColorChange).toHaveBeenCalledWith('fill', { color: 'wipe', enabled: true });
    });
});

describe('FullScreenMenu', () => {
    it('dismisses the initial fullscreen prompt', async () => {
        render(<FullScreenMenu size="sm" />);

        fireEvent.click(screen.getByRole('button', { name: 'No, continue windowed' }));

        await waitFor(() => expect(screen.queryByText('Enter fullscreen mode?')).not.toBeInTheDocument());
        expect(screen.getByTitle('Toggle fullscreen mode')).toBeInTheDocument();
    });
});

describe('HelperGridMenu', () => {
    it('toggles grid visibility', () => {
        const setBoardProperty = vi.fn();
        render(
            <HelperGridMenu
                grid={{ visible: false, present: false, snap: false, square: true, cellWidth: 5, cellHeight: 5, strokeWidth: 0.1, opacity: 0.5, stroke: '#ffffff' }}
                complex={false}
                wideUI={false}
                setBoardProperty={setBoardProperty}
                handleBoardSettingsSave={vi.fn()}
            />
        );

        fireEvent.click(screen.getByTitle('Turn grid on/off'));

        expect(setBoardProperty).toHaveBeenCalledWith('grid', 'visible', true);
    });
});

describe('LineColorMenu', () => {
    it('disables line color in complex mode', () => {
        const handleShapeColorChange = vi.fn();
        render(
            <LineColorMenu
                colorProp={{ color: '#123456', enabled: true }}
                boardColor="#ffffff"
                mode="Stroke"
                fill={{ color: '#ffffff' }}
                stroke={{ color: '#123456' }}
                ui={{ complex: true, mouse: false }}
                sid={0}
                wideUI={false}
                handleShapeColorChange={handleShapeColorChange}
            />
        );

        fireEvent.click(screen.getByTitle('Set line color'));
        fireEvent.click(screen.getByLabelText('Disable line'));

        expect(handleShapeColorChange).toHaveBeenCalledWith('stroke', { color: '#123456', enabled: false });
    });
});

describe('LineWidthMenu', () => {
    it('applies a preset width in simple mode', () => {
        const handleStrokeWidthChange = vi.fn();
        render(
            <LineWidthMenu
                width={0.15}
                stageSize={{ width: 1000, height: 600 }}
                ui={{ complex: false }}
                wideUI={false}
                handleStrokeWidthChange={handleStrokeWidthChange}
            />
        );

        fireEvent.click(screen.getByTitle('Set line width'));
        fireEvent.click(screen.getByText('Bold (0.35)'));

        expect(handleStrokeWidthChange).toHaveBeenCalledWith(0.35);
    });
});

describe('ToolMenu', () => {
    it('selects a simple tool from the compact toolbar', () => {
        const selectedCallback = vi.fn();
        render(<ToolMenu complexUi={false} size="sm" currentTool={TOOLS.Line} selectedCallback={selectedCallback} />);

        fireEvent.click(screen.getByTitle('Laser pointer'));

        expect(selectedCallback).toHaveBeenCalledWith(TOOLS.Pointer);
    });

    it('selects a tool from the complex menu', () => {
        const selectedCallback = vi.fn();
        render(<ToolMenu complexUi size="sm" currentTool={TOOLS.Line} selectedCallback={selectedCallback} />);

        fireEvent.click(screen.getByTitle('Select tool'));
        fireEvent.click(screen.getByText('Rectangle'));

        expect(selectedCallback).toHaveBeenCalledWith(TOOLS.Rect);
    });
});