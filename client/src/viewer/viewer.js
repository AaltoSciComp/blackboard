/**
 * Presentation viewer entry point.
 *
 * This module renders the read-only presentation grid used by viewers
 * (viewed from viewer.html). It is loaded as a native ES module by Vite,
 * which bundles Konva, socket.io-client, Toastify and LZString from
 * node_modules together with the shared pure helpers under src/, so the
 * viewer and the React presenter app share all non-visual logic.
 *
 * Everything Konva/DOM/socket-free lives in:
 * - viewerCore.js (grid layouts, view ranges, chaining)
 * - viewerCache.js (board caching / dirty tracking)
 * - shapeFactory.js (database shape -> Konva attribute conversion)
 * - pixelUtils.js (coordinate math)
 * and is unit tested under src/viewer/*.test.js.
 */

import Konva from 'konva';
import { io } from 'socket.io-client';
import Toastify from 'toastify-js';
import LZString from 'lz-string';

import { makeKonvaGrid, pctToPixels, sleep } from '../pixelUtils.js';
import {
    boardIsInView,
    debounce,
    getBoardGridConfig,
    getPhysicalCanvasId,
    getViewRange,
    makeChainable,
} from './viewerCore.js';
import { createBoardCache } from './viewerCache.js';
import { createShapeSpec, getArrowPoints, scaleShapeDetailProperty, toPixelPoints } from './shapeFactory.js';
import { getViewerHelperGridSpec } from './viewerGrid.js';

let globalBusyDrawingNonce;
const borderWidth = 0.003;

const screenSize = { width: window.innerWidth, height: window.innerHeight };

let laserColor = '#ff0000'; // laser pointer default color
let laserSize = 0.005; // laser pointer size relative to board width

let numVisBoards; // number of visible boards
let activeBoard = 0; // active board (unlimited or 1...999)
let startingBoard; // starting board in view (coming from server)
let activeStage; // active stage (fixed in 1..numVisBoards)
let from; // smallest board # visible (old value)
let to; // largest board # visible
let offline = false; // if set, browse pages offline from local storage
let defaultBoardColor;
let gotSettings = false;
let stageFinished = false;
let playShapesGoingOn = false;

const urlParams = new URLSearchParams(window.location.search);
const sid = Number(urlParams.get('s'));
let offset = Number(urlParams.get('offset')) || 0;
const insecure = Number(urlParams.get('insecure'));

const makeSocket = () => (insecure
    ? io('http://' + window.location.hostname + ':8080', { transports: ['websocket'] })
    : io('https://' + window.location.hostname + ':8080', { transports: ['websocket'], secure: true }));

let socket = makeSocket();
const stage = [];
// separate layers for bg and actual stuff
const layer = { bg: [], grid: [], main: [] };
// bg rectangle (separates boards and indicates current one)
const bgRect = [];
const bgNumber = [];
const bgImage = [];
const imageObj = [];
// Hide fullscreen toggle fstoggle when idle
let idleTimer = null;
let idleState = false;
const elem = document.documentElement; // Needed for fullscreen
let highlightStage = null;
let highlightLayer = null;
let highlightRect = null;

document.getElementById('boardnumber').innerHTML = from;

document.title += ' / ' + sid;

// lines need to be drawn one at a time so the coordinates are not mixed up
const drawShapeChain = makeChainable(drawShape);
const playShapesChain = makeChainable(playShapes);

// Shameless copy from https://stackoverflow.com/questions/4777077/removing-elements-by-class-name
function removeElementsByClass(className) {
    const elements = document.getElementsByClassName(className);
    while (elements.length > 0) {
        elements[0].parentNode.removeChild(elements[0]);
    }
}

/**
 * Board cache: modification times, dirty flags and (de)compressed copies in
 * sessionStorage (working cache) and localStorage (offline backup).
 * See viewerCache.js.
 */
const boardCache = createBoardCache({
    sid,
    store: sessionStorage,
    backupStore: localStorage,
    compress: (s) => LZString.compress(s),
    decompress: (s) => LZString.decompress(s),
    requestBoard: (id) => socket.emit('request_boards', { sid: sid, token: getToken(), from: id, to: id }),
});
const {
    cacheDirty,
    cacheIsUpToDate,
    setCachedBoard,
    getCachedBoard,
    backupAndDeleteCachedBoards,
} = boardCache;

function connectSocket() {
    if (!socket.connected) {
        socket = makeSocket();
    } else {
        Toastify({
            text: 'You are already connected to the server',
            duration: 5000,
            gravity: 'top',
            position: 'left',
            className: 'toastify-error',
        }).showToast();
    }
}

function disconnectSocket() {
    if (socket.connected) {
        socket.disconnect();
        Toastify({
            text: 'Disconnected from server, you are now in offline mode',
            duration: 5000,
            gravity: 'top',
            position: 'left',
            className: 'toastify-error',
        }).showToast();
    }
}

