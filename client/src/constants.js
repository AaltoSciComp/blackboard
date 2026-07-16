
export const ENDPOINT = ((!process.env.NODE_ENV || process.env.NODE_ENV === 'development') ? "http://" : "https://") + window.location.hostname + ':8080';

/**
 * Default color options for the shapes and backgrounds (user can also type any color
 * name or hex code into the input field).
 */
 export const COLOR_OPTIONS = ["#210024",
 "#001e11",
 "#00214a",
 "#581b00",
 "#3c3000",
 "#540095",
 "#7b0032",
 "#750058",
 "#00464e",
 "#4a5800",
 "#ac1900",
 "#b3007a",
 "#007135",
 "#c312d6",
 "#946e00",
 "#008482",
 "#f70081",
 "#a554ff",
 "#02a36d",
 "#bd8900",
 "#ff5873",
 "#41a3ff",
 "#00b95e",
 "#ff66e9",
 "#ff8615",
 "#ff7f8f",
 "#bfa6ff",
 "#87d000",
 "#00cff0",
 "#ffadc4",
 "#ffabf1",
 "#ffc771",
 "#f3d3ff",
 "#f4e300",
 "#bce9ff",
 "#5dffd9",
 "#a1ff5e",
 "#96ffa1",
 "#beffdc",
 "#f0ff81"]; 

/** 
 * Common settings with backend, keep in SYNC!
 */
 export const DEF_BOARD = {        // Default board settings (NOTE: ENSURE SYNC WITH PRESENTER UI!)
    color: '#284646',
    settings: {
        bg: {
            url: '',
            visible: false
        },
        grid: {
            visible: false,
            stroke: '#ffffff',
            strokeWidth: 0.04,
            opacity: 0.25,
            cellWidth: 5,
            cellHeight: 5,
            square: true,
            snap: false,
            present: false,
            aspect: 1.77777
        }
    }
}

export const DEF_UI = {
    boards: {ab: 1, sb: 1, nvb: 4},
    ui: {
        complex: false,
        mouse: false,
        showFSDialog: true, 
        showClock: true,
        showViewerCount: true,
        showPps: false,
        showFps: false,
        swipeEnabled: false,
        rotateEnabled: false
    },
    line: {
        width: 0.15,
        bezier: true,
        pointsThresholdMs: 28,
        distThreshold: 0.002,
        lineTension: 0.3,
        showPoints: false,
        allEvents: false
    },
    laser: {size: 1, color: '#ff0000'}
}

// Magic numbers...
export const DEFAULT_SHAPE_STROKE = '#f5f5f5'; // Default color for shapes
export const DEFAULT_SHAPE_FILL = '#f5f5f5';   // Default color for fills
export const HIT_STROKE_WIDTH = 20;            // Minimum width for shapes in pixels to check if clicked
export const SWIPE_X_THRESHOLD = 50;           // Minimum pixel distance for horizontal swipe to be registered
export const SWIPE_Y_THRESHOLD = 30;           // Minimum pixel distance for vertical swipe to be registered
export const HIDE_TEXTS_THRESHOLD = 1919;      // Hide toolbar texts when window narrower than this (make it just fit 4k wih 200% scaling)
export const PREVIEW_UPDATE_TIMEOUT = 3000     // Idle timer functionality, using react-idle-timer

export const SQRT2_DIV2 = 0.7071067; // Sqrt(2)/2, used with drawing ellipses

export const TOOLS = {
    Line: { name: 'Line', label: 'Draw', icon: 'Pencil', simple: true },
    Polyline: { name: 'Polyline', label: 'Polyline', icon: 'Bezier2', simple: false },
    Arrow: { name: 'Arrow', label: 'Arrow', icon: 'ArrowUpRight', simple: false },
    Rect: { name: 'Rect', label: 'Rectangle', icon: 'Square', simple: false },
    Ellipse: { name: 'Ellipse', label: 'Ellipse', icon: 'Circle', simple: false },
    Grid: { name: 'Grid', label: 'Grid', icon: 'Grid3x2', simple: false },
    Pointer: { name: 'Pointer', label: 'Laser pointer', icon: 'Magic', simple: true },
    Select: { name: 'Select', label: 'Modify shape', icon: 'Cursor', simple: false },
    Transform: { name: 'Transform', label: 'Transform shape', icon: 'ArrowsMove', simple: false },
    Delete: { name: 'Delete', label: 'Delete shapes', icon: 'Eraser', simple: true },
    Recolor: { name: 'Recolor', label: 'Recolor shapes', icon: 'PaintBucket', simple: false },
};

export const DEBUG_LEVELS = {
    NONE: 0,  // Forced messages for all users
    ERROR: 1, // Errors for users
    WARN: 2,  // Warnings for users
    INFO: 3,  // Good to know info for all users, but not crucial
    DEBUG: 4, // Errors and warnings for developers
    DEV: 5,   // Verbose info for developers
};
