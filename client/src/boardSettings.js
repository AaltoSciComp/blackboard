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