const debouncedfitStage = debounce(function fitStageIntoParentContainer() {
    screenSize.width = window.innerWidth;
    screenSize.height = window.innerHeight;
    highlightStage = null;
    highlightLayer = null;
    highlightRect = null;
    reconfigureBoards();
}, 1000);

window.addEventListener('resize', debouncedfitStage);

// Only handle window resize events once per second
function showToggles() {
    clearTimeout(idleTimer);
    if (idleState == true) {
        document.querySelector('#controlbox').classList.remove('inactive');
        document.body.style.cursor = 'default';
    }
    idleState = false;
    idleTimer = setTimeout(function () {
        document.querySelector('#controlbox').classList.add('inactive');
        document.body.style.cursor = 'none';
        idleState = true;
    }, 2000);
}

showToggles();

window.addEventListener('pointermove', () => {
    showToggles();
});

document.querySelector('#fstoggle').addEventListener('click', () => {
    toggleFullscreen();
});

document.querySelector('#offlinetoggle').addEventListener('click', () => {
    toggleOffline();
});

document.querySelector('#go_previous').addEventListener('click', () => {
    goPrev();
});

document.querySelector('#go_next').addEventListener('click', () => {
    goNext();
});

document.querySelector('#offset_increase').addEventListener('click', () => {
    increaseOffset();
});

document.querySelector('#offset_decrease').addEventListener('click', () => {
    decreaseOffset();
});

document.querySelector('#offset_reset').addEventListener('click', () => {
    resetOffset();
});

document.querySelector('#gohome').addEventListener('click', () => {
    goToHome();
});

function goFirst() {
    if (offline) setActiveBoard({ ab: 1 });
}

function goNext() {
    if (offline) setActiveBoard({ ab: activeBoard + 1 });
}

function goPrev() {
    if (offline && activeBoard > 1) setActiveBoard({ ab: activeBoard - 1 });
}

document.onkeydown = function (e) {
    switch (e.keyCode) {
        case 37:
            // left
            goPrev();
            break;
        case 38:
            // up
            goFirst();
            break;
        case 39:
            // right
            goNext();
            break;
        case 40:
            // down
            //goLast(); //not yet implemented
            break;
        default:
            break;
    }
};

/**
 * Full screen on/off
 */
function is_fullscreen() {
    return (document.fullscreenElement != null || document.webkitIsFullScreen);
}

function toggleFullscreen() {
    if (is_fullscreen()) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
        }
    } else {
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
    }
}

function toggleOffline() {
    if (offline) {
        offline = false;
        document.getElementById('offlinetoggle').innerHTML = 'Go offline';
        document.querySelector('#navcontrols').classList.add('hidden');
        document.querySelector('#offsetcontrols').classList.remove('hidden');
        highlightLayer.visible(true);
        connectSocket();
        initializeGridView();
    } else {
        offline = true;
        document.getElementById('offlinetoggle').innerHTML = 'Go online';
        document.querySelector('#navcontrols').classList.remove('hidden');
        document.querySelector('#offsetcontrols').classList.add('hidden');
        backupAndDeleteCachedBoards();
        disconnectSocket();
        numVisBoards = 1;
        from = activeBoard;
        to = activeBoard;
        prepareStage();
        highlightLayer.visible(false);
        setActiveBoard({ ab: activeBoard });
    }
}

function increaseOffset() {
    offset++;
    initializeGridView();
}

function decreaseOffset() {
    offset--;
    initializeGridView();
}

function resetOffset() {
    offset = 0;
    initializeGridView();
}

function goToHome() {
    location.assign(window.location.origin);
}

function setFromTo(sbFromPresenter) {
    const range = getViewRange(sbFromPresenter, numVisBoards, offset);
    from = range.from;
    to = range.to;
}

function highlightBoard(phys) {
    if (!gotSettings) return;
    const container = document.getElementById('container' + phys);
    if (!container || !highlightRect) return;
    const newX = parseInt(container.style.left, 10);
    const newY = parseInt(container.style.top, 10);
    const newWidth = parseInt(container.style.width, 10);
    const newHeight = parseInt(container.style.height, 10);
    highlightRect.to({ x: newX, y: newY, width: newWidth, height: newHeight, easing: Konva.Easings.StrongEaseOut });
}

