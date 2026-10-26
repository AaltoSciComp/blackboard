import React from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import reactModal from './promiseModal.js';

afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.useRealTimers();
});

describe('reactModal', () => {
    it.each([
        { action: 'submit', value: 'password', expected: 'password' },
        { action: 'dismiss', value: undefined, expected: undefined },
    ])('resolves on $action and destroys the modal after the delay', async ({ action, value, expected }) => {
        vi.useFakeTimers();
        let resolveModalAction;
        const renderModal = ({ show, onSubmit, onDismiss }) => {
            resolveModalAction = action === 'submit' ? onSubmit : onDismiss;
            return show
                ? <button onClick={() => resolveModalAction(value)}>Continue</button>
                : <div data-testid="hidden-modal">Hidden</div>;
        };

        let confirmation;
        act(() => {
            confirmation = reactModal(renderModal, { destructionDelay: 50 });
        });
        const container = screen.getByRole('button', { name: 'Continue' }).parentElement;

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await act(async () => {
            await expect(confirmation).resolves.toBe(expected);
        });
        expect(screen.getByTestId('hidden-modal')).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(50);
        });

        expect(document.body).not.toContainElement(container);
    });
});