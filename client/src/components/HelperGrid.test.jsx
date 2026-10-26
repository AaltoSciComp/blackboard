import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HelperGrid from './HelperGrid.jsx';

vi.mock('react-konva', async () => {
    const React = await import('react');
    return {
        Line: (props) => React.createElement('div', { 'data-testid': 'grid-line', 'data-x': props.x, 'data-y': props.y }),
    };
});

afterEach(cleanup);

describe('HelperGrid', () => {
    it('recalculates grid lines when the stage size changes', () => {
        const gridBlockSize = { x: 25, y: 20 };
        const gridProperties = { stroke: '#123456', strokeWidth: 0.5, opacity: 0.75 };
        const { getAllByTestId, rerender } = render(
            <HelperGrid stageSize={{ width: 100, height: 80 }} gridBlockSize={gridBlockSize} gridProperties={gridProperties} />
        );

        expect(getAllByTestId('grid-line')).toHaveLength(8);

        rerender(
            <HelperGrid stageSize={{ width: 200, height: 120 }} gridBlockSize={gridBlockSize} gridProperties={gridProperties} />
        );

        expect(getAllByTestId('grid-line')).toHaveLength(14);
    });
});