function setActiveBoard(json, init = false) {
    let keep_ab = false;
    if (offline) {
        const oldboard = activeBoard;
        from = json.ab;
        to = json.ab;
        // initBoard returns false if board not found from cache
        if (!initBoard(json.ab)) {
            from = oldboard;
            to = oldboard;
            activeBoard = oldboard;
            keep_ab = true; // don't increment activeBoard if we have nothing in cache
            Toastify({
                text: 'Board content not found in cache!',
                duration: 5000,
                gravity: 'top',
                position: 'left',
                className: 'toastify-error',
            }).showToast();
        }
        document.getElementById('boardnumber').innerHTML = from;
    } else {
        // We are online, controlled by presenter...
        if (!gotSettings) return;
        /**
         * If new active board is within view, don't change the view range
         * but only request and highlight the new active board
         */
        if ((numVisBoards > 1) && (json.sb === from) && !init) {
            // Init is set when running for the first time
            if (json.ab !== activeBoard) {
                // stop any drawing still going on
                globalBusyDrawingNonce = new Object();
                setFromTo(json.sb);
                const abIndex = json.ab - json.sb; // active board's index within the array of modification times
                const uptodate = cacheIsUpToDate(json.ab, json.mods[abIndex]);
                if (!uptodate) {
                    const token = getToken();
                    if (token) {
                        socket.emit('request_boards', { sid: sid, token: token, from: json.ab, to: json.ab });
                    } else {
                        // XXX we have lost session at this point
                        return;
                    }
                }
            }
        } else {
            setFromTo(json.sb);
            for (let i = from; i < from + numVisBoards; i++) {
                initBoard(i);
            }
        }
    }

    if (!keep_ab) activeBoard = Number(json.ab); // Don't update activeBoard when in offline mode and cached board not found

    /** Boards are never highlighted when:
     * - in offline mode
     * - offset > 0 (we only show boards after the current view)
     * - offset < 0 and not in the "first page"
     */
    if (offline || (offset > 0)) {
        highlightLayer.visible(false);
        return;
    }

    if (offset < 0) {
        if (activeBoard > to) {
            highlightLayer.visible(false);
            return;
        } else {
            highlightLayer.visible(true);
        }
    }

    const newAs = getPhysicalCanvasId(activeBoard, from, to);
    highlightBoard(newAs);
}

async function reconfigureBoards() {
    await prepareStage();
    for (let i = from; i <= to; i++) {
        initBoard(i);
    }
    activeStage = getPhysicalCanvasId(activeBoard, from, to);
    if (!offline && activeStage) await highlightBoard(activeStage);
}

async function prepareContainers() {
    if (typeof (from) === 'undefined') {
        console.log('FROM MISSING');
        return;
    }
    const parentDiv = document.getElementById('stage-parent');
    const helperDiv = document.getElementById('helperdiv');
    // Remove old containers
    removeElementsByClass('gridboard');
    let containerid = 1;
    const grid = getBoardGridConfig(numVisBoards);
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            let newDiv = document.getElementById('container' + containerid);
            let recreate = false;
            if (newDiv === null) {
                newDiv = document.createElement('div');
                recreate = true;
            }
            newDiv.style.position = 'absolute';
            newDiv.style.width = (screenSize.width * (1 / grid.cols)).toString() + 'px';
            newDiv.style.height = (screenSize.height * (1 / grid.rows)).toString() + 'px';
            newDiv.style.left = (col * screenSize.width * (1 / grid.cols)).toString() + 'px';
            newDiv.style.top = (row * screenSize.height * (1 / grid.rows)).toString() + 'px';
            newDiv.classList.add('gridboard'); // Add a class so containers can be deleted
            newDiv.setAttribute('id', 'container' + containerid.toString());
            if (recreate) parentDiv.insertBefore(newDiv, helperDiv);
            containerid++;
        }
    }
}

async function initializeGridView() {
    socket.off('login_success');

    socket.on('login_success', function (json) {
        if (json.nvb > 0) { // sanity check the response
            sessionStorage.setItem('viewertoken_' + sid, json.token);
            numVisBoards = Number(json.nvb);
            activeBoard = Number(json.ab);
            startingBoard = Number(json.sb);
            from = startingBoard; // Initialize from to be equal to startingBoard
            to = from + numVisBoards - 1;
            if (json.defaultBoardColor !== defaultBoardColor) {
                defaultBoardColor = json.defaultBoardColor;
            }
            gotSettings = true;

            prepareStage()
                .then(function () {
                    const newAs = getPhysicalCanvasId(activeBoard, from, to);
                    if (!offline && newAs) highlightBoard(newAs);
                });
            const dn = parseInt(Date.now());
            setActiveBoard({ ab: activeBoard, sb: startingBoard, nvb: numVisBoards, mods: [dn, dn, dn, dn] }, true);
            document.getElementById('offset').innerHTML = offset;
        } else {
            console.error('Got invalid response from server');
        }
    });

    if (urlParams.get('promptpw') === 'true') {
        // Show login prompt if password is set for the session
        basicLogin();
    } else {
        // Otherwise just login with a blank password
        initSocketCallbacks();
        socket.emit('viewer_login', { pw: '', sid: sid, offset: offset });
    }
}

