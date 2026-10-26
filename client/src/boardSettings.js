import { DEF_BOARD } from './constants.js';

export function getSafeBoardSettings(settings) {
    return {
        bg: {
            visible: settings.bg?.visible ?? DEF_BOARD.settings.bg.visible,
            url: settings.bg?.url ?? DEF_BOARD.settings.bg.url,
        },
        grid: {
            visible: settings.grid?.visible ?? DEF_BOARD.settings.grid.visible,
            stroke: settings.grid?.stroke ?? DEF_BOARD.settings.grid.stroke,
            strokeWidth: settings.grid?.strokeWidth ?? DEF_BOARD.settings.grid.strokeWidth,
            opacity: settings.grid?.opacity ?? DEF_BOARD.settings.grid.opacity,
            cellWidth: settings.grid?.cellWidth ?? DEF_BOARD.settings.grid.cellWidth,
            cellHeight: settings.grid?.cellHeight ?? DEF_BOARD.settings.grid.cellHeight,
            square: settings.grid?.square ?? DEF_BOARD.settings.grid.square,
            snap: settings.grid?.snap ?? DEF_BOARD.settings.grid.snap,
            present: settings.grid?.present ?? DEF_BOARD.settings.grid.present,
            aspect: settings.grid?.aspect ?? DEF_BOARD.settings.grid.aspect,
        },
    };
}

export function getBoardPropertyUpdate(boardSettings, object, property, value, stageSize) {
    switch (object) {
        case 'grid': {
            const grid = boardSettings.settings.grid;
            let updatedGrid;
            let pending = false;

            if (grid.square && grid.aspect && (property === 'cellHeight' || property === 'cellWidth')) {
                if (property === 'cellWidth') {
                    const cellHeight = Math.max(Math.round(stageSize.width * value / stageSize.height), 1);
                    updatedGrid = { ...grid, cellWidth: value, cellHeight };
                } else {
                    const cellWidth = Math.max(Math.round(stageSize.height * value / stageSize.width), 0.5);
                    updatedGrid = { ...grid, cellHeight: value, cellWidth };
                }
            } else {
                updatedGrid = { ...grid, [property]: value };
                pending = property === 'visible' || property === 'aspect';
            }

            return {
                boardSettings: {
                    ...boardSettings,
                    settings: { ...boardSettings.settings, grid: updatedGrid },
                },
                pending,
            };
        }
        case 'bg': {
            const bg = property === 'url' && value === ''
                ? { url: '', visible: false }
                : { ...boardSettings.settings.bg, [property]: value };
            return {
                boardSettings: {
                    ...boardSettings,
                    settings: { ...boardSettings.settings, bg },
                },
                pending: true,
            };
        }
        default:
            return null;
    }
}