import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentBoardAtom } from '../atoms.js';
import Login from './Login.jsx';
import SettingsSidebar from './SettingsSidebar.jsx';
import ThumbnailNav from './ThumbnailNav.jsx';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
});

describe('Login', () => {
    it('enables creation only after required fields and starts the session', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => [] })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionInfo: { id: 42 }, token: 'presenter-token' }) });
        vi.stubGlobal('fetch', fetchMock);
        const goToSession = vi.fn();

        render(<Login goToSession={goToSession} />);

        const createButton = screen.getByRole('button', { name: 'Create presentation' });
        expect(createButton).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText('Descriptive title for presentation (required)'), { target: { value: 'Workshop' } });
        expect(createButton).toBeDisabled();
        fireEvent.change(screen.getByPlaceholderText('Presenter password (required, please remember it!)'), { target: { value: 'secret' } });
        expect(createButton).toBeEnabled();

        fireEvent.click(createButton);

        await waitFor(() => expect(goToSession).toHaveBeenCalledWith(42));
        expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/login/0'), expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ sessionname: 'Workshop', ispublic: true, presenterpw: 'secret', viewerpw: '' }),
        }));
        expect(sessionStorage.getItem('presentertoken_42')).toBe('presenter-token');
    });
});

describe('SettingsSidebar', () => {
    it('emits updated UI options when a setting is toggled', () => {
        const ui = { debugLevel: 2, mouse: true, showClock: false };
        const setUiOptions = vi.fn();
        const props = {
            showSidebar: true,
            ui,
            sessionInfo: { id: 12, sessionname: 'Workshop', ispublic: true, presenterpw: '', viewpw: '' },
            laserProperties: { color: '#ff0000', size: 1 },
            lineProperties: {
                pointsThresholdMs: 5,
                distThreshold: 0.001,
                bezier: false,
                lineTension: 0,
                showPoints: false,
            },
            mainLayer: { current: { destroyChildren: vi.fn(), batchDraw: vi.fn() } },
            ENDPOINT: 'http://localhost:8080',
            setUiOptions,
            setLineProperties: vi.fn(),
            setLaserProperties: vi.fn(),
            handleCloseSidebar: vi.fn(),
            handleSessionChange: vi.fn(),
            handleSaveImage: vi.fn(),
            doReplay: vi.fn(),
            postClear: vi.fn(),
        };
        const store = createStore();
        store.set(currentBoardAtom, 3);

        render(<Provider store={store}><SettingsSidebar {...props} /></Provider>);
        fireEvent.click(screen.getByLabelText('Show clock'));

        expect(setUiOptions).toHaveBeenCalledWith({ ...ui, showClock: true });
    });
});

describe('ThumbnailNav', () => {
    it('routes navigation actions and disables them while painting', () => {
        const navigateBoard = vi.fn();
        const props = {
            wideUI: false,
            busyPainting: false,
            busyFetching: false,
            numBoards: 1,
            boardLimits: { from: 1, to: 1, end: 8 },
            sessionId: 'session-1',
            navigateBoard,
            changeBoard: vi.fn(),
            reConfigureBoards: vi.fn(),
        };
        const store = createStore();
        store.set(currentBoardAtom, 3);

        const { rerender } = render(<Provider store={store}><ThumbnailNav {...props} /></Provider>);
        fireEvent.click(screen.getByTitle('Go to first board'));
        fireEvent.click(screen.getByTitle('Go to next board'));
        expect(navigateBoard).toHaveBeenNthCalledWith(1, 'first');
        expect(navigateBoard).toHaveBeenNthCalledWith(2, 'next');

        rerender(<Provider store={store}><ThumbnailNav {...props} busyPainting /></Provider>);
        expect(screen.getByTitle('Go to first board')).toBeDisabled();
        expect(screen.getByTitle('Go to next board')).toBeDisabled();
    });
});