async function prepareStage() {
    if (!gotSettings) return;
    // First create divs (DOM containers) to host Konva Stages in
    await prepareContainers();
    const grid = getBoardGridConfig(numVisBoards);
    for (let i = 1; i <= numVisBoards; i++) {
        const boardWidth = screenSize.width * (1 / grid.cols);
        const boardHeight = screenSize.height * (1 / grid.rows);
        stage[i] = new Konva.Stage({
            container: 'container' + i,
            width: boardWidth,
            height: boardHeight,
        });

        layer.main[i] = new Konva.Layer({ listening: false, transformsEnabled: 'none' });
        layer.bg[i] = new Konva.Layer({ listening: false, transformsEnabled: 'none' });
        layer.grid[i] = new Konva.Layer({ listening: false, transformsEnabled: 'none' });

        bgNumber[i] = new Konva.Text({
            x: boardWidth * 0.5,
            y: boardHeight * 0.5,
            text: '??',
            fontSize: boardWidth * 0.1,
            fill: 'darkslategrey',
        });
        bgNumber[i].offsetX(bgNumber[i].width() * 0.5);
        bgNumber[i].offsetY(bgNumber[i].height() * 0.5);

        bgRect[i] = new Konva.Rect({
            x: 0,
            y: 0,
            width: boardWidth,
            height: boardHeight,
            stroke: 'black',
            strokeWidth: borderWidth * (1 / grid.rows) * screenSize.width,
            fill: defaultBoardColor,
        });

        bgImage[i] = new Konva.Image({
            x: 0,
            y: 0,
            width: boardWidth,
            height: boardHeight,
        });

        layer.bg[i].add(bgNumber[i]);
        layer.bg[i].add(bgRect[i]);
        layer.bg[i].add(bgImage[i]);

        stage[i].add(layer.bg[i]);
        stage[i].add(layer.grid[i]);
        stage[i].add(layer.main[i]);
    }
    if (!highlightStage) {
        highlightStage = new Konva.Stage({
            container: 'highlight-parent',
            width: screenSize.width,
            height: screenSize.height,
        });
        highlightLayer = new Konva.Layer({ listening: false, transformsEnabled: 'none' });
        highlightRect = new Konva.Rect({
            x: 0,
            y: 0,
            width: screenSize.width,
            height: screenSize.height,
            stroke: 'yellow',
            strokeWidth: borderWidth * (1 / grid.rows) * screenSize.width,
            fillEnabled: false,
            listening: false,
        });
        highlightLayer.add(highlightRect);
        highlightStage.add(highlightLayer);
    }
    stageFinished = true;
}

async function drawLaserPointer(target, x, y) {
    if (!stageFinished) return { error: true, reason: 'stage_not_ready' };
    if (target !== null) {
        const layerWidth = layer.main[target].width();
        const layerHeight = layer.main[target].height();
        const laserPoint = new Konva.Circle({
            fill: laserColor,
            radius: layerWidth * laserSize * 0.005,
            strokeEnabled: false,
            x: x * layerWidth,
            y: y * layerHeight,
            perfectDrawEnabled: false,
            listening: false,
        });
        if (layer.main[target] === null) {
            return { error: true, reason: 'layer_null' };
        } else {
            layer.main[target].add(laserPoint);
            new Konva.Tween({
                node: laserPoint,
                duration: 0.25,
                opacity: 0,
                onFinish: function () {
                    laserPoint.destroy();
                },
            }).play();

            const mainlaser = layer.main[target].findOne('#mainlaser');

            if (mainlaser) {
                mainlaser.position({ x: x * layerWidth, y: y * layerHeight });
            } else {
                const laserDot = new Konva.Circle({
                    id: 'mainlaser',
                    fill: laserColor,
                    radius: layerWidth * laserSize * 0.005,
                    strokeEnabled: false,
                    x: x * layerWidth,
                    y: y * layerHeight,
                    perfectDrawEnabled: false,
                    listening: false,
                });
                layer.main[target].add(laserDot);
            }

            layer.main[target].batchDraw();
        }
    }
    return { error: false };
}

// draw a single shape
async function drawShape(shape, target, localBusyDrawingNonce, options) {
    if (!stageFinished) return { error: true, reason: 'stage_not_ready' };
    if (localBusyDrawingNonce !== globalBusyDrawingNonce) { return { error: true, reason: 'interrupted' }; }
    if (target !== null) {
        const layerWidth = layer.main[target].width();
        const layerHeight = layer.main[target].height();
        const functionCallTime = Date.now();
        const spec = createShapeSpec(shape, layerWidth, layerHeight);
        if (!spec) {
            // Bail out if shape not known, but don't crash
            console.log('Unknown shape type found!');
            return { error: false, reason: 'unknown shape type' };
        }
        if (spec.konvaClass === 'Shape') {
            // Grid shapes are drawn with a custom sceneFunc (shared with the presenter app)
            spec.attrs.sceneFunc = makeKonvaGrid;
        }
        const thisShape = new Konva[spec.konvaClass](spec.attrs);
        // Live draw_shape messages use the key "shapeid" instead of "id"
        thisShape.setAttr('dbId', shape.id !== undefined ? shape.id : shape.shapeid);
        if (layer.main[target] === null) {
            return { error: true, reason: 'layer_null' };
        } else {
            layer.main[target].add(thisShape);
            if (shape.shapedata && shape.shapetype !== 'Arrow') {
                let linePoints = []; // Helper array into which we push coordinates instead of concat for better performance
                for (const point of shape.shapedata) {
                    if (!options.drawAsap) {
                        let newPoints = thisShape.points().concat(point[1] * layerWidth, point[2] * layerHeight);
                        thisShape.points(newPoints);
                        const currentTime = Date.now();
                        const currentPointTimeOffset = parseInt(point[0]);
                        const pointWaitTime = functionCallTime + currentPointTimeOffset - currentTime;
                        if (pointWaitTime > 5) {
                            await sleep(pointWaitTime - 2);
                        }
                        if (localBusyDrawingNonce !== globalBusyDrawingNonce) { return { error: true, reason: 'interrupted' }; }
                        thisShape.draw();
                    } else {
                        // If drawing asap, just push the new points to temp array and move on
                        linePoints.push(point[1] * layerWidth, point[2] * layerHeight);
                    }
                }
                if (options.drawAsap) {
                    // Use our temp array to update all points of the line in one go
                    thisShape.points(linePoints);
                }
                thisShape.draw();
            }
        }
    }
    return { error: false };
}

