const CERTPATHS = {
    cert: '/run/secrets/cert',
    key: '/run/secrets/keyfile',
    ca: '/run/secrets/ca'
}

const DEF_BOARD = {        // Default board settings (NOTE: ENSURE SYNC WITH PRESENTER UI!)
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
            cellWidth: 38,
            cellHeight: 20,
            square: true,
            snap: false,
            present: false,
            aspect: 1.77777
        }
    }
}

const DEF_UI = {
    boards: {ab: 1, sb: 1, nvb: 4},
    ui: {
        complex: false,
        mouse: false,
        penOnly: false,
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
        wipeWidth: 10,
        bezier: true,
        pointsThresholdMs: 16,
        distThreshold: 0.002,
        lineTension: 0.3,
        showPoints: false,
        allEvents: false
    },
    laser: {size: 1, color: '#ff0000'}
}

exports.CERTPATHS = CERTPATHS
exports.DEF_BOARD = DEF_BOARD
exports.DEF_UI = DEF_UI