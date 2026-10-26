import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BoardThumbnail, { saveThumbnail } from './BoardThumbnail.jsx';
import Clock from './Clock.jsx';
import Cursor from './Cursor.jsx';
import FPSStats from './Fpsstats.jsx';
import Portal from './Portal.jsx';
import { ToastDisplay, displayError, displaySuccess } from './ToastDisplay.jsx';
import URLImage from './URLImage.jsx';

const { konvaProps, toastCalls } = vi.hoisted(() => ({
    konvaProps: { circle: null },
    toastCalls: {
        message: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
        dismiss: vi.fn(),
    },
}));

vi.mock('react-konva', async () => {
    const React = await import('react');
    return {
        Circle: (props) => {
            konvaProps.circle = props;
            return React.createElement('div', { 'data-testid': 'cursor-circle' });
        },
    };
});

vi.mock('react-hot-toast', async () => {
    const React = await import('react');
    const toast = Object.assign((...args) => toastCalls.message(...args), {
        error: (...args) => toastCalls.error(...args),
        success: (...args) => toastCalls.success(...args),
        dismiss: (...args) => toastCalls.dismiss(...args),
    });
    return {
        default: toast,
        Toaster: () => React.createElement('div', { 'data-testid': 'toast-host' }),
        ToastBar: ({ children }) => React.createElement('div', null, children({ icon: null, message: 'Saved' })),
    };
});

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    konvaProps.circle = null;
});

describe('Clock', () => {
    it('updates its displayed time every second', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-26T12:00:00'));

        render(<Clock />);
        const button = screen.getByTitle('Current time');
        expect(button.textContent).toBe(new Date('2026-10-26T12:00:00').toLocaleTimeString('fi-FI'));

        act(() => vi.advanceTimersByTime(1000));

        expect(button.textContent).toBe(new Date('2026-10-26T12:00:01').toLocaleTimeString('fi-FI'));
    });
});

describe('Cursor', () => {
    it('maps cursor coordinates and appearance to the Konva circle', () => {
        render(
            <Cursor
                penLoc={{ x: 12, y: 34 }}
                cursor={{ visible: true, radius: 8, strokeEnabled: true, stroke: '#123456', fill: '#abcdef' }}
            />
        );

        expect(konvaProps.circle).toMatchObject({
            x: 12,
            y: 34,
            visible: true,
            radius: 8,
            strokeEnabled: true,
            stroke: '#123456',
            fill: '#abcdef',
            listening: false,
        });
    });
});

describe('FPSStats', () => {
    it('requests animation frames and cancels the pending frame on unmount', () => {
        const requestFrame = vi.fn(() => 17);
        const cancelFrame = vi.fn();
        vi.stubGlobal('requestAnimationFrame', requestFrame);
        vi.stubGlobal('cancelAnimationFrame', cancelFrame);

        const { container, unmount } = render(<FPSStats top="5px" right={2} />);

        expect(requestFrame).toHaveBeenCalledOnce();
        expect(container.firstChild.style.position).toBe('fixed');
        expect(container.firstChild.style.top).toBe('5px');

        unmount();
        expect(cancelFrame).toHaveBeenCalledWith(17);
    });
});

describe('BoardThumbnail', () => {
    it('loads the stored thumbnail, marks the active board, and reports clicks', () => {
        localStorage.setItem('thumb_session-1_2', 'data:image/png;base64,stored');
        const thumbnailClicked = vi.fn();
        render(<BoardThumbnail sessionId="session-1" board={2} currentBoard={2} thumbnailClicked={thumbnailClicked} />);

        const image = screen.getByRole('img', { name: 'Board 2' });
        expect(image).toHaveAttribute('src', 'data:image/png;base64,stored');
        expect(image).toHaveClass('active');
        fireEvent.click(image);
        expect(thumbnailClicked).toHaveBeenCalledWith(2);
    });

    it('saves thumbnails under the session and board key', () => {
        saveThumbnail('session-1', 3, 'data:image/png;base64,new');
        expect(localStorage.getItem('thumb_session-1_3')).toBe('data:image/png;base64,new');
    });
});

describe('Portal', () => {
    it('renders its children into the document body', () => {
        const { container } = render(<Portal><span data-testid="portal-child">Menu</span></Portal>);

        expect(screen.getByTestId('portal-child')).toBeInTheDocument();
        expect(container).not.toContainElement(screen.getByTestId('portal-child'));
    });
});

describe('ToastDisplay', () => {
    it('forwards success and error messages to the toast service', () => {
        displaySuccess('Saved');
        displayError('Could not save');

        expect(toastCalls.success).toHaveBeenCalledWith('Saved');
        expect(toastCalls.error).toHaveBeenCalledWith('Could not save');
    });

    it('mounts the toast host', () => {
        render(<ToastDisplay />);

        expect(screen.getByTestId('toast-host')).toBeInTheDocument();
    });
});

describe('URLImage', () => {
    it('rejects a non-HTTP image URL without fetching it', () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(<URLImage url="not-a-url" currentBoard={0} bgProps={{}} setBgProps={vi.fn()} />);

        expect(consoleError).toHaveBeenCalledWith('URL seems invalid!');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});