// options: skipPenUps, drawAsap
function drawGrid(boardid, settings) {
    if (!stageFinished) return;
    if (!settings) return;
    const target = getPhysicalCanvasId(boardid, from, to);
    if (target === null) return;
    if (layer.main[target] === null || layer.main[target] === undefined) return;
    const layerWidth = layer.bg[target].width();
    const layerHeight = layer.bg[target].height();
    layer.grid[target].destroyChildren();
    if (!layerWidth || !layerHeight) return;

    if (settings.visible && settings.present) {
        const grid = getViewerHelperGridSpec(layerWidth, layerHeight, settings);
        grid.lines.forEach((line) => {
            const gridLine = new Konva.Line({
                x: line.x,
                y: line.y,
                points: line.points,
                stroke: grid.stroke,
                strokeWidth: grid.strokeWidth,
                strokeEnabled: true,
                opacity: grid.opacity,
            });
            layer.grid[target].add(gridLine);
        });
    }
}

// options: skipPenUps, drawAsap
async function playShapes(boardid, json, options) {
    const localBusyDrawingNonce = globalBusyDrawingNonce = new Object();
    playShapesGoingOn = true;
    if (!stageFinished) return;
    const target = getPhysicalCanvasId(boardid, from, to);
    if (target === null) {
        playShapesGoingOn = false;
        return;
    }
    if (layer.main[target] === null || layer.main[target] === undefined) {
        playShapesGoingOn = false;
        return;
    }
    const functionCallTime = Date.now(); // the time we called this replay function
    let lineWaitTime;
    const layerWidth = layer.main[target].width();
    const layerHeight = layer.main[target].height();
    layer.main[target].destroyChildren();
    const requestBoardRedraw = () => {
        playShapesGoingOn = false;
        const token = getToken();
        if (token) {
            socket.emit('request_boards', { sid: sid, token: token, from: boardid, to: boardid });
        } else {
            // XXX we have lost session at this point
            return;
        }
    };
    if (json.length) {
        const origDrawStartTime = parseInt(json[0].starttime);
        let replayTimeDiff = functionCallTime - origDrawStartTime; // how much time has passed since original drawing started
        for (const shape of json) {
            if (!options.drawAsap) {
                const currentLineStartTime = Date.now();
                lineWaitTime = (parseInt(shape.starttime) + replayTimeDiff) - currentLineStartTime;
                if (!options.skipPenUps) { // draw shapes without a delay between each
                    if (localBusyDrawingNonce !== globalBusyDrawingNonce) {
                        // board changed while drawing... request the board to redraw
                        requestBoardRedraw();
                        return;
                    } else {
                        if (lineWaitTime > 5) {
                            await sleep(lineWaitTime - 2);
                        }
                    }
                }
            }
            if (localBusyDrawingNonce !== globalBusyDrawingNonce) {
                // board changed while drawing... request the board to redraw
                requestBoardRedraw();
                return;
            }
            const result = await drawShape(shape, target, localBusyDrawingNonce, options);
            if (result.error) {
                //console.info(result.reason + ' at board ' + shape.boardid);
            }
        }
    }
    if (options.drawAsap) {
        layer.main[target].batchDraw();
    }
    playShapesGoingOn = false;
}

/**
 * If board is in the current view range, do the following:
 * - Get cached data for board (may request new data if not up to date)
 * - Update bgnumber (board number)
 * - Load background image from given URL if visible
 * - Change bgrect (layer.bg) color to board color, or remove fill to reveal board number
 * - Draw grid if present on current board (on layer.bg)
 * - Draw board data on layer.main if available, else clear the layer
 *
 * Returns false if viewer not yet initialized, or board not in view
 * */
function initBoard(board) {
    if (!gotSettings) return false;
    if (!boardIsInView(board, from, to)) return false;
    const data = getCachedBoard(board, offline); // use second argument to use backup when offline
    const physid = getPhysicalCanvasId(board, from, to);
    if (!physid) return false;
    if (!layer.bg[physid]) return false;

    const bgrect = layer.bg[physid].findOne('Rect');
    const bgnumber = layer.bg[physid].findOne('Text');
    if (bgnumber) {
        bgnumber.text(board); // update board number
    }
    /**
     * If a background image is visible, check that the url exists
     * and create an image object for the physical canvas.
     * */
    if (data?.data?.settings?.bg?.visible) {
        if (data?.data?.settings?.bg?.url.length) {
            imageObj[physid] = new Image();
            imageObj[physid].onload = function () {
                bgImage[physid].image(imageObj[physid]);
            };
            imageObj[physid].src = data.data.settings.bg.url;
            bgImage[physid].visible(true);
        } else {
            console.error('Background image URL missing');
            bgImage[physid].visible(false);
        }
    } else {
        bgImage[physid].visible(false);
    }
    if (bgrect) {
        if (data?.data?.settings?.color) {
            bgrect.attrs.fillEnabled = true;
            bgrect.attrs.fill = data.data.settings.color;
        } else {
            bgrect.attrs.fillEnabled = false;
            bgrect.attrs.fill = '#000';
        }
        layer.bg[physid].draw();
    }
    if (data?.data?.settings?.grid) {
        drawGrid(board, data.data.settings.grid);
    } else {
        layer.grid[physid].destroyChildren();
        layer.grid[physid].draw();
    }
    if (data?.data?.data?.length) {
        // Need to chain playLines commands for each board so they don't mess with the drawingNonces
        playShapesChain(board, data.data.data, { skipPenUps: 1, drawAsap: 1 });
    } else {
        // if no data, we clear what we have and replace with a board number
        layer.main[physid].destroyChildren();
        layer.main[physid].draw();
    }
    return true;
}

function basicLogin() {
    initSocketCallbacks();
    const password = prompt('Password for the board');
    socket.emit('viewer_login', { pw: password, sid: sid, offset: offset });
}

function getToken() {
    const token = sessionStorage.getItem('viewertoken_' + sid);
    if (!token) {
        initializeGridView();
        return false;
    } else return token;
}

function removeLasers() {
    for (let i = 1; i <= layer.main.length; i++) {
        if (layer.main[i]) {
            const laser = layer.main[i].findOne('#mainlaser');
            if (laser) laser.destroy();
        }
    }
}

function requestBoardFromServer(boardid) {
    const token = getToken();
    if (token) {
        socket.emit('request_boards', { sid: sid, token: token, from: boardid, to: boardid });
    } else {
        // XXX we have lost session at this point
        return;
    }
}

/**
 * Apply a live shape_modified update to a Konva node. Geometry properties
 * scaled to pixels are delegated to scaleShapeDetailProperty (unit tested).
 */
function applyShapeUpdate(modShape, json, physid) {
    const layerWidth = layer.main[physid].width();
    const layerHeight = layer.main[physid].height();
    const nodeName = modShape.attrs.name;

    if (typeof (json.x) !== 'undefined') modShape.x(json.x * layerWidth);
    if (typeof (json.y) !== 'undefined') modShape.y(json.y * layerHeight);
    if (typeof (json.stroke) !== 'undefined') modShape.stroke(json.stroke);
    if (typeof (json.fill) !== 'undefined') modShape.fill(json.fill);

    // Only process options from shapedetails if given
    if (typeof (json.shapedetails) !== 'undefined') {
        if (typeof (json.shapedetails.scaleX) !== 'undefined') modShape.scaleX(json.shapedetails.scaleX);
        if (typeof (json.shapedetails.scaleY) !== 'undefined') modShape.scaleY(json.shapedetails.scaleY);

        if (nodeName === 'Dot') {
            if (typeof (json.shapedetails.radius) !== 'undefined') modShape.radius(pctToPixels(json.shapedetails.radius, layerWidth));
        } else {
            // Rotation only matters for shapes other than Dot
            if (typeof (json.shapedetails.rotation) !== 'undefined') modShape.rotation(json.shapedetails.rotation);

            if (nodeName === 'Line') {
                if (typeof (json.shapedetails.bezier) !== 'undefined') modShape.bezier(json.shapedetails.bezier);
                if (typeof (json.shapedetails.tension) !== 'undefined') modShape.tension(Number(json.shapedetails.tension));
                if (typeof (json.shapedetails.closed) !== 'undefined') modShape.closed(json.shapedetails.closed);
            } else if (nodeName !== 'Arrow') {
                // Arrows are points-based like lines, no width/height to update
                for (const property of ['radiusX', 'radiusY', 'width', 'height']) {
                    if (typeof (json.shapedetails[property]) !== 'undefined') {
                        const scaled = scaleShapeDetailProperty(nodeName, property, json.shapedetails[property], layerWidth, layerHeight);
                        if (scaled !== undefined) modShape[property](scaled);
                    }
                }
            }
        }
        if (typeof (json.shapedetails.strokeWidth) !== 'undefined') modShape.strokeWidth(pctToPixels(json.shapedetails.strokeWidth, layerWidth));
        if (typeof (json.shapedetails.strokeEnabled) !== 'undefined') modShape.strokeEnabled(json.shapedetails.strokeEnabled);
        if (typeof (json.shapedetails.fillEnabled) !== 'undefined') modShape.fillEnabled(json.shapedetails.fillEnabled);
    }
    if (typeof (json.shapedata) !== 'undefined') {
        if (nodeName === 'Arrow') {
            // Arrows: shapedata contains relative coordinates [[0, 0, 0], [0, rel_x, rel_y]] as percentages
            // Points are relative to arrow position
            modShape.points(getArrowPoints(json.shapedata, layerWidth, layerHeight));
        } else {
            // Lines: shapedata contains relative points
            modShape.points(toPixelPoints(json.shapedata, layerWidth, layerHeight));
        }
    }
}

function initSocketCallbacks() {
    const events = [
        'disconnect', 'presenter_connected', 'presenter_disconnected', 'password_changed',
        'login_failed', 'board_data', 'shape_modified', 'shapes_recolored', 'shapes_deleted',
        'draw_line', 'draw_shape', 'draw_partial_shape', 'laserloc', 'laser_on', 'laser_off',
        'play_shapes', 'change_board_settings', 'set_active_board', 'reconfigure_boards',
        'clear_board', 'clear_all',
    ];
    events.forEach(event => socket.off(event));

    socket.on('disconnect', function () {
        disconnectSocket();
    });

    socket.on('presenter_connected', function () {
        Toastify({
            text: 'Board presenter connected',
            duration: 1500,
            gravity: 'top',
            position: 'left',
        }).showToast();
    });

    socket.on('presenter_disconnected', function () {
        Toastify({
            text: 'Board presenter disconnected',
            duration: 1500,
            gravity: 'top',
            position: 'left',
            className: 'toastify-error',
        }).showToast();
    });

    socket.on('password_changed', function () {
        sessionStorage.removeItem('viewertoken_' + sid);
        Toastify({
            text: 'Board password has been changed. Please wait 3 seconds for page to refresh.',
            duration: 3000,
            gravity: 'top',
            position: 'left',
            className: 'toastify-error',
            callback: function () {
                // We need to set promptpw to true in case there was not a password previously set
                const queryParams = new URLSearchParams(location.search);
                queryParams.set('promptpw', 'true');
                location.search = queryParams.toString();
            },
        }).showToast();
    });

    socket.on('login_failed', function (error) {
        sessionStorage.removeItem('viewertoken_' + sid);
        Toastify({
            text: error,
            duration: 3000,
            gravity: 'top',
            position: 'left',
            className: 'toastify-error',
            callback: function () { location.reload(); },
        }).showToast();
        socket.disconnect();
    });

    socket.on('board_data', function (json) {
        if (!gotSettings) return;
        // Apply data if it's fresher than cache, or if we had marked the board
        // dirty (e.g. after a failed local delete/recolor) and requested it
        if (!cacheIsUpToDate(json.data.boardid, json.mod) || cacheDirty[json.data.boardid] === true) {
            setCachedBoard(json.data.boardid, { mod: json.mod, data: json.data });
            initBoard(json.data.boardid); // returns immediately if board is not in view
        }
    });

    socket.on('shape_modified', function (json) {
        cacheDirty[json.boardid] = true;
        const physid = getPhysicalCanvasId(json.boardid, from, to);
        const modShape = layer.main[physid].findOne(node => {
            return node.getAttr('dbId') == json.id; // Note == instead of === since shape ids may be strings (bigint)
        });
        if (modShape !== undefined) {
            // For now, just reload the board if we need to move a shape up or down the stack
            if (json.starttime) {
                requestBoardFromServer(json.boardid);
            } else {
                applyShapeUpdate(modShape, json, physid);
                layer.main[physid].batchDraw();
            }
        } else {
            requestBoardFromServer(json.boardid);
        }
    });

    /**
     * Find shapes on a layer by their database ids (== since ids may be strings from bigint).
     */
    const findShapesByIds = (physid, shapeids) => {
        const BreakException = {};
        const found = [];
        try {
            shapeids.forEach(shapeid => {
                const shape = layer.main[physid].findOne(node => node.getAttr('dbId') == shapeid);
                if (shape === undefined) throw BreakException;
                found.push(shape);
            });
            return { shapes: found };
        } catch (e) {
            if (e === BreakException) return { error: true };
            throw e;
        }
    };

    /**
     * Act on the shapes_recolored message.
     * Try to recolor just the deleted shapes to avoid requesting the whole board.
     * If this doesn't succeed, refresh the whole board to avoid getting out of sync.
     */
    socket.on('shapes_recolored', function (json) {
        cacheDirty[activeBoard] = true;
        const physid = getPhysicalCanvasId(activeBoard, from, to); // use the active board as we don't pass the board id here
        const { shapes, error } = findShapesByIds(physid, json.shapeids);
        if (error) {
            requestBoardFromServer(activeBoard);
            return;
        }
        shapes.forEach(shape => {
            if (shape.attrs.name === 'Dot') {
                shape.fill(json.color);
            } else {
                shape.stroke(json.color);
            }
        });
    });

    /**
     * Act on the shapes_deleted message.
     * Try to destroy just the deleted shapes to avoid requesting the whole board.
     * If this doesn't succeed, refresh the whole board to avoid getting out of sync.
     */
    socket.on('shapes_deleted', function (json) {
        cacheDirty[activeBoard] = true;
        const physid = getPhysicalCanvasId(activeBoard, from, to);
        const { shapes, error } = findShapesByIds(physid, json.shapeids);
        if (error) {
            requestBoardFromServer(activeBoard);
            return;
        }
        shapes.forEach(shape => shape.destroy());
    });

    const drawLiveShape = (shape, drawAsap) => {
        const target = getPhysicalCanvasId(shape.boardid, from, to);
        if (!target) return;
        const tempLine = layer.main[target].findOne('.TempLine');
        if (tempLine) {
            // if we have partially drawn long line present, we destroy it and draw the final line asap
            tempLine.destroy();
            drawAsap = 1;
        }

        cacheDirty[shape.boardid] = true;
        // Sending a command for new shape cancels the animation of the previous shape
        globalBusyDrawingNonce = new Object();
        drawShapeChain(shape, target, globalBusyDrawingNonce, { drawAsap: drawAsap })
            .then((result) => {
                if (result.error) {
                    requestBoardFromServer(shape.boardid);
                }
            });
    };

    socket.on('draw_shape', function (shape) {
        drawLiveShape(shape, 0);
    });

    socket.on('draw_partial_shape', function (shape) {
        shape['name'] = 'TempLine';
        drawLiveShape(shape, 1);
    });

    socket.on('laserloc', function (line) {
        const target = getPhysicalCanvasId(line.b, from, to);
        if (target) {
            drawLaserPointer(target, line.x, line.y);
        }
    });

    socket.on('laser_on', function (json) {
        if (json.color.length === 7) laserColor = json.color;
        if (json.size) laserSize = Number(json.size);
        removeLasers();
    });

    socket.on('laser_off', function () {
        removeLasers();
    });

    socket.on('play_shapes', function (json) {
        playShapes(json.boardid, json.data, json.options);
    });

    socket.on('change_board_settings', function (json) {
        if (!json.boardid) {
            console.error('change_board_settings: Boardid missing');
            return;
        }
        cacheDirty[json.boardid] = true;
        const physid = getPhysicalCanvasId(json.boardid, from, to);
        if (physid) {
            if (json.settings?.settings?.bg?.visible === true) {
                // If image object does not exist yet, create it
                if (imageObj[physid] === undefined) {
                    imageObj[physid] = new Image();
                    imageObj[physid].onload = function () {
                        bgImage[physid].image(imageObj[physid]);
                    };
                    imageObj[physid].src = json.settings?.settings?.bg?.url || '';
                } else {
                    if (imageObj[physid].src !== json.settings?.settings?.bg?.url) {
                        imageObj[physid].src = json.settings?.settings?.bg?.url || '';
                    }
                }
                bgImage[physid].visible(true);
            } else {
                bgImage[physid].visible(false);
            }
            const bgrect = layer.bg[physid].findOne('Rect');
            if (bgrect) {
                if (json.settings?.color) {
                    bgrect.attrs.fill = json.settings?.color;
                    layer.bg[physid].draw();
                }
            }
            if (json.settings?.settings?.grid) {
                drawGrid(json.boardid, json.settings.settings.grid);
            } else {
                layer.bg[physid].draw();
            }
        } else {
            console.log('No physical layer found for board ' + json.boardid);
        }
    });

    socket.on('set_active_board', function (json) {
        setActiveBoard(json);
    });

    // reconfigure_boards is signaled when the number of visible boards change
    // and we need to recreate the stages (boards) in Konva
    socket.on('reconfigure_boards', function (json) {
        numVisBoards = json.nvb;
        // only set these if we want to force it from client side
        if (json.width > 0) screenSize.width = json.width;
        if (json.height > 0) screenSize.height = json.height;
        if (typeof (json.sb) === 'undefined') console.log('Starting board missing!');
        setFromTo(json.sb);
        reconfigureBoards();
    });

    // clear one board
    socket.on('clear_board', function (json) {
        cacheDirty[json.boardid] = true;
        const board = getPhysicalCanvasId(json.boardid, from, to);
        if (board !== null) {
            layer.main[board].destroyChildren();
            layer.main[board].batchDraw();
        }
    });

    // clear all boards
    socket.on('clear_all', function () {
        backupAndDeleteCachedBoards();
    });
}

// Start the engine...
initializeGridView();

/**
 * Expose the viewer internals on window. The old inline script had all of
 * this in global scope; keeping a single debug object available makes the
 * page debuggable from the console and inspectable from Playwright e2e
 * tests without relying on implementation details leaking into the DOM.
 */
window.viewerDebug = {
    layer,
    stage,
    boardCache,
    get from() { return from; },
    get to() { return to; },
    get activeBoard() { return activeBoard; },
    get numVisBoards() { return numVisBoards; },
    get gotSettings() { return gotSettings; },
    get offline() { return offline; },
    get playShapesGoingOn() { return playShapesGoingOn; },
};
