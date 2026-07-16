/* eslint-disable react-hooks/exhaustive-deps */
// The above line disables the annoying warnings about missing dependencies
// See https://www.akashmittal.com/useeffect-missing-dependency/

import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import { useResizeObserver } from "./hooks/use-resize-observer.js";
import { atom, useAtom } from "jotai";
//import URLImage from "./components/URLImage.jsx";
import Container from "react-bootstrap/Container";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import ButtonToolbar from "react-bootstrap/ButtonToolbar";
import Dropdown from "react-bootstrap/Dropdown";
import Modal from "react-bootstrap/Modal";
import socketIOClient from "socket.io-client";
import Konva from "konva";
import { Stage, Layer, Rect } from "react-konva";
import * as Icon from 'react-bootstrap-icons';
import MemoizedThumbnailNav from "./components/ThumbnailNav.jsx";
import MemoizedSettingsSidebar from "./components/SettingsSidebar.jsx";
import MemoizedLineWidthMenu from "./components/menus/LineWidthMenu.jsx";
import MemoizedBoardColorMenu from "./components/menus/BoardColorMenu.jsx";
import MemoizedLineColorMenu from "./components/menus/LineColorMenu.jsx";
import MemoizedFillColorMenu from "./components/menus/FillColorMenu.jsx";
import MemoizedHelperGridMenu from "./components/menus/HelperGridMenu.jsx";
import MemoizedFullScreenMenu from "./components/menus/FullScreenMenu.jsx";
import MemoizedToolMenu from "./components/menus/ToolMenu.jsx";
import MemoizedBackgroundImageMenu from "./components/menus/BackgroundImageMenu.jsx"
import MemoizedHelperGrid from "./components/HelperGrid.jsx";
import Clock from "./components/Clock.jsx";
import FPSStats from "./components/Fpsstats.jsx";
import Portal from "./components/Portal.jsx";
import Cursor from "./components/Cursor.jsx";
import Background from "./components/Background.jsx";
import { useIdleTimer } from 'react-idle-timer'
import { ContextMenu, getContextMenuOptions } from "./components/menus/ContextMenu.jsx";
import { saveThumbnail } from "./components/BoardThumbnail.jsx";
import download from 'downloadjs';
import tinycolor from 'tinycolor2';
import reactModal from "./promiseModal.js";
import { displayError, displayAdminMsg, ToastDisplay } from "./components/ToastDisplay.jsx";
import { log, setDebugLevel, getDebugLevelString } from "./logging.js";
import { toRelativeCoords, pixelsToPct, pctToPixels, sleep, pointsDistance, makeKonvaGrid, createOutlineClone, getPresenterToken } from "./Utils.js";
import { useWhatChanged, setUseWhatChange} from '@simbathesailor/use-what-changed';
import { ENDPOINT, DEF_BOARD, DEF_UI, DEFAULT_SHAPE_STROKE, DEFAULT_SHAPE_FILL, HIT_STROKE_WIDTH, SWIPE_X_THRESHOLD, SWIPE_Y_THRESHOLD, HIDE_TEXTS_THRESHOLD, SQRT2_DIV2, PREVIEW_UPDATE_TIMEOUT, TOOLS, DEBUG_LEVELS } from "./constants.js";
import useInterval from "./hooks/useInterval.js";
//import useStateRef from "./hooks/useStateRef.js";
import usePrevious from "./hooks/usePrevious.js";
import { Circle } from 'react-konva';

import { currentBoardAtom } from "./atoms.js";

setUseWhatChange(process.env.NODE_ENV === 'development');

//import BackgroundImage from "./BackgroundImage";

var socket;

var shapes_to_delete = new Set();  // Set to store shapes for batch deletion
var shapes_to_recolor = []; // Array to store shapes for batch recoloring
var gridBlockSize = {x: 1, y: 1}; // Precalculate grid pixel size to speed up snap calculations
var bgProps = []; // Holds info (url, cached image data, x-size, y-size) on already loaded background images to avoid extra reloads

// Globals related to drawing shapes (we currently have only one drawing pointer and line at one time)
var drawingData = []; // holds scaled coordinates and timestamps for each point
// Helper global for drawing polyLines and shapes of similar "click-click-click" drawing logic
var openPolyLine = {shape: null, snapped: null, finished: false};
var drawingPointer = null; // The pointer currently used to draw a shape (if any)

var busyDragging = false; // we are dragging a shape using move or clone tools
var swipeOngoing = false; // if currently swiping, the number equals number of fingers in swipe; otherwise false

// BigInts are not supported by default in JSON.stringify() but we can just convert them into strings
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt
BigInt.prototype.toJSON = function () {
    return this.toString();
};

function Blackboard(props) {
    const [currentBoard, setCurrentBoard] = useAtom(currentBoardAtom);

    // NOTE: boardLimits gets set upon a successful login. If it is null, we don't draw menus etc.
    const [boardLimits, setBoardLimits] = useState(null);

    const [shapeOrderChanged, setShapeOrderChanged] = useState(0); // Changing this effectively reloads board data (for bring to front / send to back, TODO...)
    const [shouldCreateOutlineClones, setShouldCloneFilledShapes] = useState(false); // This is set when we have cloned 
    const [currentTool, setCurrentTool] = useState({name: 'Line', label: 'Draw'});
    const previousTool = usePrevious(currentTool);
    const [stroke, setStroke] = useState({color: DEFAULT_SHAPE_STROKE, enabled: true});
    const [fill, setFill] = useState({color: DEFAULT_SHAPE_FILL, enabled: false});
    const [viewerCount, setViewerCount] = useState(0);
    const [numBoards, setNumBoards] = useState(DEF_UI.boards.nvb);
    const [strokeColors, setStrokeColors] = useState([DEFAULT_SHAPE_STROKE]);
    const [fillColors, setFillColors] = useState([]);
    const [boardColors, setBoardColors] = useState([DEF_BOARD.color]);
    const [swipeStart, setSwipeStart] = useState(false);

    const setupRan = useRef(false); // Workaround React 18 double-attaching components on dev
    const abortControllerRef = useRef(null); // Are we fetching data from backend?

    /**
     * Konva element refs
     */
    const stageEl = useRef(null);
    const bgRectRef = useRef(null);
    const mainLayer = useRef(null);
    const drawArea = useRef(null);
    const drawLayer = useRef(null);
    const toolLayer = useRef(null);
    const mainToolbar = useRef(null);
    const konvaCursor = useRef(null);
    const swipeRef = useRef(false);
    const konvaShape = useRef(null);

    const pwFieldRef = useRef(null);
    const pointsTotal = useRef(0); // Variable to accumulate drawn points into (for debugging)

    const [penLoc, setPenLoc] = useState({ x: 0, y: 0 });
    const [boardSettings, setBoardSettings] = useState(DEF_BOARD);
    const [boardSettingsPending, setBoardSettingsPending] = useState(false); // Kludge to update grid visibility
    const [sessionInfo, setSessionInfo] = useState({ 
        id: props.sid,
        presenterpw: '',
        viewerpw: '',
        sessionname: '',
        ispublic: true
    })
    const [cursor, setCursor] = useState({
        visible: false
    })
    const [showSidebar, setShowSidebar] = useState(false);
    const stageSize = useResizeObserver({
        ref: drawArea,
        debounceDelay: 1000
    });
    const toolbarSize = useResizeObserver({
        ref: mainToolbar,
        debounceDelay: 1000
    });
    /*const toolbarSize.height = 1000;
    const toolbarWidth = 80;*/
    const [busyPainting, setBusyPainting] = useState(false); // We are busy painting shapes on canvas
    const [busyFetching, setBusyFetching] = useState(false); // We are busy fetching new board data
    const [previewNeedsUpdate, setPreviewNeedsUpdate] = useState(false);
    const [wideUI, setWideUI] = useState(false); // UI width below threshold, reduce text in menubar
    const [ui, setUiOptions] = useState(DEF_UI.ui);
    const [lineProperties, setLineProperties] = useState(DEF_UI.line);
    const [laserProperties, setLaserProperties] = useState(DEF_UI.laser);

    const [pps, setPps] = useState(0);

    //const [lastActive, setLastActive] = useState(+new Date())

    const [contextMenu, setContextMenu] = useState(false);
    const [fingerMenu, setFingerMenu] = useState(false);

    /**
     * Load background image for a board into cache using the backend image-proxy to avoid cors issues
     * 
     * @param {string} url url to load image from
     * @param {integer} cb board to update, defaults to currentBoard
     */
    const updateBgImage = useCallback(async (url, cb = currentBoard) => {
        var imageRef = null;

        if (!bgProps[cb]?.image || url !== bgProps[cb]?.url) {
            if (url.startsWith('http')) {
                const options = {
                    headers: {
                        'Accept': '*/*',
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getPresenterToken(props.sid),
                        'Target-URL': encodeURI(url)
                    }
                }
                log(DEBUG_LEVELS.DEV, 'updateBgImage: loading new image for board' + cb);
                fetch(ENDPOINT + `/image-proxy/` + props.sid, options)
                    .then(res => res.blob())
                    .then(blob => {
                        const img = new window.Image();
                        img.src = URL.createObjectURL(blob);
                        img.crossOrigin = "Anonymous";
                        imageRef = img;
                        imageRef.addEventListener("load", () => handleLoad(cb)); // Pass cb to handleLoad
                    })
            } else log(DEBUG_LEVELS.ERROR, 'updateBgImage: URL seems invalid!');
        }

        const handleLoad = (boardIndex) => {
            log(DEBUG_LEVELS.DEV, 'updateBgImage: loaded new image for board' + boardIndex);
            const x = imageRef.naturalWidth;
            const y = imageRef.naturalHeight;
            bgProps[boardIndex] = { url: url, blobsrc: imageRef.src, image: imageRef, x: x, y: y };
            imageRef.removeEventListener("load", handleLoad);
        };
    }, [bgProps, props.sid, currentBoard]);


    // Creates an outline clone of all filled shapes in mainLayer (if not cloned already)
    const cloneAllFilledShapes = useCallback(() => {
        if(!shouldCreateOutlineClones) {
            setShouldCloneFilledShapes(true);
            // Just refresh all shapes as the order would be screwed anyway...
            setShapeOrderChanged(shapeOrderChanged + 1);
        }
    }, [shouldCreateOutlineClones]);

    const deleteAllClones = useCallback(() => {
        if(shouldCreateOutlineClones) {
            // Make the original shapes listening for events again...
            const filledShapes = mainLayer.current.find(node => {
                return node.getAttr('fillEnabled') === true;
            })
            filledShapes.forEach((shape) => {
                shape.listening(true);
            })
            setShouldCloneFilledShapes(false);
            setShapeOrderChanged(shapeOrderChanged + 1);
        }
    }, [shouldCreateOutlineClones, mainLayer.current]);
    
    // Helper func for board properties menu; handle changing one setting at a time inside the objects
    const setBoardProperty = useCallback((obj, prop, value) => {
        //setUiOptions({...ui, grid: {...boardSettings.settings.grid, [`${prop}`]: value}})
        switch(obj) {
            case 'grid':
                // If square option is set, try to keep the grid square in the current aspect ratio
                if(boardSettings.settings.grid.square && boardSettings.settings.grid.aspect && (prop === 'cellHeight' || prop === 'cellWidth')) {
                    let sizeIn100Pixels;
                    if(prop === 'cellWidth') {
                        sizeIn100Pixels = stageSize.width * value;
                        let bestHeightMatch = Math.max(Math.round(sizeIn100Pixels / stageSize.height), 1);
                        setBoardSettings({...boardSettings, settings: {...boardSettings.settings, grid: {...boardSettings.settings.grid, cellWidth: value, cellHeight: bestHeightMatch}}})
                    } else {
                        if(prop === 'cellHeight') {
                            sizeIn100Pixels = stageSize.height * value;
                            let bestWidthMatch = Math.max(Math.round(sizeIn100Pixels / stageSize.width), 0.5);
                            setBoardSettings({...boardSettings, settings: {...boardSettings.settings, grid: {...boardSettings.settings.grid, cellHeight: value, cellWidth: bestWidthMatch}}})
                        }
                    }
                } else {
                    setBoardSettings({...boardSettings, settings: {...boardSettings.settings, grid: {...boardSettings.settings.grid, [`${prop}`]: value}}})
                    if(prop === 'visible' || prop === 'aspect') {
                        setBoardSettingsPending(true); // Kludge to update grid visibility or screen aspect ratio
                    }
                }
                break;
            case 'bg':
                if(prop === 'url' && value === '') {
                    // If url is empty, let's set the visibility to false as well
                    setBoardSettings({...boardSettings, settings: {...boardSettings.settings, bg: {url: '', visible: false}}})
                } else setBoardSettings({...boardSettings, settings: {...boardSettings.settings, bg: {...boardSettings.settings.bg, [`${prop}`]: value}}})
                // TODO: why can't the background image settings be saved like the others when changing on menu?
                setBoardSettingsPending(true); // Kludge to update grid visibility or screen aspect ratio
                break;
            default:
                log(DEBUG_LEVELS.DEBUG, 'setBoardProperty: Unknown settings object.');
                break;
        }
    },[boardSettings]);

    /**
     * Return coordinates of the nearest grid corner point.
     * The optional useSqrt parameter is used when drawing ellipses,
     * and multiplies the grid by sqrt(2)/2, which is half of the diagonal
     * length of one grid cell.
     * 
     * @param {number} x x coordinate to convert
     * @param {number} y y coordinate to convert
     * @param {boolean} useSqrt used with ellipses
     * @returns coordinates of a nearest grid corner point
     */
    const getSnappedCoordinates = useCallback((x,y,useSqrt=false) => {
        const blockX = useSqrt ? gridBlockSize.x * SQRT2_DIV2 : gridBlockSize.x;
        const blockY = useSqrt ? gridBlockSize.y * SQRT2_DIV2 : gridBlockSize.y;
        const newX = Math.round(x / blockX) * blockX;
        const newY = Math.round(y / blockY) * blockY;
        return [newX, newY];
    },[gridBlockSize]);

    // Returns a human-readable label for a given tool
    const getToolLabel = useCallback((tool) => {
        const { [tool]: SelectedTool } = TOOLS
        return SelectedTool.label;
    });

    const handleOptionSelected = option => {
        if(busyPainting) return;
        log(DEBUG_LEVELS.DEV, 'handleOptionSelected: Option ' + option + ' selected');
        contextMenu.target.opacity(1);
        setContextMenu(false);
        var details;

        // TODO: add support for partial updates on shapedetails so all values need not be given
        switch(option) {
            // delete, recolor and move are handled by existing means
            case 'delete':
                addShapeToDeleteQueue(contextMenu.target);
                break;
            case 'recolor_stroke':
                handleShapeUpdate(contextMenu.target, {stroke: stroke.color})
                    .then((res) => {
                        contextMenu.target.stroke(stroke.color);
                    });
                break;
            case 'bring_to_front':
                //handleShapeUpdate(contextMenu.target, {starttime: contextMenu.target.parent.children[contextMenu.target.parent.children.length - 1].attrs.startTime + 1000})
                // TODO: do this properly; now just apply current time for the shape so it comes on top
                handleShapeUpdate(contextMenu.target, 
                    {starttime: Date.now()})
                    .then((res) => {
                        /*contextMenu.target.attrs.startTime = newStartTime;
                        mainLayer.current.batchDraw();*/
                        setShapeOrderChanged(shapeOrderChanged + 1);
                    });
                break;
            case 'send_to_back':
                handleShapeUpdate(contextMenu.target, 
                    {starttime: contextMenu.target.parent.children[0].attrs.startTime - 1000})
                    .then((res) => {
                        /*contextMenu.target.attrs.startTime = newStartTime2;
                        mainLayer.current.batchDraw();*/
                        setShapeOrderChanged(shapeOrderChanged + 1);
                    });
                break;
            case 'add_fill':
                handleShapeUpdate(contextMenu.target, 
                    {fill: fill.color, shapedetails: {fillEnabled: true, closed: true}})
                .then((res) => {
                    contextMenu.target.fill(fill.color);
                    contextMenu.target.fillEnabled(true);
                    if(typeof contextMenu.target.closed === "function") {
                        contextMenu.target.closed(true);
                    }
                });
                //addShapeToRecolorQueue(contextMenu.target, stroke);
                break;
            case 'clone':
                const dbId = contextMenu.target.attrs.dbId;
                const cloneObj = contextMenu.target.clone({draggable: true, opacity: 0.5});
                drawLayer.current.add(cloneObj);

                // If snap is on, we constrain drag movement to grid
                if(boardSettings.settings.grid.snap) {
                    let addX = 0;
                    let addY = 0;
                    /**
                     * Shapes with coordinates at center need special treatment
                     * Essentially we check if the shape is symmetric relative to gridline crossing or not
                     * and if not, we add half a grid block to the center point coordinate in that (x/y) direction.
                     * The multipliers 0.1 and 0.9 allow snapping even if the object size does not quite 
                     * match the grid size.
                     */ 
                    if(cloneObj.attrs.name === 'Ellipse') {
                        const modX = Math.abs(cloneObj.width()) * 0.5 % gridBlockSize.x;
                        const modY = Math.abs(cloneObj.height()) * 0.5 % gridBlockSize.y;
                        if(modX > (0.1 * gridBlockSize.x) && modX < (0.9 * gridBlockSize.x)) {
                            addX = gridBlockSize.x * 0.5;
                        }
                        if(modY > (0.1 * gridBlockSize.y) && modY < (0.9 * gridBlockSize.y)) {
                            addY += gridBlockSize.y * 0.5;
                        }
                    }
                    cloneObj.on('dragmove', function () {
                        //console.info('coords: ',contextMenu.target.absolutePosition());
                        const loc = stageEl.current.getPointerPosition();
                        let newX, newY;
                        [newX, newY] = getSnappedCoordinates(loc.x, loc.y);
                        cloneObj.absolutePosition({
                            x: newX + addX,
                            y: newY + addY
                        });
                    })
                }
                
                cloneObj.startDrag();
                busyDragging = true;
                cloneObj.on('dragend', function () {
                    cloneObj.off('dragend'); // prevent multiple firing
                    cloneObj.setAttr("draggable", false); // prevent draggable property from hanging to recolor etc.
                    cloneObj.setAttr("opacity", 1.0); // prevent draggable property from hanging to recolor etc.
                    cloneShape(cloneObj, dbId)
                    .then((res) => {
                        // Move cloned object from draw layer to the main layer
                        cloneObj.moveTo(mainLayer.current);
                        busyDragging = false;
                        log(DEBUG_LEVELS.DEV, drawLayer.current.children.length + 'shapes on drawLayer');
                    })
                    .catch((error) => {
                        log(DEBUG_LEVELS.ERROR, 'handleOptionSelected: Error in cloneShape: ' + error);
                        busyDragging = false;
                    });
                    log(DEBUG_LEVELS.DEV,'Object dropped at: ' + contextMenu.target.attrs.x + ', ' + contextMenu.target.attrs.y);
                })
                break;
            case 'add_stroke':
                handleShapeUpdate(contextMenu.target, {shapedetails: {strokeEnabled: true}})
                    .then((res) => {
                        contextMenu.target.strokeEnabled(true);
                    });
                break;
            case 'remove_fill':
                handleShapeUpdate(contextMenu.target, {shapedetails: {fillEnabled: false}})
                .then((res) => {
                    contextMenu.target.fillEnabled(false);
                });
                //addShapeToRecolorQueue(contextMenu.target, stroke);
                break;
            case 'close_path':
                details = {shapedetails: {closed: true}};
                handleShapeUpdate(contextMenu.target, details)
                    .then((res) => {
                        contextMenu.target.closed(true);
                    });
                break;
            case 'open_path':
                details = {shapedetails: {closed: false}};
                handleShapeUpdate(contextMenu.target, details)
                    .then((res) => {
                        contextMenu.target.closed(false);
                    });
                break;
            case 'remove_stroke':
                details = {shapedetails: {strokeEnabled: false}};
                handleShapeUpdate(contextMenu.target, details)
                    .then((res) => {
                        contextMenu.target.strokeEnabled(false);
                    });
                break;
            case 'add_bezier':
                details = {
                    shapedetails: {
                        bezier: true,
                        tension: lineProperties.lineTension
                    }
                };
                handleShapeUpdate(contextMenu.target, details)
                    .then((res) => {
                        contextMenu.target.bezier(true);
                        contextMenu.target.tension(lineProperties.tension);
                    });
                break;
            case 'remove_bezier':
                details = {
                    shapedetails: {
                        bezier: false,
                        tension: 0
                    }
                }
                handleShapeUpdate(contextMenu.target, details)
                    .then((res) => {
                        contextMenu.target.bezier(false);
                        contextMenu.target.tension(0);
                    });
                break;
            case 'change_stroke_width':
                details = {shapedetails: {strokeWidth: lineProperties.width}};
                handleShapeUpdate(contextMenu.target, details)
                    .then((res) => {
                        contextMenu.target.strokeWidth(pctToPixels(lineProperties.width, stageSize.width));
                    });
                break;
            case 'change_dot_size':
                details = {shapedetails: {radius: lineProperties.width * 0.5}};
                handleShapeUpdate(contextMenu.target, details)
                    .then((res) => {
                        contextMenu.target.radius(pctToPixels(details.radius, stageSize.width));
                        contextMenu.target.hitStrokeWidth(Math.max(details.radius, HIT_STROKE_WIDTH)); // TODO: Has no effect!
                    });
                break;
            default:
                break;
        }
        mainLayer.current.draw();
    };

    const handleContextMenu = e => {
        e.evt.preventDefault(true); // NB!!!! Remember the ***TRUE***
        // Only open menu if we're not moving another shape
        if(e.target) {
            // Do a short animation to indicate selected shape
            e.target.to({opacity: 0.1, duration: 0.3});
            const mousePosition = e.target.getStage().getPointerPosition();
    
            setContextMenu({
                type: "START",
                position: mousePosition,
                target: e.target,
                options: getContextMenuOptions(e.target, stroke, fill)
            });
        }
    };


    const handleOnActive = () => {
        //log(DEBUG_LEVELS.DEV, 'user is active')
        //log(DEBUG_LEVELS.DEV, 'last active', getLastActiveTime())
    }

    const handleOnIdle = () => {
        if (!previewNeedsUpdate) {
            setPreviewNeedsUpdate(true);
            //log(DEBUG_LEVELS.DEV, 'Preview needs update');
        }
        // Don't destroy stuff on drawlayer if drawing a polyline...
        if(openPolyLine.shape === null && drawingPointer === null) drawLayer.current.destroyChildren();
        //log(DEBUG_LEVELS.DEV, 'user is idle');
        //log(DEBUG_LEVELS.DEV, 'time remaining', getRemainingTime())
        // Clear up any error message so the next will be shown even if same as before
        displayError(false);
    }

    /**
     * Custom hook that tracks the remaining time and last active time of the idle timer.
     *
     * @param {Object} options - The options for the idle timer.
     * @param {number} options.timeout - The timeout duration in milliseconds.
     * @param {function} options.onIdle - The callback function to be called when the user becomes idle.
     * @param {function} options.onActive - The callback function to be called when the user becomes active.
     * @param {number} options.debounce - The debounce duration in milliseconds.
     */
    const { getRemainingTime, getLastActiveTime } = useIdleTimer({
        timeout: PREVIEW_UPDATE_TIMEOUT,
        onIdle: handleOnIdle,
        onActive: handleOnActive,
        debounce: 500
      })

    const handleCloseSidebar = useCallback((settingsChanged) => {
        if(settingsChanged) {
            // We might have changed the laser properties, so let the clients know about this
            if(currentTool.name === 'Pointer') {
                if (socket) {
                    socket.emit('laser_on', {color: laserProperties.color, size: laserProperties.size, sid: props.sid, token: getPresenterToken(props.sid)});
                } else {
                    log(DEBUG_LEVELS.ERROR, 'Socket is not initialized.');
                }
            }
            saveSessionSettingsToServer();
        }
        setShowSidebar(false);
        // Note: below we need to consider all variables used in saveSessionSettingsToServer also!
    }, [currentBoard, currentTool, boardLimits, numBoards, lineProperties, laserProperties, getPresenterToken]);

    const handleShowSidebar = () => setShowSidebar(true);

    const handleToolChange = useCallback((newTool) => {
        // If switching to Line tool, restore saved bezier preference (or default to true)
        if(newTool.name === 'Line') {
            const savedBezier = localStorage.getItem('lineSmoothing');
            if (savedBezier !== null) {
                setLineProperties({...lineProperties, bezier: savedBezier === 'true'});
            } else {
                // Default to true if no saved preference exists
                setLineProperties({...lineProperties, bezier: true});
            }
        }
        // If switching to polyline, switch beziers off (polylines don't support bezier)
        if(newTool.name === 'Polyline') {
            setLineProperties({...lineProperties, bezier: false});
        }
        // If switching to grid, switch snapping on by default
        if(newTool.name === 'Grid') {
            setBoardProperty('grid','snap', true);
        }
        setCurrentTool(newTool);
    });

    const handleFingerSelection = useCallback((tool) => {
        if(busyPainting) return;
        log(DEBUG_LEVELS.DEV, 'handleFingerSelection: selected ' + tool);
        setFingerMenu(false);

        handleToolChange({name: tool, label: getToolLabel(tool)});
    },[handleToolChange]);

    const handleCursorChange = useCallback((newCursor) => {
        // Cursor changes need a draw to be visible for user
        setCursor(newCursor);
        konvaCursor.current.draw();
        drawLayer.current.batchDraw();
    }, [konvaCursor.current, drawLayer.current, ui.mouse]);

    const reAttachToolEventHandlers = useCallback((oldTool, newTool) => {
        switch(newTool.name) {
            case 'Line':
                stageEl.current.getContainer().style.cursor = 'none';
                if(stroke.color === 'wipe') {
                    handleCursorChange({
                        ...cursor,
                        strokeEnabled: true,
                        stroke: "gray",
                        radius: lineProperties.width * stageSize.width * 0.005,
                        visible: true,
                        fill: boardSettings.color
                    })
                } else {
                    handleCursorChange({
                        ...cursor,
                        strokeEnabled: false,
                        radius: lineProperties.width * stageSize.width * 0.005,
                        visible: ui.mouse,
                        fill: stroke.color
                    })
                }
                drawShape(oldTool.name, 'Line');
                break;
            case 'Polyline':
                stageEl.current.getContainer().style.cursor = 'crosshair';
                handleCursorChange({
                    ...cursor,
                    visible: false,
                })
                drawShape(oldTool.name, 'Polyline');
                break;
            case 'Arrow':
                stageEl.current.getContainer().style.cursor = 'crosshair';
                handleCursorChange({
                    ...cursor,
                    visible: false,
                })
                drawShape(oldTool.name, 'Arrow');
                break;
            case 'Ellipse':
                stageEl.current.getContainer().style.cursor = 'crosshair';
                handleCursorChange({
                    ...cursor,
                    visible: false,
                })
                drawShape(oldTool.name, 'Ellipse');
                break;
            case 'Rect':
                stageEl.current.getContainer().style.cursor = 'crosshair';
                handleCursorChange({
                    ...cursor,
                    visible: false,
                })
                drawShape(oldTool.name, 'Rect');
                break;
            case 'Grid':
                stageEl.current.getContainer().style.cursor = 'crosshair';
                handleCursorChange({
                    ...cursor,
                    visible: false,
                })
                drawShape(oldTool.name, 'Grid');
                break;
            case 'Delete':
                stageEl.current.getContainer().style.cursor = 'pointer';
                handleCursorChange({
                    ...cursor,
                    visible: false,
                })
                cloneAllFilledShapes();
                deleteShape(currentTool.name);
                break;
            case 'Recolor':
                stageEl.current.getContainer().style.cursor = 'pointer';
                handleCursorChange({
                    ...cursor,
                    visible: false,
                })
                cloneAllFilledShapes();
                recolorShape(currentTool.name);
                break;
            case 'Pointer':
                stageEl.current.getContainer().style.cursor = 'none';
                handleCursorChange({
                    ...cursor,
                    strokeEnabled: false,
                    radius: laserProperties.size * stageSize.width * 0.005,
                    visible: true,
                    fill: laserProperties.color
                })
                laserPointer(newTool.name);
                break;
            case 'Select':
                stageEl.current.getContainer().style.cursor = 'default';
                handleCursorChange({
                    ...cursor,
                    visible: false,
                })
                deleteAllClones();
                selectShape(newTool.name);
                break;
            case 'Transform':
                stageEl.current.getContainer().style.cursor = 'default';
                handleCursorChange({
                    ...cursor,
                    visible: false,
                })
                deleteAllClones();
                transformShape(newTool.name);
                break;
            default:
                break;
        }
    }, [boardSettings, cursor, stroke, fill, lineProperties, stageEl.current, laserProperties, handleCursorChange, cloneAllFilledShapes, deleteAllClones]);

    /**
     * Handle closing the board color/grid menu (save the current board settings to db)
     * Currently used board colors are returned from backend.
     * Use useCallback so the function is passed by reference to child component.
     */
    const handleBoardSettingsSave = useCallback(async () => {
        if(!boardSettings || Object.keys(boardSettings).length === 0) return;
        setBoardSettingsPending(false) // Reset the kludge hook for grid visibility
        const thisBoard = currentBoard; // save board id in case it gets changed
        if(thisBoard > 0) {
            if(props.sid > 0) {
                try {
                    const resp = await fetch(ENDPOINT + `/board/` + props.sid + `/` + thisBoard, {
                        method: 'PATCH',
                        headers: {
                            'Accept': 'application/json, text/plain, */*',
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                        },
                        body: JSON.stringify({
                            boardSettings
                        })
                    })
                    if(!resp.ok) {
                        return Promise.reject('Error (' + resp.status + ') occurred')
                    } else {
                        const json = await resp.json();
                        if(json.colors) {
                            setBoardColors(json.colors.map(c => c.bgcolor))
                        }
                    }
                } catch (error) {
                    return Promise.reject(error);
                }
            } else return Promise.reject('Cannot determine session id');
        } else return Promise.reject('Board id cannot be zero');
    }, [boardSettings, currentBoard, props.sid])

    const addShapeToDeleteQueue = (target) => {
        if(target?.attrs?.dbId) {
            const dbid = BigInt(target.attrs.dbId);
            if(dbid) {
                shapes_to_delete.add(dbid);
                // If the shape to be deleted is an outline clone (of a filled shape),
                // we need to delete both the clone and original shape.
                if(target.attrs.clone) {
                    const toDestroy = mainLayer.current.find(node => {
                        return node.getAttr('dbId') == dbid // Note == instead of === since BigInt !!
                    })
                    if(toDestroy.length) toDestroy.forEach((shape) => {shape.destroy()});
                } else target.destroy();
                return true;
            } else {
                log(DEBUG_LEVELS.ERROR, 'Shape has no database id; cannot delete!');
                return false;
            }
        }
    }

    /**
     * Adds a shape to the recolor queue with the specified color.
     * 
     * @param {Object} target - The target shape to be added to the recolor queue.
     * @param {string} color - The color to be applied to the shape.
     * @returns {void}
     */
    const addShapeToRecolorQueue = (target, color) => {
        if(target?.attrs?.dbId) {
            const dbid = BigInt(target.attrs.dbId);
            if(dbid) {
                if(shapes_to_recolor[color] !== undefined) {
                    if(!shapes_to_recolor[color].includes(dbid)) {
                        shapes_to_recolor[color].push(dbid);
                    }
                } else shapes_to_recolor[color] = [dbid];
                let aTarget;
                /**
                 * If we are dealing with a filled shape, we should hit its outline clone
                 * instead of the actual shape. So we need to find the clone source and
                 * change its parameters instead of the one that got hit.
                 */
                if(target.getAttr('clone')) {
                    const actualTarget = mainLayer.current.find(node => {
                        // Note == instead of === since BigInt !!
                        return node.getAttr('dbId') == target.attrs.dbId && !node.getAttr('clone');
                    });
                    if(actualTarget) {
                        aTarget = actualTarget[0];
                    } else aTarget = target;
                } else aTarget = target;

                let changeStroke = true;
                let changeFill = false;
                const name = aTarget.getAttr('name') ?? '';
                // Shapes requiring special treatment here
                if(['Dot','Arrow'].includes(name)) changeFill = true;
                if(['Dot'].includes(name)) changeStroke = false;

                if(changeStroke) aTarget.stroke(color);
                if(changeFill) aTarget.fill(color);
                // no need to draw the shape here, as it only causes flickering and react-konva will redraw anywya
                //aTarget.draw();

            } else {
                log(DEBUG_LEVELS.ERROR, 'Shape has no database id; cannot recolor!');
            }
        }
    }

    /**
     * Updates the thumbnail for the current board.
     * Thumbnail size is 192px on regular dpi screens, and larger for high dpi ones ("retina" etc.)
     */
    const updatePreview = () => {
        //if(busyPainting) return; // don't create while updating board
        if(ui.swipeEnabled && swipeOngoing) return; // don't create while swiping to avoid partly white previews
        //displayError('updating preview');
        if(stageEl.current && currentBoard > 0) {
            log(DEBUG_LEVELS.DEV, 'updated preview for board ' + currentBoard + ', bg color:' + boardSettings.color );
            // make thumbnails 192px wide on regular dpi screens, but larger with highDpi (window.devicePixelRatio > 1)
            var pixelRatio = stageSize.width > 0 ? (192 / stageSize.width) * window.devicePixelRatio : 1;
            const url = stageEl.current.getStage().toDataURL({ pixelRatio: pixelRatio });
            saveThumbnail(props.sid, currentBoard, url);
            setPreviewNeedsUpdate(false);
        } else {
            if (currentBoard > 0) {
                // Only warn if we have finished initial setup and currentBoard is defined
                console.warn('stageEl is undefined');
            }
        }
    }

    /**
     * Set up tasks to be handled periodically
     */

    // Batch delete/recolor shapes from DB every second
    useInterval(() => {
        batchShapeDelete();
        batchShapeRecolor();
        // Also update board settings if grid or background image visibility changed
        if(boardSettingsPending && currentBoard) handleBoardSettingsSave().catch(err => log(DEBUG_LEVELS.ERROR, 'Error in handleBoardSettingsSave: ' + err));
    }, 1000);

    // Update total points drawn every second (when pps display is active)
    useInterval(() => {
        if (ui.showPps) {
            setPps(pointsTotal.current);
            pointsTotal.current = 0;
        }
    }, 1000);

    /**
     * Reattach event handlers if shape properties are changed.
     */
    //useWhatChanged([stroke, fill, boardSettings, stageSize, lineProperties, ui, currentTool, laserProperties], 'stroke, fill, boardSettings, stageSize, lineProperties, ui, currentTool, laserProperties', 'anysuffix-string');
    useEffect(() => {
        if(!boardLimits) return; // Boardlimits are set after the initial login, so no need to update anything before that
        if(!stageSize.width) {
            log(DEBUG_LEVELS.DEBUG, 'Note: stage width missing (normal at startup)!')
            return;
        }
        if ((stageSize.width / (window.devicePixelRatio ?? 1)) > HIDE_TEXTS_THRESHOLD) setWideUI(true); else setWideUI(false);

        reAttachToolEventHandlers(previousTool, currentTool);
        // When board changes, we need to re-register event listeners to ensure clean state
    }, [stroke, fill, boardSettings, stageSize, lineProperties, ui, currentTool, laserProperties, boardLimits, currentBoard]); // Only re-run the effect if these change

    // For better performance, calculate grid block size in pixels only when needed
    // (when dimensions or grid settings change)
    useEffect(() => {
        const xBlockSize = stageSize.width * boardSettings.settings.grid?.cellWidth * 0.01;
        //const yBlockSize = boardSettings.settings.grid?.square ? xBlockSize : stageSize.height / boardSettings.settings.grid?.cellHeight;
        const yBlockSize = stageSize.height * boardSettings.settings.grid?.cellHeight * 0.01;
        gridBlockSize = {x: xBlockSize.toFixed(5), y: yBlockSize.toFixed(5)};
        log(DEBUG_LEVELS.DEV, 'Updated grid block size to ' + gridBlockSize);
    }, [stageSize, boardSettings.settings?.grid?.cellWidth, boardSettings.settings?.grid?.cellHeight]);

    useEffect(() => {
        //console.info('previewNeedsUpdate is now ', previewNeedsUpdate);
        updatePreview();
    }, [previewNeedsUpdate]);

    /**
     * When current board changes, we need to fetch its data and present it,
     * while also updating the range of boards currently visible in navigation
     * (grid view)
     * NOTE: If the user changes board before we have fetched the previous one,
     * the fetch request is cancelled using the AbortController
     */
    useEffect(() => {
        async function cb() {
            // Delete anything that might be left in draw layer
            drawLayer.current?.destroyChildren?.();
            // Clear the konvaShape ref to prevent stale pointerId issues
            konvaShape.current = null;
            drawingPointer = null;
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
            }
            if(isNaN(currentBoard)) return Promise.reject('Invalid board: ' + currentBoard + ' is not number');
            if(!currentBoard || !props.sid) return Promise.reject('Board number or presentation id!');
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const layer = mainLayer.current;
            if(currentTool.name === 'Pointer') {
                if (socket) {
                    socket.emit('laser_off', {sid: props.sid, token: getPresenterToken(props.sid)});
                } else {
                    log(DEBUG_LEVELS.ERROR, 'Socket is not initialized.');
                }
            }
            try {
                setBusyFetching(true);
                const res = await fetch(ENDPOINT + `/board/` + props.sid + '/' + currentBoard, {
                    method: 'GET',
                    signal: abortControllerRef.current?.signal,
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                    }
                });
                if(res.ok) {
                    const json = await res.json();
                    // Check settings existence one by one as they may be new settings that are missing
                    // NOTE: nullish coalescing operator ?? counts false as not nullish, so it is used for booleans
                    const safeSettings = {
                        bg: {
                            visible: json.settings.settings.bg?.visible ?? DEF_BOARD.settings.bg.visible,
                            url: json.settings.settings.bg?.url ?? DEF_BOARD.settings.bg.url,
                        },
                        grid: {
                            visible: json.settings.settings.grid?.visible ?? DEF_BOARD.settings.grid.visible,
                            stroke: json.settings.settings.grid?.stroke ?? DEF_BOARD.settings.grid.stroke,
                            strokeWidth: json.settings.settings.grid?.strokeWidth ?? DEF_BOARD.settings.grid.strokeWidth,
                            opacity: json.settings.settings.grid?.opacity ?? DEF_BOARD.settings.grid.opacity,
                            cellWidth: json.settings.settings.grid?.cellWidth ?? DEF_BOARD.settings.grid.cellWidth,
                            cellHeight: json.settings.settings.grid?.cellHeight ?? DEF_BOARD.settings.grid.cellHeight,
                            square: json.settings.settings.grid?.square ?? DEF_BOARD.settings.grid.square,
                            snap: json.settings.settings.grid?.snap ?? DEF_BOARD.settings.grid.snap,
                            present: json.settings.settings.grid?.present ?? DEF_BOARD.settings.grid.present,
                            aspect: json.settings.settings.grid?.aspect ?? DEF_BOARD.settings.grid.aspect
                        }
                    }
                    //console.info('boardsettings:',{...boardSettings, color: json.settings.color, settings: safeSettings});
                    //console.info('currentBoard: ', currentBoard, 'board limits: ', boardLimits);
                    layer.destroyChildren();
                    setBoardSettings({...boardSettings, color: json.settings.color, settings: safeSettings});
                    // Initialize bgProps for the new board if still empty
                    if(typeof bgProps[currentBoard] === 'undefined') bgProps[currentBoard] = {url: safeSettings.bg.url};
                    const play = await playShapes(socket, json.shapes, { skipPenUps: 1, drawAsap: 1 })
                    // This needs to be after playShapes so wipes can be colored to background color

                    if(play.error) log(DEBUG_LEVELS.ERROR, 'Error in playShapes: ' + play.reason);
                    /**
                     * Logic to handle which boards we show in navigation menu
                     * (we should keep this similar to the one in grid view)
                     */
                    if (currentBoard > 0) {
                        let newFrom = boardLimits.from;
                        let newTo = boardLimits.to;
                        if(currentBoard < newFrom) {
                            newFrom = currentBoard;
                            newTo = newFrom + numBoards - 1;
                        } else {
                            if(currentBoard > newTo) {
                                newTo = Math.max(currentBoard, numBoards);
                                newFrom = newTo - numBoards + 1;
                            }
                        }
                        const newEnd = (currentBoard > boardLimits.end) ? currentBoard : boardLimits.end;
                        if (newTo !== boardLimits.to || newFrom !== boardLimits.from || newEnd !== boardLimits.end) {
                            log(DEBUG_LEVELS.DEV, 'Setting board limits: from:' + newFrom + ', to:' + newTo + ', end:' + newEnd);
                            setBoardLimits({ from: newFrom, to: newTo, end: newEnd });
                        }
                        if (socket) {
                            socket.emit('set_active_board', {sid: props.sid, boardId: currentBoard, startId: newFrom, token: getPresenterToken(props.sid)});
                        } else {
                            log(DEBUG_LEVELS.ERROR, 'Socket is not initialized.');
                        }
                    }
                    setBusyFetching(false);
                    //setBoardProperty('grid','aspect', window.innerWidth / (window.innerHeight - toolbarDimensions.height));
                    setPreviewNeedsUpdate(true);
                    //console.info('setPreviewNeedsUpdate true');
                } else {
                    log(DEBUG_LEVELS.ERROR, 'Error fetching board ' + currentBoard + ': ' + res.status + ' ' + res.statusText);
                }
                abortControllerRef.current = null;
            } catch (e) {
                /**
                 * If we get an error here, it's probably this one, so we don't want to bother the user.
                 * e: DOMException: The user aborted a request.
                    code: 20
                    message: "The user aborted a request."
                    name: "AbortError"
                 */
                if(e.code !== 20) {
                    log(DEBUG_LEVELS.ERROR, 'Error in board change callback: ' + e.message);
                } else {
                    log(DEBUG_LEVELS.DEBUG, 'Board change aborted: ' + e.message);
                }
            }
        }
        
        if(currentBoard > 0 && stageSize.width > 0 && stageSize.height > 0) cb().catch(err => log(DEBUG_LEVELS.ERROR, 'Error in main cb: ' + err));

    }, [currentBoard, numBoards, shapeOrderChanged, stageSize]);

    const presenterLogin = async (sid) => {
        // Create a react-bootstrap modal for asking the password
        const presenterpw = await reactModal(({ show, onSubmit, onDismiss }) => (
            <Modal show={show} onHide={onDismiss} animation={false}>
                <Modal.Header closeButton>
                    <Modal.Title>Presenter password required</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group >
                        <Form.Label>Please enter the presenter password for this presentation.</Form.Label>
                        <Form.Control 
                            onKeyDown={e => {
                                if (e.key === "Enter") {
                                    onSubmit(pwFieldRef.current.value);
                                }
                            }}
                            autoFocus 
                            ref={pwFieldRef} 
                            name="password" 
                            type="password"
                        />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="primary" type="submit" onClick={() => onSubmit(pwFieldRef.current.value)}>
                        Submit
                    </Button>
                </Modal.Footer>
            </Modal>
        ));
        // Modal dismissed or submitted with an empty password
        if(typeof(presenterpw) === 'undefined' || presenterpw.length === 0) {
            // Clear any old token just in case
            sessionStorage.removeItem('presentertoken_' + sid);
            return 401;
        } else {
            // Clear old token to avoid letting new people from same machine without password
            // Pass a dummy sessionname as it's a required property in the Blackboard OpenAPI spec
            sessionStorage.removeItem('presentertoken_' + sid);
            try {
                const resp = await fetch(ENDPOINT + `/login/` + sid, {
                    method: 'POST',
                    body: JSON.stringify({ presenterpw: presenterpw, sessionname: 'foo' }),
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer null'
                    }
                })
                if(!resp.ok) {
                    return resp.status;
                } else {
                    const json = await resp.json();
                    if(!json.settings) throw new Error('No session settings received!');
                    if (json.settings.ui.debugLevel) {
                        setDebugLevel(json.settings.ui.debugLevel);
                        log(DEBUG_LEVELS.WARN, 'Debug level set to ' + getDebugLevelString(json.settings.ui.debugLevel));
                    } else {
                        log(DEBUG_LEVELS.WARN, 'No debug level set, using defaults');
                    }
                    //window.location.href = ENDPOINT + "/" + json.sessionid;
                    log(DEBUG_LEVELS.INFO, 'Welcome, presenter!');
                    localStorage.clear(); // Clear localStorage to avoid it filling up from other sessions' data
                    const newSessionInfo = Object.assign(json.sessionInfo, {presenterpw: ''})
                    //console.info('newSessionInfo: ', newSessionInfo);
                    setSessionInfo(newSessionInfo);
                    // Merge given user settings with defaults
                    setUiOptions({...DEF_UI.ui, ...json.settings.ui});
                    const mergedLineSettings = {...DEF_UI.line, ...json.settings.line};
                    setLineProperties(mergedLineSettings);
                    setLaserProperties({...DEF_UI.laser, ...json.settings.laser});
                    // Initialize localStorage with bezier setting from backend (after localStorage.clear())
                    localStorage.setItem('lineSmoothing', mergedLineSettings.bezier.toString());
                    sessionStorage.setItem('presentertoken_' + sid, json.token);
                    socket.emit('claim_board', { sid: sid, token: json.token });
                    return resp.status;
                }
            } catch (error) {
                log(DEBUG_LEVELS.ERROR, 'Error in presenterLogin: "' + error);
                return 500;
            }
        }
    }


    const initialSetup = async () => {
        // Only open websocket at this point so it's not opened if we come via Login page
        socket = socketIOClient(ENDPOINT, {
            transports: ['websocket']
        });
        
        var loginsuccess = await presenterLogin(props.sid).catch(err => log(DEBUG_LEVELS.ERROR, 'Error in presenterLogin: ' + err));
        log(DEBUG_LEVELS.DEBUG, 'Login returned code ' + loginsuccess);
        switch(loginsuccess) {
            case 200:
                break;
            case 404:
            case 401:
                log(DEBUG_LEVELS.ERROR, "Incorrect password or presenter already logged in.");
                setTimeout( function() {window.location.href="/";}, 2000);
                break;
            case 500:
                log(DEBUG_LEVELS.ERROR, "Internal server error occurred during login.");
                setTimeout( function() {window.location.href="/";}, 2000);
                break;
            default:
                return Promise.reject('The login process resulted in an unexpected condition');
                //break;
        }

        if(loginsuccess === 200) {
            try {
                const resp = await fetch(ENDPOINT + `/boardsettings/all/` + props.sid, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                    }
                })
                if(!resp.ok) {
                    log(DEBUG_LEVELS.ERROR, 'InitialSetup: Error getting boards settings!');
                    return Promise.reject('Error (' + resp.status + ') occurred')
                }
                const json = await resp.json();
    
                //log(DEBUG_LEVELS.DEV, json, false);
                const numboards = parseInt(json.boards.nvb);
                const activeid = parseInt(json.boards.ab);
                const startid = parseInt(json.boards.sb);

                let lastid = 1;
                let uniquecolors = [];
                json.settings.forEach(row => {
                    const bid = parseInt(row.boardid);
                    // Gather all unique board colors into an array
                    if(!uniquecolors.includes(row.color)) uniquecolors.push(row.color);
                    // Keep track of the largest board id
                    if(bid > lastid) lastid = bid;
                    // Initialize bgProps where we keep cached background images
                    bgProps[parseInt(row.boardid)] = {url: row.settings.bg?.url};
                    // Pre-load all existing images in the presentation (async)
                    if(row.settings.bg?.url) updateBgImage(row.settings.bg.url, bid);
                })
                // Sync initial teacher settings with ones at the server (if any)
                if(numboards > 0 && numboards !== DEF_UI.boards.nvb) setNumBoards(numboards);
                // NOTE: atm, setting the board limits starts the canvas events recreation loop on changes
                const newTo = startid + numboards - 1;
                const newEnd = (lastid > 0) ? lastid : 1;

                setBoardLimits( { 
                    from: startid,
                    to: newTo,
                    end: newEnd}
                );
                log(DEBUG_LEVELS.DEV, 'initialSetup: setting board limits - from:' + startid + ', to:' + newTo + ', end:' + newEnd);

                if(activeid > 1) {
                    /**
                     * TODO: we need to repeat code here, since we can't simply use changeBoard. If we do, the function
                     * will overwrite boardLimits.from as it is using the old value for numBoards, and figures it can be
                     * only DEF_UI.boards.nvb smaller than the current board number. All this is due to React state updates not
                     * being synchronous (immediate).
                     */
                    setCurrentBoard(activeid);
                    log(DEBUG_LEVELS.DEV, 'initialSetup: setting active board to ' + activeid);
                    socket.emit('set_active_board', {sid: props.sid, boardId: activeid, startId: activeid, token: getPresenterToken(props.sid)});
                    try {
                        const layer = mainLayer.current;
                        layer.destroyChildren();
                        layer.batchDraw();
                        const resp = await fetch(ENDPOINT + `/board/` + props.sid + `/` + activeid, {
                            method: 'GET',
                            headers: {
                                'Accept': 'application/json, text/plain, */*',
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                            }
                        })
                        if(resp.ok) {
                            const json = await resp.json();
                            handleBoardColorChange(json.settings.color);
                            if(json.shapes.length) {
                                playShapes(socket, json.shapes, { skipPenUps: 1, drawAsap: 1 })
                            }
                        } else {
                            log(DEBUG_LEVELS.ERROR, 'Error fetching data of board ' + activeid);
                            return Promise.reject('Error (' + resp.status + ') occurred')
                        }
                    } catch (err) {
                        log(DEBUG_LEVELS.ERROR, 'Error (setting board): "' + err);
                    }
                } else {
                    log(DEBUG_LEVELS.DEV, 'initialSetup: no active board, setting to 1');
                    changeBoard(1); // Server has no settings so we proceed from blank slate
                }
            } catch (error) {
                log(DEBUG_LEVELS.ERROR, 'Error: "' + error);
            }
    
            socket.on('disconnect', function() {
                socket.disconnect();
                log(DEBUG_LEVELS.ERROR, 'Server connection lost, closing Blackboard session!');
                setTimeout( function() { window.location.href="/";}, 4000);
            });
    
            socket.on('fatal_error', function(error) {
                log(DEBUG_LEVELS.ERROR, 'Fatal error: ' + error);
                socket.disconnect();
            });
    
            socket.on('viewer_count', function(c) {
                setViewerCount(parseInt(c));
            });

            // When receiving an admin notification, display it in a special way
            // and save session settings so they are not lost when the websocket disconnects
            socket.on('admin_notification', function(message) {
                displayAdminMsg(message);
                saveSessionSettingsToServer();
            });
    
            //window.addEventListener('keydown', keyNavigation);
        }
    }

    /**
     * On first render, sync the board password of the backend to match that of the UI.
     * This prevents problems in case the UI crashes or is reloaded and the backend still
     * holds the previous password. Changing the password also results in a fresh access
     * token to be given to us by the backend.
     * 
     * Next, we'll get the info on current boards configuration so we can return to the state
     * we left with on previous session (number of boards, biggest board id used, current board, etc.).
     */
    useEffect(() => {
        if (!setupRan.current === true) {
            initialSetup().catch(err => {
                log(DEBUG_LEVELS.ERROR, err);
                log(DEBUG_LEVELS.ERROR, 'There was an unrecoverable error loading this presentation. Please create a new presentation or contact the Blackboard 2.0 support team.');
                setTimeout( function() {window.location.href="/";}, 5000);
            })
        }
        return () => {
            setupRan.current = true;
        }
    }, []); 

    /**
     * We need to remove event handlers for canvas elements when changing the current tool.
     */
    const removeCanvasHandlers = () => {
        log(DEBUG_LEVELS.DEV, 'removeCanvasHandlers ran on stage id ' + stageEl.current._id);
        stageEl.current.getStage().off("pointerenter pointerleave mouseover mouseout", false);
        stageEl.current.removeEventListener('pointerdown pointerup pointermove');
        mainLayer.current.find('Transformer').forEach(node => node.destroy());

        // Remove shape-level event handlers and make all shapes non-draggable
        // This is especially important when snap-to-grid setting changes
        mainLayer.current.children.forEach(shape => {
            if (shape.className !== 'Transformer') {
                shape.draggable(false);
                shape.off('pointerdown');
                shape.off('dragmove');
                shape.off('transform');
                shape.off('transformend');
                shape.off('dragend');
            }
        });

        // Clear current drawing shape and pointer to prevent stale pointerId issues
        konvaShape.current = null;
        drawingPointer = null;
    }

    /**
     * Handle the download of current board as PNG
     */
    function downloadURI(uri, name) {
        log(DEBUG_LEVELS.DEV, 'downloadURI called with uri: ', uri);
        const link = document.createElement("a");
        link.download = name;
        link.href = uri;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    /**
     * Handle UI events for saving an image or pdf
     */
    const handleSaveImage = useCallback(async (format) => {
        if(format === 'png') {
            try {
                const dataURL = stageEl.current.toDataURL({
                    pixelRatio: 2
                });
                downloadURI(dataURL, 'board' + currentBoard + '.png');
                handleCloseSidebar(); // In case we run this from the sidebar, TODO: remove later?
            } catch (err) {
                log(DEBUG_LEVELS.ERROR, 'Error in handleSaveImage (png): ' + err)
            }
        }
        if(format === 'pdf') {
            try{
                const resp = await fetch(ENDPOINT + `/boards2pdf/` + props.sid,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/pdf, text/plain, */*',
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                    }
                })
                if(resp.ok) {
                    //setShowPDF(true);
                    const blob = await resp.blob();
                    download(blob, "boards_" + props.sid + ".pdf");
                } else {
                    log(DEBUG_LEVELS.ERROR, 'Error creating pdf!')
                    return Promise.reject('Error (' + resp.status + ') occurred')
                }
            } catch (err) {
                log(DEBUG_LEVELS.ERROR, 'Error in handleSaveImage (pdf): ' + err)
            }
        }
    }, [currentBoard, stageEl.current]);
    
    /**
     * Clear all boards. Present a confirmation dialog before doing this,
     * as the shapes are really deleted (not just hidden like when clearing
     * a single board).
     */
    const postClear = useCallback(() => {
        try {
            changeBoard(1);
            setBoardLimits({ from: 1, to: numBoards, end: 1 });
            //setStroke({color: DEFAULT_SHAPE_STROKE, enabled: true});
            //setFill({color: DEFAULT_SHAPE_FILL, enabled: false})
            setBoardSettings(DEF_BOARD);
            setStrokeColors([DEFAULT_SHAPE_STROKE]);
            setFillColors([DEFAULT_SHAPE_FILL]);
            setBoardColors([DEF_BOARD.color]);
            mainLayer.current.destroyChildren();
            mainLayer.current.batchDraw();
            clearAllPreviews();
            if(numBoards !== DEF_UI.boards.nvb) {
                reConfigureBoards(DEF_UI.boards.nvb);
            }
        } catch (error) {
            throw new Error('Error resetting UI!');
        }
    },[numBoards, mainLayer.current]);

    /**
     * Clear the most recently drawn shape
     */
    const clearLast = async () => {
        try {
            const layer = mainLayer.current;
            const resp = await fetch(ENDPOINT + `/lastline/` + props.sid + '/' + currentBoard, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                }
            })
            if (!resp.ok) {
                if (resp.status === 404) {
                    log(DEBUG_LEVELS.WARN, 'No shapes left to undo on this board!', true);
                    return;
                } else {
                    log(DEBUG_LEVELS.ERROR, 'Error (' + resp.status + ') occurred in clearLast', true);
                    return;
                }
            }
            try {
                const result = await resp.json();        
                // Endpoint now returns an array of ids that have been deleted; here we only need one
                if (result.boardid > 0 && result.shapeids[0] > 0) {
                    const deletedLine = layer.findOne(node => {
                        return node.getAttr('dbId') == result.shapeids[0] // Note == instead of === since BigInt !!
                    })
                    if(deletedLine !== undefined) {
                        deletedLine.destroy();
                        layer.batchDraw();
                        log(DEBUG_LEVELS.NONE, 'Undo');
                    } else {
                        log(DEBUG_LEVELS.ERROR, 'Could not find the shape #' + result.shapeids[0] + ' you just undid!', true);
                        return Promise.reject('Could not find the shape #' + result.shapeids[0] + ' you just undid!')
                    }
                }
            } catch (err) {
                log(DEBUG_LEVELS.ERROR, 'Error in clearLast: ' + err), true;
            }
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in clearLast: ' + error);
        }
    };

    /**
     * Restore the most recently drawn shape
     */
     const restoreLast = async () => {
         try {
            const layer = mainLayer.current;
            const resp = await fetch(ENDPOINT + `/lastline/` + props.sid + '/' + currentBoard, {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                }
            })
            if (!resp.ok) {
                if (resp.status === 404) {
                    layer.batchDraw();
                    log(DEBUG_LEVELS.WARN, 'No shapes found to redo on this board!', true);
                    return;
                } else {
                    log(DEBUG_LEVELS.ERROR, 'Error (' + resp.status + ') occurred in restoreLast', true);
                    return;
                }
            }
            const result = await resp.json();
            if (result.boardid > 0 && result.id > 0) { // TODO: what should we check here?
                playShapes(null, [result], { skipPenUps: 1, drawAsap: 0 });
                log(DEBUG_LEVELS.NONE, 'Redo');
            }
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in restoreLast: "' + error), true;
         }
    };

    /**
     * Handle ui changes for changing current tool into Select
     */
     const selectShape = (tool) => {
        removeCanvasHandlers();
        mainLayer.current.listening(true);
        //mainLayer.current.transformsEnabled('none');
        if(tool === 'Pointer') {
            socket.emit('laser_off', {sid: props.sid, token: getPresenterToken(props.sid)});
        }
        stageEl.current.on('pointerdown', function (e) {
            // If swipe is going on, don't do anything (NOTE: using swipeRef to get the latest value)
            if(!swipeRef.current && !busyDragging) {
                if (e.target !== e.target.getStage()) {
                    e.target.off('pointerdown'); // prevent multiple firing
                    handleContextMenu(e);
                }
            }
        });
        mainLayer.current.batchDraw(); // need a draw to activate event listening
    }

    /**
     * Handle ui changes for changing current tool into Transform
     */
     const transformShape = (tool) => {
        removeCanvasHandlers();
        mainLayer.current.listening(true);
        mainLayer.current.transformsEnabled('all');

        if(tool === 'Pointer') {
            socket.emit('laser_off', {sid: props.sid, token: getPresenterToken(props.sid)});
        }
        stageEl.current.on('pointerdown', function (e) {
            // If swipe is going on, don't do anything (NOTE: using swipeRef to get the latest value)
            if(!swipeRef.current && !busyDragging) {
                if (e.target !== e.target.getStage()) {
                    e.target.off('pointerdown'); // prevent multiple firing
                    e.target.draggable(true);

                    // If snap is on, we constrain drag movement to grid
                    if(boardSettings.settings.grid.snap) {
                        let addX = 0;
                        let addY = 0;
                        /**
                         * Shapes with coordinates at center need special treatment
                         * Essentially we check if the shape is symmetric relative to gridline crossing or not
                         * and if not, we add half a grid block to the center point coordinate in that (x/y) direction.
                         * The multipliers 0.1 and 0.9 allow snapping even if the object size does not quite 
                         * match the grid size.
                         */ 
                        if(e.target.attrs.name === 'Ellipse') {
                            const modX = Math.abs(e.target.width()) * 0.5 % gridBlockSize.x;
                            const modY = Math.abs(e.target.height()) * 0.5 % gridBlockSize.y;
                            if(modX > (0.1 * gridBlockSize.x) && modX < (0.9 * gridBlockSize.x)) {
                                addX = gridBlockSize.x * 0.5;
                            }
                            if(modY > (0.1 * gridBlockSize.y) && modY < (0.9 * gridBlockSize.y)) {
                                addY += gridBlockSize.y * 0.5;
                            }
                        }
                        e.target.on('dragmove', function () {
                            const loc = stageEl.current.getPointerPosition();//contextMenu.target.absolutePosition();
                            let newX, newY;
                            [newX, newY] = getSnappedCoordinates(loc.x, loc.y);
                            e.target.absolutePosition({
                                x: newX + addX,
                                y: newY + addY
                            });
                        })
                    }

                    // Create a Konva transformer for manipulating the object that was touched
                    const transformerConfig = {
                        rotateEnabled: ui.rotateEnabled ? true : false,
                        anchorDragBoundFunc: function (oldPos, newPos, e) {

                            if(!boardSettings.settings.grid.snap) return newPos;

                            // oldPos - is old absolute position of the anchor
                            // newPos - is a new (possible) absolute position of the anchor based on pointer position
                            // it is possible that anchor will have a different absolute position after this function
                            // because every anchor has its own limits on position, based on resizing logic
                  
                            // do not snap rotating point
                            if (transformer.getActiveAnchor() === 'rotater') {
                              return newPos;
                            }

                            const closestX = Math.round(newPos.x / gridBlockSize.x) * gridBlockSize.x;
                            const diffX = Math.abs(newPos.x - closestX);

                            const closestY = Math.round(newPos.y / gridBlockSize.y) * gridBlockSize.y;
                            const diffY = Math.abs(newPos.y - closestY);
                  
                            const snappedX = diffX < 10;
                            const snappedY = diffY < 10;

                            // a bit different snap strategies based on snap direction
                            // we need to reuse old position for better UX
                            if (snappedX && !snappedY) {
                              return {
                                x: closestX,
                                y: oldPos.y,
                              };
                            } else if (snappedY && !snappedX) {
                              return {
                                x: oldPos.x,
                                y: closestY,
                              };
                            } else if (snappedX && snappedY) {
                              return {
                                x: closestX,
                                y: closestY,
                              };
                            }
                            return newPos;
                        }
                    };

                    const transformer = new Konva.Transformer(transformerConfig);
                    mainLayer.current.add(transformer);
                    transformer.nodes([e.target]);
                    
                    // Remove any existing event handlers to prevent multiple firing
                    e.target.off('transform');
                    e.target.off('transformend');
                    e.target.off('dragend');
                    
                    // Flag to track if transformend has handled the update (to avoid duplicate calls from dragend)
                    let transformHandled = false;
                    
                    /*e.target.on('transformstart', function () {
                        mainLayer.current.BatchDraw();
                        log(DEBUG_LEVELS.DEV, 'Transform starting');
                    })*/
                    e.target.on('transform', () => {
                        //console.info(e.target.getTransform().m);
                        const shapeName = e.target.attrs?.name;

                        // For arrows, recalculate points based on scale (like polylines)
                        if(shapeName === 'Arrow') {
                            const scaleX = e.target.scaleX();
                            const scaleY = e.target.scaleY();
                            const points = e.target.points();

                            // Scale the points and reset scale to 1
                            const newPoints = points.map((point, index) => {
                                return index % 2 === 0 ? point * scaleX : point * scaleY;
                            });

                            e.target.setAttrs({
                                points: newPoints,
                                scaleX: 1,
                                scaleY: 1,
                            });
                        } else if(shapeName !== 'Line' && shapeName !== 'Polyline') {
                            // For other shapes (Rect, Ellipse, etc), bake scale into width/height
                            e.target.setAttrs({
                                width: e.target.width() * e.target.scaleX(),
                                height: e.target.height() * e.target.scaleY(),
                                scaleX: 1,
                                scaleY: 1,
                            });
                        }
                    });
                    e.target.on('transformend', function () {
                        log(DEBUG_LEVELS.DEV, 'TransformEnd called. ScaleX: ' + e.target.scaleX() + ' ScaleY: ' + e.target.scaleY() + ' Rotation: ' + e.target.rotation());
                        transformHandled = true;
                        handleShapeTransform(e.target);
                        e.target.draggable(false);
                        transformer.nodes([]);
                    })
                    e.target.on('dragend', function () {
                        //console.info(e.target.parent.constructor.name, e.target.attrs?.name);
                        // Only handle if transformend hasn't already handled it and we're not on a transformer handle
                        if(!transformHandled && e.target.parent.constructor.name !== 'Transformer') {
                            handleShapeTransform(e.target);
                            busyDragging = false;
                        }
                        // Reset flag for next interaction
                        transformHandled = false;
                        log(DEBUG_LEVELS.DEV, 'Dropped at: ' + e.target.attrs.x + ', ' + e.target.attrs.y);
                    })
                } else {
                    // We clicked on the stage, so remove all Transformer instances to "deselect" objects
                    log(DEBUG_LEVELS.DEV, 'Clicked on stage, removing all transformers');
                    mainLayer.current.find('Transformer').forEach((t) => t.destroy());
                }
            }
        });
        mainLayer.current.batchDraw(); // need a draw to activate event listening
    }

    /**
     * Handle ui changes for changing current tool into Delete
     */
    const deleteShape = (tool) => {
        removeCanvasHandlers();
        mainLayer.current.listening(true);
        mainLayer.current.transformsEnabled('none');
        if(tool === 'Pointer') {
            socket.emit('laser_off', {sid: props.sid, token: getPresenterToken(props.sid)});
        }
        stageEl.current.on('pointerenter', function (e) {
            // If swipe is going on, don't do anything (NOTE: using swipeRef to get the latest value)
            if(!swipeRef.current) {
                if (e.target !== e.target.getStage()) {
                    e.target.off('pointerenter'); // prevent multiple firing
                    // skip mouseover without a button down (TODO: how to limit to left button as button is -1 when dragging)
                    if(e.evt.pointerType === 'mouse' && !e.evt.buttons) return;
                    e.target.setAttr("draggable", false); // in case shape is previously set as draggable
                    addShapeToDeleteQueue(e.target);
                }
            }
        });
        mainLayer.current.batchDraw(); // need a draw to activate event listening
    }

    /**
     * Handle ui changes for changing current tool into Recolor
     */
     const recolorShape = (tool) => {
        removeCanvasHandlers();
        mainLayer.current.listening(true);
        mainLayer.current.transformsEnabled('none');

        if(tool === 'Pointer') {
            socket.emit('laser_off', {sid: props.sid, token: getPresenterToken(props.sid)});
        }

        stageEl.current.on('pointerenter', function (e) {
            // If swipe is going on, don't do anything (NOTE: using swipeRef to get the latest value)
            if(!swipeRef.current) {
                if (e.target !== e.target.getStage()) {
                    e.target.off('pointerenter'); // prevent multiple firing
                    // skip mouseover without a button down (TODO: how to limit to left button as button is -1 when dragging)
                    if(e.evt.pointerType === 'mouse' && !e.evt.buttons) return;
                    e.target.setAttr("draggable", false); // in case shape is previously set as draggable
                    //if(e.target.attrs.name === 'Wipe') return; // Don't recolor wipes
                    //handleShapeDelete(e.target);
                    addShapeToRecolorQueue(e.target, stroke.color);
                }
            }
        });
        mainLayer.current.batchDraw(); // need a draw to activate event listening
    }

    /**
     * Handle ui changes for changing current tool into Laser
     */
    const laserPointer = (tool) => {
        removeCanvasHandlers();
        socket.emit('laser_on', {color: laserProperties.color, size: laserProperties.size, sid: props.sid, token: getPresenterToken(props.sid)});
        stageEl.current.addEventListener('pointermove', laserMove, { passive: false });
        log(DEBUG_LEVELS.DEV, 'laserPointer added event listener for pointermove');
        //drawLayer.current.listening(true); // no need to listen when drawing
        mainLayer.current.listening(false);
        mainLayer.current.transformsEnabled('none'); // disable transforms while drawing
        mainLayer.current.batchDraw(); // need a draw to activate event listening
    }

    /**
     * Handle ui changes for changing current tool into some shape-forming one
     */
     const drawShape = (previousTool, shapeType) => {
        const layer = mainLayer.current;
        const drawLayer = toolLayer.current;
        log(DEBUG_LEVELS.DEV, 'drawShape called, previous tool: ' + previousTool + ', shapeType: ' + shapeType);
        removeCanvasHandlers();
        //layer.listening(false); // no need to listen when drawing
        layer.transformsEnabled('none'); // disable transforms while drawing
        drawLayer.batchDraw(); // need a draw to activate event listening
        //layer.find('Line').draggable(false);
        if(layer === null) {
            log(DEBUG_LEVELS.ERROR, 'Layer is null, bailing out! TODO: FIX THIS!', true);
        } else {
            // If switching from laser pointer, let others know the beam needs to be shut off
            if(previousTool === 'Pointer') {
                socket.emit('laser_off', {sid: props.sid, token: getPresenterToken(props.sid)});
                log(DEBUG_LEVELS.DEV, 'Sending laser_off to clients', true);
            }
            if(previousTool === 'Polyline' && openPolyLine.shape) {
                resetPolyline();
            }

            listenToShapes(shapeType);
            log(DEBUG_LEVELS.DEV, 'Listening to shapes of type ' + shapeType, true);
        }
    };

    /**
     * Return the board number for given navigation command
     * along with if the current board needs to be changed
     */
    const boardNumToNavigateWith = (where) => {
        let newB;
        switch (where) {
            case 'next':
                newB = parseInt(currentBoard) + 1;
                break;
            case 'previous':
                newB = Math.max(parseInt(currentBoard) - 1, 1);
                break;
            case 'down':
                const targetD = currentBoard - parseInt(Math.sqrt(numBoards));
                newB = Math.max(1, targetD); // Don't let it go below zero
                break;
            case 'up':
                const targetU = currentBoard + parseInt(Math.sqrt(numBoards));
                newB = Math.min(boardLimits.end, targetU); // Don't let it go above last
                break;
            case 'last':
                newB = parseInt(boardLimits.end);
                break;
            case 'first':
            default:
                newB = 1;
                break;
        }
        return {new: newB, changed: currentBoard === newB ? false : true};
    }

    const navigateBoard = (where) => {
        //if(busyPainting) return;
        const nextBoard = boardNumToNavigateWith(where);
        if(nextBoard.changed && nextBoard.new > 0) {
            mainLayer.current.destroyChildren();
            changeBoard(nextBoard.new);
        }
        stageEl.current.position({x: 0, y: 0});
    }

    /**
     * Handle changing the board color.
     * Use useCallback so the function is passed by reference to child components
     */
    const handleBoardColorChange = useCallback((color) => {
        setBoardSettings({...boardSettings, color: color});
    }, [boardSettings]);

    /**
     * Handle changing the line color. Set save to true to update fill colors in menu.
     * NOTE: the color argument is an object like {color: '#000000', enabled: true}
     */
    const handleShapeColorChange = useCallback(async (mode, color, save=false) => {
        const adjustingFill = mode === 'fill';
        if(adjustingFill) {
            if(!color.color) {
                throw new Error('Fill color missing!');
            }
            setFill(color);
        } else {
            if(!color.color) {
                throw new Error('Stroke color missing!');
            }
            setStroke(color);
        }
    }, []);

    /**
     * Handle swiping the board
     */
    const handleSwipe = (e) => {
        if(swipeStart.x) {
            const stage = e.target.getStage();
            var touch = e.evt.touches[1]; // just take the 1st finger for now
            const newX = touch.clientX - swipeStart.x;
            const newY = touch.clientY - swipeStart.y;
            /*var newPos = {
                x: touch.clientX - swipeStart.x,
                y: touch.clientY - swipeStart.y,
            };*/
            //const layer = mainLayer.current.findOne('#swiperect');
            //rect.position(newPos);
            if(Math.abs(newX) > Math.abs(newY)) {
                stage.position({x: newX, y: 0});
            } else {
                stage.position({x: 0, y: newY});
            }
            log(DEBUG_LEVELS.DEV, 'handleSwipe: touch.clientX: ' + touch.clientX + ' swipeStart.x: ' + swipeStart.x);
        } else {
            log(DEBUG_LEVELS.ERROR, 'SwipeStart not valid: x:' + swipeStart.x + ', y:' + swipeStart.y + 'id: ' + swipeStart.id + ', num: ' + swipeStart.num + ', len: ' + e.evt.touches.length, true);
        }
    };
    
    /**
     * Handle 3-finger swipe end
     */
    const handle3fSwipeEnd = (e) => {
        const stage = e.target.getStage();
        swipeOngoing = false;
        stage.off('touchend'); // prevent multiple firing
        if(swipeStart) {
            const swipeX = stage.position().x;
            const swipeY = stage.position().y;
            log(DEBUG_LEVELS.DEV, 'handle3fSwipeEnd: x: ' + swipeX + ', y: ' + swipeY, true);
            setSwipeStart(false);
            swipeRef.current = false;
            if(Math.abs(swipeX) > Math.abs(swipeY)) {
                if(swipeX > SWIPE_X_THRESHOLD) {
                    log(DEBUG_LEVELS.DEBUG, '3f left', true);
                    navigateBoard('previous');
                } else if(swipeX < -SWIPE_X_THRESHOLD) {
                    log(DEBUG_LEVELS.DEBUG, '3f right', true);
                    navigateBoard('next');
                }
            } else {
                if(swipeY > SWIPE_Y_THRESHOLD) {
                    log(DEBUG_LEVELS.DEBUG, '3f down', true);
                    navigateBoard('down');
                } else if(swipeY < -SWIPE_Y_THRESHOLD) {
                    log(DEBUG_LEVELS.DEBUG, '3f up', true);
                    navigateBoard('up');
                }
            }
            stage.position({x: 0, y: 0});
        }
    };

    /**
     * Handle 2-finger swipe end
     */
    const handle2fSwipeEnd = (e) => {
    const stage = e.target.getStage();
    stage.off('touchend'); // prevent multiple firing
    if(swipeStart) {
        if(e.evt.changedTouches.length) {
            const swipeX = e.evt.changedTouches[0].clientX - swipeStart.x;
            const swipeY = e.evt.changedTouches[0].clientY - swipeStart.y;
            setSwipeStart(false);
            swipeRef.current = false;
            log(DEBUG_LEVELS.DEV, 'handle2fSwipeEnd: x: ' + swipeX + ', y: ' + swipeY);
            if(Math.abs(swipeX) > Math.abs(swipeY)) {
                if(swipeX > SWIPE_X_THRESHOLD) {
                    log(DEBUG_LEVELS.DEBUG, '2f right', true);
                    clearLast();
                } else if(swipeX < -SWIPE_X_THRESHOLD) {
                    log(DEBUG_LEVELS.DEBUG, '2f left', true);
                    restoreLast();
                }
            } else {
                if(swipeY > SWIPE_Y_THRESHOLD) {
                    log(DEBUG_LEVELS.DEBUG, '2f down', true);
                } else if(swipeY < -SWIPE_Y_THRESHOLD) {
                    log(DEBUG_LEVELS.DEBUG, '2f up', true);
                }
            }
        } else {
            log(DEBUG_LEVELS.ERROR, 'no events in queue');
        }
    }
};
    
    /**
     * Handle tap end
     */
    /*const handleTapEnd = (e) => {
        const stage = e.target.getStage();
        stage.off('touchend'); // prevent multiple firing
        switch(swipeStart.num) {
            case 2:
                setSwipeStart(false);
                swipeRef.current = false;
                clearLast();
                stage.position({x: 0, y: 0});
                break;
            case 3:
                setSwipeStart(false);
                swipeRef.current = false;
                restoreLast();
                stage.position({x: 0, y: 0});
                break;
            default:
                break;
        }
    };*/
    
    /**
     * Handle transforming a shape
     */
    const handleShapeTransform = async (shape) => {
        //shape.off('dragend'); // prevent multiple firing
        //shape.setAttr("draggable", false); // prevent draggable property from hanging to recolor etc.
        //setBusyPainting(true);
        if(!shape.attrs.dbId) {
            return Promise.reject('Shape database id missing!');
        }
        try {
            const stage = stageEl.current.getStage();
            let reqBody = {
                boardid: currentBoard,
                shapedetails: {
                    rotation: shape.attrs.rotation ?? 0,
                    scaleX: shape.attrs.scaleX ?? 1,
                    scaleY: shape.attrs.scaleY ?? 1,
                }
            }

            // For arrows, save the updated points and position
            if(shape.attrs.name === 'Arrow' && shape.attrs.points) {
                const points = shape.attrs.points;
                // Store arrow points in the same format as initial creation: [[0,0,0], [0, relative_x, relative_y]]
                reqBody.shapedata = [
                    [0, 0, 0],
                    [0, pixelsToPct(points[2], stage.width()), pixelsToPct(points[3], stage.height())]
                ];
                // Arrow position is stored separately
                reqBody.x = toRelativeCoords(shape.attrs.x, stage.width()).toString();
                reqBody.y = toRelativeCoords(shape.attrs.y, stage.height()).toString();
            } else {
                // For other shapes, send x, y normally
                reqBody.x = toRelativeCoords(shape.attrs.x, stage.width()).toString();
                reqBody.y = toRelativeCoords(shape.attrs.y, stage.height()).toString();
            }

            if(shape.attrs.radiusX) reqBody.shapedetails['radiusX'] = pixelsToPct(shape.attrs.radiusX, stage.width());
            if(shape.attrs.radiusY) reqBody.shapedetails['radiusY'] = pixelsToPct(shape.attrs.radiusY, stage.height());
            if(shape.attrs.width) reqBody.shapedetails['width'] = pixelsToPct(shape.attrs.width, stage.width());
            if(shape.attrs.height) reqBody.shapedetails['height'] = pixelsToPct(shape.attrs.height, stage.height());

            const resp = await fetch(ENDPOINT + `/shape/` + props.sid + '/' + shape.attrs.dbId, {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                },
                body: JSON.stringify(reqBody)
            })
            if(!resp.ok) {
                log(DEBUG_LEVELS.ERROR, 'Error transforming shape!', true);
                //setBusyPainting(false);
                return Promise.reject('Error (' + resp.status + ') occurred')
            }
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in handleShapeTransform: ' + error, true);
        }
        shape.setAttr('opacity', 1.0);
        //shape.draw();
        //setBusyPainting(false);
        // for now just inform that we have moved something on board x so it can be refetched
        // TODO : implement moving just the shape later on
    };
    
    /**
     * Handle modifying shape properties
     */
    const handleShapeUpdate = async (shape, properties) => {
        //setBusyPainting(true);
        // For now, add boardId to the object as it is required. Later allow shape to change board?
        properties['boardid'] = currentBoard;
        // starttime needs to be transferred as string, not number (due to OpenAPI spec)
        if(properties.starttime) properties['starttime'] = properties.starttime.toString();
        try {
            const resp = await fetch(ENDPOINT + `/shape/` + props.sid + '/' + shape.attrs.dbId, {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                },
                body: JSON.stringify(properties)
            })
            if(!resp.ok) {
                log(DEBUG_LEVELS.ERROR, 'Error updating shape!');
                //setBusyPainting(false);
                return Promise.reject('Error (' + resp.status + ') occurred')
            }
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in handleShapeUpdate: ' + error);
        }
        shape.setAttr('opacity', 1.0);
        shape.draw();
        //setBusyPainting(false);
        // for now just inform that we have moved something on board x so it can be refetched
        // TODO: implement moving just the shape later on
    };
    
    /**
    * Delete shapes ran over by the Erase tool during the current one second period
    * (as there may be more while we delete, need to take a copy and reset the original array)
    */
    const batchShapeDelete = async () => {
        //console.info('calling batchShapeDelete');
        if(shapes_to_delete.size) {
            const copy = Array.from(shapes_to_delete); // take items in the queue
            shapes_to_delete.clear(); // and empty the queue so we can accept more right away
            log(DEBUG_LEVELS.DEV, 'batchShapeDelete: deleting ' + copy);
            try {
                const resp = await fetch(ENDPOINT + `/shapes/` + props.sid , {
                    method: 'DELETE',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                    },
                    // TODO: should handle the cases where we change boards during batch operations
                    body: JSON.stringify({dbIds: copy, boardid: currentBoard})
                })
                if (resp.ok) {
                    const layer = mainLayer.current;
                    layer.batchDraw();
                } else {
                    log(DEBUG_LEVELS.ERROR, 'Error deleting shapes!');
                    return Promise.reject('Error (' + resp.status + ') occurred')
                }
            } catch (error) {
                log(DEBUG_LEVELS.ERROR, 'Error in batchShapeDelete: ' + error)
            }
        }
    };

    /**
     * Recolor one color at the time (it's unlikely that the user manages to recolor using different
     * colors during the one second tick period, so no need to go through all possible colors at one run).
     * Once again, we take a copy and operate on that, deleting any items in the original for that color.
     */
     const batchShapeRecolor = async () => {
        const colorsToProcess = Object.keys(shapes_to_recolor);
        if(colorsToProcess.length) {
            // Handle the first color to be processed and remove it
            const arrayOfShapes = shapes_to_recolor[colorsToProcess[0]];
            delete shapes_to_recolor[colorsToProcess[0]];
            //setBusyPainting(true);
            try {
                log('batchShapeRecolor: recolor to ', colorsToProcess[0], ':', arrayOfShapes);
                const resp = await fetch(ENDPOINT + `/shaperecolor/` + props.sid + '/', {
                    method: 'PATCH',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                    },
                    // TODO: should handle the cases where we change boards during batch operations
                    body: JSON.stringify({color: colorsToProcess[0], dbIds: arrayOfShapes, boardid: currentBoard})
                })
                if (!resp.ok) {
                    log(DEBUG_LEVELS.ERROR, 'Error recoloring shapes!');
                    //setBusyPainting(false);
                    return Promise.reject('Error (' + resp.status + ') occurred')
                } else {
                    const layer = mainLayer.current;
                    layer.batchDraw();
                }
            } catch (error) {
                log(DEBUG_LEVELS.ERROR, 'Error in batchShapeRecolor: ' + error)
            }
            //setBusyPainting(false);
        }
    };

    /**
     * Handle changing the stroke width
     */
    const handleStrokeWidthChange = (width) => {
        setLineProperties({...lineProperties, width: Number(width)});
    }

    /**
     * Save session settings before exiting to main page
     */
    const saveAndQuit = async () => {
        const res = await saveSessionSettingsToServer();
        if(res) window.location.href="/";
    }

    
    const saveSessionSettingsToServer = async () => {
        if (!boardLimits) {
            log(DEBUG_LEVELS.ERROR, 'Board limits not set, cannot save settings!', true);
            return;
        }
        try {
        // settings is a different parameter, gathered from several variables
            const settings = {
                boards: {ab: currentBoard, sb: boardLimits.from, nvb: numBoards},
                ui: ui,
                line: lineProperties,
                laser: laserProperties
            }
            const response = await handleSettingsChange({settings: settings});
            return response;
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in saveSessionSettingsToServer: ' + error, true);
        }
    }

    const switchToSimpleMode = () => {
        if(!currentTool.simple) {
            log(DEBUG_LEVELS.WARN, 'Note: Current tool changed into draw due to UI mode change.');
            handleToolChange({name: 'Line', label: getToolLabel('Line')});
        };
        if(fill.enabled) {
            log(DEBUG_LEVELS.WARN, 'Note: Fill is not supported in simple mode, so it is now disabled.')
            setFill({...fill, enabled: false});
        }
        if(!stroke.enabled) {
            log(DEBUG_LEVELS.WARN, 'Note: Stroke needs to be enabled in simple mode, so it is now.')
            setStroke({...stroke, enabled: true});
        }
        setUiOptions({...ui, complex: false});
    }

    const switchToAdvancedMode = () => {
        setUiOptions({...ui, complex: true});
    }

    const handleSettingsChange = async (s) => {
        try {
            const resp = await fetch(ENDPOINT + `/settings/` + props.sid + '/', {
                method: 'PATCH',
                body: JSON.stringify(s),
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                }
            })
            if(!resp.ok) {
                log(DEBUG_LEVELS.ERROR, 'Error changing settings: ' + resp.status + ' ' + resp.statusText, true);
                return Promise.reject(false)
            } else {
                const json = await resp.json();
                if(json) {
                    log(DEBUG_LEVELS.NONE, "Settings saved successfully");
                    return Promise.resolve(true);
                }
            }
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in handleSettingsChange: ' + error, true);
            return Promise.reject(false)
        }
    }

    /**
     * Handle changing/saving the session settings.
     */
    const handleSessionChange = useCallback(async (param, val) => {
        var newData = {};
        newData[param] = val;
        if(param === 'presenterpw' && val === '') {
            log(DEBUG_LEVELS.ERROR, 'Presenter password cannot be empty.');
            return Promise.reject('Presenter password cannot be empty.')
        }
        try {
            const resp = await fetch(ENDPOINT + `/session/` + props.sid + '/', {
                method: 'PATCH',
                body: JSON.stringify(newData),
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                }
            })
            if(!resp.ok) {
                log(DEBUG_LEVELS.ERROR, 'Error changing field!', true);
                return Promise.reject('Error (' + resp.status + ') occurred')
            } else {
                const json = await resp.json();
                if(json) {
                    switch(param) {
                        // settings is a different parameter, gathered from several variables
                        case 'settings':
                            log(DEBUG_LEVELS.NONE, 'Session settings saved');
                            break;
                        case 'presenterpw':
                            sessionStorage.setItem('presentertoken_' + props.sid, json.token);
                            log(DEBUG_LEVELS.NONE, 'Presenter password successfully changed (please remember it!)');
                            break;
                        case 'viewerpw':
                            setSessionInfo({
                                ...sessionInfo,
                                viewerpw: json.viewerpw,
                            })
                            log(DEBUG_LEVELS.NONE, 'Viewer password successfully changed');
                            break;
                        case 'sessionname':
                            setSessionInfo({
                                ...sessionInfo,
                                sessionname: json.sessionname,
                            })
                            log(DEBUG_LEVELS.NONE, 'Session name successfully changed');
                            break;
                        case 'ispublic':
                            setSessionInfo({
                                ...sessionInfo,
                                ispublic: json.ispublic,
                            })
                            log(DEBUG_LEVELS.NONE, 'Session visibility set to ' + json.ispublic);
                            break;
                        default:
                            log(DEBUG_LEVELS.WARN, 'Tried to change a yet unknown session parameter...', true);
                            break;
                    }
                }
            }
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in handleSessionChange: ' + error, true)
            return Promise.reject('Error (' + error + ') occurred')
        }
    },[sessionInfo]);
    
    /**
     * Handle changing the current board
     * (for now we simply change it and let it be handled in useEffect)
     */
    const changeBoard = useCallback((board) => {
        // In case we have a polyLine open, we need to get rid of it first
        resetPolyline();
        if(isNaN(board)) {
            throw new Error('ChangeBoard called with a non-number: ', board);
        }
        setCurrentBoard(board);
    }, []);

    /**
     * Handle changing the number of simultaneously visible boards
     * in grid view.
     * 
     * @param {int} nvb Number of visible boards
     */
    const reConfigureBoards = (nvb) => {
        if(isNaN(nvb)) {
            throw new Error('ReConfigureBoards called with a non-number: ', nvb);
        }
        log(DEBUG_LEVELS.DEV, 'Emitting reconfigure_boards for ab ' + parseInt(currentBoard) +  ' and nvb ' + parseInt(nvb));
        const newTo = Math.max(currentBoard, nvb);
        const newFrom = newTo - nvb + 1;
        if (newTo !== boardLimits.to || newFrom !== boardLimits.from) {
            setBoardLimits({...boardLimits, from: newFrom, to: newTo });
            log(DEBUG_LEVELS.DEV, 'setting board limits from:' + newFrom + ' to:' + newTo);
        }
        
        setNumBoards(parseInt(nvb));
        socket.emit('reconfigure_boards', { sid: props.sid, sb: parseInt(newFrom), to: parseInt(newTo), ab: parseInt(currentBoard), nvb: parseInt(nvb), token: getPresenterToken(props.sid) });
    }

    const releaseToken = useCallback(() => {
        log(DEBUG_LEVELS.DEBUG, 'Closing websocket connection...');
        sessionStorage.removeItem('presentertoken_' + props.sid);
        socket.disconnect();
        log(DEBUG_LEVELS.INFO, 'Websocket connection closed!');
    }, [socket]);

    /** 
     * Async function to do the actual saving of a finished shape
     */
    const saveShape = async(drawnShape, pointsData) => {
        if(!drawnShape.attrs) return Promise.reject('Shape attributes missing');
        let reqBody = {
            boardid: drawnShape.attrs.boardId,
            visible: true,
            starttime: drawnShape.attrs.startTime.toString(),
            shapetype: drawnShape.attrs.name,
            x: toRelativeCoords(drawnShape.attrs.x, stageSize.width).toString(),
            y: toRelativeCoords(drawnShape.attrs.y, stageSize.height).toString(),
            stroke: drawnShape.attrs.stroke,
            fill: drawnShape.attrs.fill,
            shapedetails: {
                strokeWidth: pixelsToPct(drawnShape.attrs.strokeWidth, stageSize.width),
                strokeEnabled: drawnShape.attrs.strokeEnabled,
                fillEnabled: drawnShape.attrs.fillEnabled,
                closed: drawnShape.attrs.closed,    
            }
        }
        switch(drawnShape.attrs.name) {
            case 'Line':
            case 'Polyline':
                reqBody.shapedetails['bezier'] = drawnShape.attrs.bezier;
                reqBody.shapedetails['tension'] = Number(drawnShape.attrs.tension);
                reqBody.shapedata = pointsData;
                break;
            case 'Arrow':
                if(drawnShape.attrs.points.length === 4) {
                    reqBody.shapedata = [[0,0,0],[0,pixelsToPct(drawnShape.attrs.points[2], stageSize.width),pixelsToPct(drawnShape.attrs.points[3], stageSize.height)]];
                } else {
                    // we probably have an arrow with only one point; maybe someone wants just an arrowhead...
                    reqBody.shapedata = [[0,0,0],[0,0,0]];
                }
                break;
            case 'Rect':
                if((drawnShape.attrs.width !== 0) || (drawnShape.attrs.height !== 0)) {
                    reqBody.shapedetails['width'] = pixelsToPct(drawnShape.attrs.width, stageSize.width);
                    reqBody.shapedetails['height'] = pixelsToPct(drawnShape.attrs.height, stageSize.height);
                } else {
                    drawnShape.destroy();
                    return Promise.reject('Rectangle requires a non-zero width or height');
                }
                break;
            case 'Circle':
            case 'Dot':
                if(drawnShape.attrs.radius !== 0) {
                    reqBody.shapedetails['radius'] = pixelsToPct(drawnShape.attrs.radius, stageSize.width);
                } else {
                    drawnShape.destroy();
                    return Promise.reject('Circle requires a non-zero radius');
                }
                break;
            case 'Ellipse':
                if((drawnShape.attrs.radiusX !== 0) || (drawnShape.attrs.radiusY !== 0)) {
                    reqBody.shapedetails['radiusX'] = pixelsToPct(drawnShape.attrs.radiusX, stageSize.width);
                    reqBody.shapedetails['radiusY'] = pixelsToPct(drawnShape.attrs.radiusY, stageSize.height);
                } else {
                    drawnShape.destroy();
                    return Promise.reject('Ellipse requires a non-zero X and Y radius');
                }
                break;
            case 'Grid':
                reqBody.shapedetails['hspacing'] = Number(pixelsToPct(drawnShape.attrs.hspacing, stageSize.width));
                reqBody.shapedetails['vspacing'] = Number(pixelsToPct(drawnShape.attrs.vspacing, stageSize.height));
                reqBody.shapedetails['width'] = pixelsToPct(drawnShape.attrs.width, stageSize.width);
                reqBody.shapedetails['height'] = pixelsToPct(drawnShape.attrs.height, stageSize.height);
                if (reqBody.shapedetails.width === 0 || reqBody.shapedetails.height === 0) {
                    drawnShape.destroy();
                    return Promise.reject('Grid needs to be at least one grid square in size');
                }
                break;
            default:
                drawnShape.destroy();
                return Promise.reject('Unknown shape type');
        }
        try {
            const resp = await fetch(ENDPOINT + `/shape/` + props.sid, {
                method: 'PUT',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                },
                body: JSON.stringify(reqBody)
            })
            if (!resp.ok) {
                return Promise.reject('Error (' + resp.status + ') occurred')
            }
            const result = await resp.json();
            if (result.id > 0) {
                try {
                    drawnShape.setAttr("dbId", result.id);
                } catch (error) {
                    return Promise.reject('Could not save shape to database')
                }
            } else {
                return Promise.reject('Could not save shape to database')
            }
        } catch (error) {
            return Promise.reject(error.message);
        }
    }
    
    /**
     * Async function to do the actual saving of a cloned shape
     * @param {Shape} clonedShape Clone target (Konva shape object)
     * @param {integer} dbId Database id of the clone source
     * @returns Promise
     */
    const cloneShape = async(clonedShape, dbId) => {
        let reqBody = {
            shapeId: dbId,
            x: toRelativeCoords(clonedShape.attrs.x, stageSize.width), 
            y: toRelativeCoords(clonedShape.attrs.y, stageSize.height)
        };

        try {
            const resp = await fetch(ENDPOINT + `/cloneshape/` + props.sid, {
                method: 'PUT',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                },
                body: JSON.stringify(reqBody)
            })
            if (!resp.ok) {
                return Promise.reject('Error (' + resp.status + ') occurred')
            }
            const result = await resp.json();
            if (result.id > 0) {
                try {
                    clonedShape.setAttr("dbId", result.id);
                } catch (error) {
                    return Promise.reject('Could not save shape to database')
                }
            } else {
                return Promise.reject('Could not save shape to database')
            }
        } catch (error) {
            return Promise.reject(error.message);
        }
    }
    
    const laserMove = (e) => {
        e.preventDefault();
        setPenLoc({ x: e.clientX, y: e.clientY - toolbarSize.height });
        socket.emit('laserloc', { sid: props.sid, b: currentBoard, x: (e.clientX / stageSize.width).toFixed(3), y: ((e.clientY - toolbarSize.height) / stageSize.height).toFixed(3), token: getPresenterToken(props.sid) });
    }

    // Do the necessary things when polyLine is invalid or we navigate etc while polyLine is open
    function resetPolyline() {
        if(openPolyLine.shape) {
            drawingData = []; // reset the line data
            konvaShape.current = null;
            //openPolyLine.shape.moveTo(mainLayer.current);
            //openPolyLine.shape.destroy();
            openPolyLine.shape = null;
            openPolyLine.snapped = null;
            openPolyLine.finished = null;
            drawLayer.current.destroyChildren();
            setBusyPainting(false);
            drawLayer.current.draw();
        }
    }

    function triggerPenUp(e) {
        //console.info('Triggering penUp');
        if (!e.mode) log(DEBUG_LEVELS.ERROR, 'Mode is not defined!');
        penUp(e.mode, e.event); // Event needs to be tagged with mode as a parameter
    }

    function penDown(mode, strokeWidthPx, e) {
        e.preventDefault(); // Prevent mouse event from being called also
        log(DEBUG_LEVELS.DEV, 'Pen down with '+ e.pointerType);
        if(mode !== 'Polyline') {
            if(konvaShape.current) {
                // Check if the shape is on the draw layer (actively being drawn)
                // If it's not on drawLayer, it's a stale reference and should be cleared
                const isOnDrawLayer = konvaShape.current.getLayer() === drawLayer.current;
                if(!isOnDrawLayer) {
                    log(DEBUG_LEVELS.DEBUG, 'Clearing stale shape reference not on draw layer');
                    konvaShape.current = null;
                    drawingPointer = null;
                } else {
                    // Shape is being actively drawn - check if it's from a different pointer
                    const pointerWeStartedShapeWith = konvaShape.current.getAttr('pointerId');
                    if(pointerWeStartedShapeWith !== e.pointerId) {
                        log(DEBUG_LEVELS.DEBUG, 'shape has pointerId ' + pointerWeStartedShapeWith + ', this is ' + e.pointerId + ' - different pointer, ignoring');
                        return;
                    }
                }
            }
            if(drawingPointer && drawingPointer !== e.pointerId) {
                log(DEBUG_LEVELS.DEBUG, 'Note: Already drawing with pointer id ' + drawingPointer + ', this is ' + e.pointerId);
                return; // return if already drawing with a different pointer
            }
        }

        // Ignore all but the primary pointer in case of multi-touching
        if(!e.isPrimary && e.pointerType === 'touch') return;

        // A quick menu for single finger touch when in pen mode
        if(!ui.mouse && e.pointerType === 'touch') {
            if(!ui.complex) return;
            // Clear any existing drawing state to prevent stale pointerId issues
            konvaShape.current = null;
            drawingPointer = null;
            setFingerMenu({
                position: { x: e.clientX, y: e.clientY },
                target: e.target,
                options: Object.values(TOOLS).map((t) => ({id: t.name, title: t.label}))
            });
            return;
        }
        if(!stroke.enabled && !fill.enabled) {
            log(DEBUG_LEVELS.ERROR, 'Both the line and fill are disabled! Please enable at least one to be able to draw!');
            return;
        }
        if(e.pointerType === 'pen') {
            swipeOngoing = false;
            setSwipeStart(false);
            swipeRef.current = false;
        }

        if(abortControllerRef.current) return; // we are fetching new board data from backend
        
        if(swipeOngoing) return;

        // Capture all subsequent events from this pointerId as if they were done on our stage
        // even if we are outside of it (like on top of a menu) !!! important !!!
        // (not with polylines, or we are not able to snap to circles during penMove)
        if(mode !== 'Polyline') {
            //console.info("setPointerCapture for id",e.pointerId,", mode",mode);
            //stageEl.current.setPointerCapture(e.pointerId);
            drawingPointer = e.pointerId;
        } else {
            // For polylines, set the drawing pointer so penMove can track the line
            drawingPointer = e.pointerId;
            // Don't initialize drawingData if we are in the process of making a polyline
            if(!openPolyLine.shape) {
                log(DEBUG_LEVELS.DEV, 'Initializing drawingData');
                drawingData = [];
            }
        }

        let pos = stageEl.current.getPointerPosition();
        let points;
        if(mode !== 'Line' && boardSettings.settings?.grid?.snap) {
            points = getSnappedCoordinates(Math.round(pos.x), Math.round(pos.y));
        } else {
            points = [Math.round(pos.x), Math.round(pos.y)];
        }

        // Prevent wipe-colored fill showing up as black when stroke is not set to wipe
        let ignoreWipeFill = (fill.color === 'wipe' && stroke.color !== 'wipe');

        setBusyPainting(true);

        switch(mode) {
            case 'Polyline':
                // If we have a polyline open, we don't want to create a new Konva shape
                // Just log and continue - penUp will handle adding the point
                if(openPolyLine.shape) {
                    log(DEBUG_LEVELS.DEV, 'Polyline already open, setting up for intermediate point');
                    // Ensure konvaShape.current points to the open polyline
                    konvaShape.current = openPolyLine.shape;
                    // Keep rendered points in sync with committed DB points.
                    // A previous interaction may have left a transient preview point.
                    const committedLen = drawingData.length * 2;
                    let existingPoints = konvaShape.current.points();
                    if(existingPoints.length > committedLen) {
                        konvaShape.current.points(existingPoints.slice(0, committedLen));
                        existingPoints = konvaShape.current.points();
                    }
                    // Start exactly one preview point for this interaction.
                    // penMove will update this endpoint while dragging; on click-only it remains as-is.
                    konvaShape.current.points(existingPoints.concat([
                        points[0] - konvaShape.current.x(),
                        points[1] - konvaShape.current.y()
                    ]));
                    // Don't return - let the function continue so event listeners are properly set
                    break;
                }
                // Continue to line part if polyline is not open (we are just starting the line)
            case 'Line':
                konvaShape.current = new Konva.Line({
                    name: (mode),
                    bezier: lineProperties.bezier,
                    tension: lineProperties.bezier ? Number(lineProperties.lineTension) : 0,
                    // As we draw onto an empty layer, we cannot use gco for wipe at this point
                    stroke: (stroke.color === "wipe") ? boardSettings.color : stroke.color,
                    strokeEnabled: stroke.enabled,
                    strokeWidth: strokeWidthPx,
                    hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                    //globalCompositeOperation: (stroke.color === 'wipe' ? 'destination-out' : 'source-over'),
                    x: points[0],
                    y: points[1],
                    points: [0, 0],
                    lineCap: 'round',
                    lineJoin: 'round',
                    fill: fill.color,
                    fillEnabled: ignoreWipeFill ? false : fill.enabled ? true : false,
                    closed: ignoreWipeFill ? false : fill.enabled ? true : false,
                    shadowForStrokeEnabled: false,
                    perfectDrawEnabled: false,
                    strokeScaleEnabled: false // Needed for cleaner resizing
                });
                konvaShape.current.setAttr('sentLength', 0);
                break;
            case 'Arrow':
                konvaShape.current = new Konva.Arrow({
                    name: (mode),
                    // As we draw onto an empty layer, we cannot use gco for wipe at this point
                    stroke: (stroke.color === "wipe") ? boardSettings.color : stroke.color,
                    strokeEnabled: stroke.enabled,
                    strokeWidth: strokeWidthPx,
                    hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                    //globalCompositeOperation: (stroke.color === 'wipe' ? 'destination-out' : 'source-over'),
                    x: points[0],
                    y: points[1],
                    points: [0, 0],
                    lineCap: 'round',
                    lineJoin: 'round',
                    fill: stroke.color,//fill.color,
                    fillEnabled: true,//ignoreWipeFill ? false : fill.enabled ? true : false,
                    shadowForStrokeEnabled: false,
                    perfectDrawEnabled: false,
                    pointerLength: (strokeWidthPx + 2) * 2,
                    pointerWidth: (strokeWidthPx + 2) * 2,
                });
                break;
            case 'Grid':
                konvaShape.current = new Konva.Shape({
                    name: (mode),
                    x: points[0],
                    y: points[1],
                    width: 0,
                    height: 0,
                    hspacing: gridBlockSize?.x ?? 0,
                    vspacing: gridBlockSize?.y ?? 0,
                    sceneFunc: makeKonvaGrid,
                    fill: fill.color,
                    fillEnabled: ignoreWipeFill ? false : fill.enabled ? true : false,
                    stroke: stroke.color,
                    strokeWidth: strokeWidthPx * 0.5,
                    hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                    lineCap: 'round',
                    lineJoin: 'round'
                  });
                break;
            case 'Rect':
                konvaShape.current = new Konva.Rect({
                    name: 'Rect',
                    // As we draw onto an empty layer, we cannot use gco for wipe at this point
                    stroke: (stroke.color === "wipe") ? boardSettings.color : stroke.color,
                    strokeEnabled: stroke.enabled,
                    strokeWidth: strokeWidthPx,
                    hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                    //globalCompositeOperation: (stroke.color === 'wipe' ? 'destination-out' : 'source-over'),
                    x: points[0],
                    y: points[1],
                    width: 0,
                    height: 0,
                    fill: fill.color,
                    fillEnabled: ignoreWipeFill ? false : fill.enabled ? true : false,
                    shadowForStrokeEnabled: false,
                    perfectDrawEnabled: false
                });
                break;
            case 'Ellipse':
                konvaShape.current = new Konva.Ellipse({
                    name: 'Ellipse',
                    // As we draw onto an empty layer, we cannot use gco for wipe at this point
                    stroke: (stroke.color === "wipe") ? boardSettings.color : stroke.color,
                    strokeEnabled: stroke.enabled,
                    strokeWidth: strokeWidthPx,
                    hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                    //globalCompositeOperation: (stroke.color === 'wipe' ? 'destination-out' : 'source-over'),
                    x: points[0],
                    y: points[1],
                    radiusX: 0,
                    radiusY: 0,
                    fill: fill.color,
                    fillEnabled: ignoreWipeFill ? false : fill.enabled ? true : false,
                    shadowForStrokeEnabled: false,
                    perfectDrawEnabled: false
                });
                // Remember the position we started to draw an ellipse
                konvaShape.current.setAttr('origin', points);
                break;
            default:
                break;
        }
        // If drawing, use another layer. TODO: Check if it can be done with wipe
        //drawLayer.add(konvaShape.current);
        // Only add shape to layer if we just created it (not for polyline intermediate points)
        if(konvaShape.current && !openPolyLine.shape) {
            drawLayer.current.add(konvaShape.current); // Definitely need to draw on separate layer if there's a lot of stuff !!!
            const shapeStartTime = Date.now();
            konvaShape.current.setAttr("startTime", shapeStartTime);
            konvaShape.current.setAttr("boardId", currentBoard);
            konvaShape.current.setAttr("pointerId",e.pointerId);
        }
        if(mode === 'Line') {
            if(lineProperties.showPoints) emphasizePoint(konvaShape.current.x(), konvaShape.current.y());
            drawingData.push([0, 0, 0]);
        }
        // If the pointer leaves stage before we have a pointerup, we want to end drawing immediately
        // (unless in polyline mode, in which case we don't care)
        if(mode !== 'Polyline') {
            document.addEventListener("pointerleave", (event) => triggerPenUp({ mode, event }), { once: true, capture: true });
        } else if(!openPolyLine.shape) {
            // Only set up polyline on initial creation, not for intermediate points
            //konvaShape.current.listening(false);
            openPolyLine.shape = konvaShape.current;
            //openPolyLine.snapped = [points[0],points[1],Date.now()];
            drawingData.push([0, 0, 0]);
            // Do this here so the circle ends up on top of Polyline
            emphasizePoint(points[0], points[1], true, true, true);
        }
    }

    function penMove(e) {
        e.preventDefault();

        if(!e.isPrimary && e.pointerType === 'touch') return; // Ignore others than the primary pointer

        // Even if not drawing, we need to update Konva cursor location when "use mouse" is set
        if(drawingPointer === null && !konvaShape.current) {
            if(ui.mouse || fill.color === 'wipe' || stroke.color === 'wipe') {
                setPenLoc({ x: e.clientX, y: e.clientY - toolbarSize.height });
            }
            return;
        }

        // We can only draw a shape using the same pointer that started it, unless
        // it is a Polyline
        if(konvaShape.current && !openPolyLine.shape) {
            // Check if the shape is still on the draw layer (actively being drawn)
            const isOnDrawLayer = konvaShape.current.getLayer() === drawLayer.current;
            if(!isOnDrawLayer) {
                log(DEBUG_LEVELS.DEBUG, 'penMove: Clearing stale shape reference not on draw layer');
                konvaShape.current = null;
                drawingPointer = null;
                return;
            }

            const pointerWeStartedShapeWith = konvaShape.current.getAttr('pointerId');
            if(pointerWeStartedShapeWith !== e.pointerId) {
                log(DEBUG_LEVELS.DEBUG, 'Wrong pointerId; should be ' + pointerWeStartedShapeWith + ' this is ' + e.pointerId + ' at ' + e.clientX + ',' + e.clientY);
                return;
            }
        } else if(!konvaShape.current) return; // prevent accessing null shape object

        if(fill.color === 'wipe' || stroke.color === 'wipe') {
            setPenLoc({ x: e.clientX, y: e.clientY - toolbarSize.height });
        }

        switch(konvaShape.current.attrs.name) {
            case 'Line':
                const pointX = Math.round(e.clientX) - konvaShape.current.x();
                const pointY = Math.round(e.clientY - toolbarSize.height) - konvaShape.current.y();
                const pointTime = Date.now() - konvaShape.current.attrs.startTime;
                // points saved to db are relative to starting point and stage size, 5 decimals max
                const newScaledX = toRelativeCoords(pointX, stageSize.width);
                const newScaledY = toRelativeCoords(pointY, stageSize.height);
                const previous = drawingData.length - 1;
                if(drawingData[previous] !== undefined) {
                    const dist = pointsDistance(drawingData[previous][1], drawingData[previous][2], newScaledX, newScaledY);
                    if(pointTime - drawingData[previous][0] >= lineProperties.pointsThresholdMs && dist > lineProperties.distThreshold) {
                        //console.log(dist + ' (' + drawingData[previous][1] + ',' + drawingData[previous][2] + '), (' + newScaledX + ',' + newScaledY + ')');
                        drawingData.push([pointTime, newScaledX, newScaledY]); // DB line we save and show for viewers
                        const dLen = drawingData.length;
                        if(dLen > (konvaShape.current.getAttr('sentLength') + 50)) {
                            socket.emit('draw_partial_shape',{ 
                                shapetype: 'Line', 
                                shapeid: 0, 
                                stroke: konvaShape.current.stroke(), 
                                fill: konvaShape.current.fill(), 
                                starttime: konvaShape.current.getAttr("startTime").toString(), 
                                x: toRelativeCoords(konvaShape.current.x(), stageSize.width).toString(),
                                y: toRelativeCoords(konvaShape.current.y(), stageSize.height).toString(),
                                boardid: currentBoard, 
                                shapedetails: {
                                    strokeWidth: pixelsToPct(konvaShape.current.strokeWidth(), stageSize.width),
                                    strokeEnabled: konvaShape.current.strokeEnabled() ? true : false,
                                    bezier: konvaShape.current.bezier() ? true : false,
                                    closed: konvaShape.current.closed() ? true : false,
                                    tension: konvaShape.current.tension(),
                                    fillEnabled: konvaShape.current.fillEnabled() ? true : false,
                                }, 
                                shapedata: drawingData, 
                                sid: props.sid, 
                                token: getPresenterToken(props.sid)
                            });
                            konvaShape.current.setAttr('sentLength',dLen);
                        }
                        if(lineProperties.showPoints) emphasizePoint(konvaShape.current.attrs.x + pointX, konvaShape.current.attrs.y + pointY);
                        const newPoints = konvaShape.current.points().concat(pointX, pointY);
                        //console.info('added points',pointX,', ',pointY,'to line from pointer',e.pointerId);
                        konvaShape.current.points(newPoints);
                        if(ui.showPps) pointsTotal.current += 1;
                    }
                }
                break;
            case 'Polyline':
                if(!openPolyLine.shape) return;
                let newX, newY;
                if(boardSettings.settings.grid.snap) {
                    [newX, newY] = getSnappedCoordinates(e.clientX, e.clientY - toolbarSize.height);
                } else {
                    newX = Math.round(e.clientX);
                    newY = Math.round(e.clientY - toolbarSize.height);
                }

                if(!openPolyLine.finished) {
                    if(konvaShape.current.points().length <= drawingData.length * 2) {
                        // We have started a new polyline
                        let newPoints = konvaShape.current.points();
                        const addPoints = [newX - konvaShape.current.x(), newY - konvaShape.current.y()];
                        konvaShape.current.points(newPoints.concat(addPoints));
                        //console.info('penMove added point:',konvaShape.current.points());
                    } else {
                        // We are moving the last point of the polyline
                        const X = openPolyLine.snapped ? openPolyLine.snapped.x() - konvaShape.current.x() : newX - konvaShape.current.x();
                        const Y = openPolyLine.snapped ? openPolyLine.snapped.y() - konvaShape.current.y() : newY - konvaShape.current.y();
                        let existingPoints = konvaShape.current.points().slice(0, -2);
                        konvaShape.current.points(existingPoints.concat([X, Y]));
                    }
                }
                break;
            case 'Arrow':
                let endX, endY;

                if(boardSettings.settings.grid.snap) {
                    [endX, endY] = getSnappedCoordinates(e.clientX - konvaShape.current.x(), (e.clientY - toolbarSize.height) - konvaShape.current.y());
                } else {
                    endX = Math.round(e.clientX) - konvaShape.current.x();
                    endY = Math.round(e.clientY - toolbarSize.height) - konvaShape.current.y();
                }
                konvaShape.current.points([0,0,endX,endY]);
                break;
            case 'Grid':
                let cWidth, cHeight;
                if(boardSettings.settings.grid.snap) {
                    [cWidth, cHeight] = getSnappedCoordinates(e.clientX - konvaShape.current.x(), (e.clientY - toolbarSize.height) - konvaShape.current.y());
                } else {
                    cWidth = Math.round(e.clientX) - konvaShape.current.x();
                    cHeight = Math.round(e.clientY - toolbarSize.height) - konvaShape.current.y();
                }
                //log(DEBUG_LEVELS.DEV, 'Grid size changed to x: ' + konvaShape.current.width() + ' y: ' + konvaShape.current.height() );
                konvaShape.current.width(cWidth);
                konvaShape.current.height(cHeight);
                break;
            case 'Rect':
                let rWidth, rHeight;
                if(boardSettings.settings.grid.snap) {
                    [rWidth, rHeight] = getSnappedCoordinates(e.clientX - konvaShape.current.x(), (e.clientY - toolbarSize.height) - konvaShape.current.y());
                } else {
                    rWidth = Math.round(e.clientX) - konvaShape.current.x();
                    rHeight = Math.round(e.clientY - toolbarSize.height) - konvaShape.current.y();
                }
                konvaShape.current.width(rWidth);
                konvaShape.current.height(rHeight);
                //log(DEBUG_LEVELS.DEV, 'Rect size changed to x: ' + konvaShape.current.width() + ' y: ' + konvaShape.current.height() );
                //konvaShape.current.draw();
                break;
            case 'Ellipse':
                let radiusX, radiusY;
                if(boardSettings.settings.grid.snap) {
                    [radiusX, radiusY] = getSnappedCoordinates(
                            e.clientX - konvaShape.current.attrs.origin[0], 
                            (e.clientY - toolbarSize.height) - konvaShape.current.attrs.origin[1],
                            true
                        );
                } else {
                    radiusX = Math.round(((e.clientX) - konvaShape.current.attrs.origin[0]) * SQRT2_DIV2);
                    radiusY = Math.round(((e.clientY - toolbarSize.height) - konvaShape.current.attrs.origin[1]) * SQRT2_DIV2);
                }
                konvaShape.current.radiusX(Math.abs(radiusX * SQRT2_DIV2));
                konvaShape.current.radiusY(Math.abs(radiusY * SQRT2_DIV2));
                konvaShape.current.x(konvaShape.current.attrs.origin[0] + (radiusX * SQRT2_DIV2));
                konvaShape.current.y(konvaShape.current.attrs.origin[1] + (radiusY * SQRT2_DIV2));
                log(DEBUG_LEVELS.DEV, 'Ellipse x: ' + konvaShape.current.x() + ' y: ' + konvaShape.current.y() + ' xR: ' + konvaShape.current.radiusX() + ' yR: ' + konvaShape.current.radiusY());
                //konvaShape.current.draw();
                break;
            default:
                break;
        }
    }

    function penUp(mode, e) {
        e.preventDefault(); // Prevent mouse event from being called also
        if(swipeOngoing && e.pointerType === 'pen') {
            swipeOngoing = false;
            setSwipeStart(false);
            swipeRef.current = false;
        }
        if(!e.isPrimary && e.pointerType === 'touch') return; // Ignore others than the primary pointer
        
        if(konvaShape.current && !openPolyLine.shape) {
            const pointerWeStartedShapeWith = konvaShape.current.getAttr('pointerId');
            if(pointerWeStartedShapeWith !== e.pointerId) {
                log(DEBUG_LEVELS.DEBUG, 'Wrong pointerId; should be' + pointerWeStartedShapeWith + 'this is' + e.pointerId + 'at' + e.clientX + ',' + e.clientY);
                return;
            }
        }

        // If the konvaShape is undefined at this point, it usually means we have drawn a line (using a mouse)
        // outside the window, and returned to drawing area while still holding the mouse button down.
        // In this case, we have already saved the resulting shape, and can just return
        if(!konvaShape.current || typeof konvaShape.current === 'undefined') {
            return;
        }

        // We need to clear the event listener that penDown created if it was not triggered yet
        if(mode !== 'Polyline') {
            document.removeEventListener("pointerleave", triggerPenUp);
        }

        // Release the pointer so we can begin a new line while the old one is saved to DB
        drawingPointer = null;

        if(!konvaShape.current.attrs) {
            log(DEBUG_LEVELS.ERROR, 'penUp: Shape has no attributes');
            return;
        }

        // save pointer to konvaShape.current as it may change while we start creating a new shape
        let drawnShape = konvaShape.current;

        if(mode === 'Polyline') {
            log(DEBUG_LEVELS.DEV, 'penUp: Polyline mode, processing point');
            /**
             * Polylines have two data series:
             * 1. drawnShape.points() is what is actually drawn on presenter's screen (but no timestamps)
             * 2. drawingData is what is saved in the database (including timestamps)
             * 
             * When drawing, drawingData is the "master" data, and drawnShape.points() are adjusted accordingly.
             * 
             * We also have a support global data structure openPolyLine with members:
             * - shape (the polyLine shape itself, which is being drawn)
             * - snapped (the circle object on which the pointer is "snapped" in, if any)
             * - finished (boolean which tells if we are finished with the polyLine)
             * 
             * We call the polyLine finished, when we have a pointerUp event inside a helper circle
             * that can has a 'canSnap' boolean true, AND we have more than one point in drawnShape.points()
             * 
             * If the line is not finished, and the latest pointerUp resulted in a point too close to the
             * previous point, we remove the point from the drawnShape and wait for another one further away
             * or snapped to a helper circle.
             */
            const pointTime = Date.now() - drawnShape.attrs.startTime;
            // Minimum distance between two polyline points, relative to stage width
            // emphasizePoint size is 0.007 * stageSize.width (times 1.5 on hover)
            // we want to make sure we are past that distance
            const distanceThreshold = Math.max(0.02, lineProperties.distThreshold);

            // Initialize newPoints with the values already in our polyline (Konva Line) object
            let newPoints = drawnShape.points();
            let len = newPoints.length;

            log(DEBUG_LEVELS.DEV, 'penUp: points array length=' + len + ', points=' + JSON.stringify(newPoints), true);

            // Store coordinates of the last point in the polyline after the final penMove applied
            let lastX = newPoints[len - 2];
            let lastY = newPoints[len - 1];

            // Sanity check that we have added the 0,0 as first coordinates
            if(newPoints[0] !== 0 || newPoints[1] !== 0) {
                log(DEBUG_LEVELS.ERROR, 'Invalid polyline! First point is ' + newPoints[0] + ',' + newPoints[1], true);
                resetPolyline();
                return;
            }

            log(DEBUG_LEVELS.DEV, 'penUp: passed (0,0) check, len=' + len + ', pointerType=' + e.pointerType, true);

            // Hold the pixel coordinates of active pointer within our canvas
            let newX, newY;
            let relX, relY;

            // If we are snapped to a previous Polyline point, replace the final coordinates with those from the Circle
            // For pen/stylus input that may not trigger hover events, also check if click is within any snappable circle
            if(len > 2 && (openPolyLine.snapped && openPolyLine.snapped.className === 'Circle')) {
                log(DEBUG_LEVELS.DEV, 'penUp: entering branch 1 (snapped from hover)', true);
                newX = openPolyLine.snapped.x();
                newY = openPolyLine.snapped.y();
                log(DEBUG_LEVELS.DEV, 'penUp snapped final coords (from hover/pointerdown)');
                openPolyLine.finished = true;
            } else if(len > 2 && !openPolyLine.snapped && e.pointerType === 'pen') {
                log(DEBUG_LEVELS.DEV, 'penUp: entering branch 2 (pen proximity check)', true);
                // Pen-specific proximity check (hover events don't work reliably with pens)
                // Check proximity to ANY circle to close the polyline (like mouse hover does)
                const clickX = e.clientX;
                const clickY = e.clientY - toolbarSize.height;

                log(DEBUG_LEVELS.DEV, 'penUp: clickX=' + clickX + ', clickY=' + clickY, true);
                
                // Find all snappable circles
                try {
                    var circles = drawLayer.current.find('Circle').filter(c => c.getAttr('canSnap') === true);
                    log(DEBUG_LEVELS.DEV, 'penUp: found ' + circles.length + ' snappable circles', true);
                } catch(err) {
                    log(DEBUG_LEVELS.ERROR, 'penUp: error finding circles: ' + err.message, true);
                    newX = lastX + drawnShape.x();
                    newY = lastY + drawnShape.y();
                }

                if(circles && circles.length > 0) {
                    // Find the closest circle within snap range
                    let closestCircle = null;
                    let minDist = Infinity;
                    const snapRadius = stageSize.width * 0.007 * 1.2; // Slightly larger than base for easier snapping

                    for(const circle of circles) {
                        const circleX = circle.x();
                        const circleY = circle.y();
                        const dist = Math.sqrt(Math.pow(clickX - circleX, 2) + Math.pow(clickY - circleY, 2));

                        if(dist < snapRadius && dist < minDist) {
                            minDist = dist;
                            closestCircle = circle;
                        }
                    }

                    log(DEBUG_LEVELS.DEV, 'penUp: finished circle loop, closestCircle=' + (closestCircle ? 'found' : 'null'), true);

                    if(closestCircle) {
                        newX = closestCircle.x();
                        newY = closestCircle.y();
                        openPolyLine.snapped = closestCircle;
                        openPolyLine.finished = true;
                        log(DEBUG_LEVELS.DEV, 'penUp snapped final coords (pen proximity check)', true);
                    } else {
                        // Not close to any circle - create intermediate point
                        log(DEBUG_LEVELS.DEV, 'penUp: branch 2 - not close to circle, creating intermediate', true);
                        newX = lastX + drawnShape.x();
                        newY = lastY + drawnShape.y();
                    }
                } else {
                    // No circles found or error occurred
                    log(DEBUG_LEVELS.DEV, 'penUp: no circles to snap to, creating intermediate', true);
                    newX = lastX + drawnShape.x();
                    newY = lastY + drawnShape.y();
                }
            } else {
                log(DEBUG_LEVELS.DEV, 'penUp: entering branch 3 (else - normal intermediate point)', true);
                // Else we create an intermediate point, and we should already have snapped the
                // coordinates to the grid if needed
                newX = lastX + drawnShape.x();
                newY = lastY + drawnShape.y();
            }

            // If we snapped to a circle, update the polyline's last point to use the snapped coordinates
            if(openPolyLine.finished && (newX !== lastX || newY !== lastY)) {
                // Update the last point in the polyline to the snapped position
                let updatedPoints = newPoints.slice(0, -2).concat([newX - drawnShape.x(), newY - drawnShape.y()]);
                drawnShape.points(updatedPoints);
                lastX = newX - drawnShape.x();
                lastY = newY - drawnShape.y();
            }

            //Calculate the screen-normalized distance from previous Polyline point
            const prevIdx = drawingData.length - 1;
            let dist = 0;

            relX = toRelativeCoords(lastX, stageSize.width); 
            relY = toRelativeCoords(lastY, stageSize.height);

            log(DEBUG_LEVELS.DEV, 'penUp: lastX=' + lastX + ', lastY=' + lastY + ', relX=' + relX + ', relY=' + relY + ', prevIdx=' + prevIdx + ', drawingData.length=' + drawingData.length, true);

            // Calculate distance to previous point, or starting point in case we only have one point
            if(prevIdx > 0) {
                dist = pointsDistance(drawingData[prevIdx][1], drawingData[prevIdx][2], relX, relY);
            } else {
                dist = pointsDistance(0, 0, relX, relY);
            }

            log(DEBUG_LEVELS.DEV, 'penUp: dist=' + dist + ', distanceThreshold=' + distanceThreshold + ', openPolyLine.finished=' + openPolyLine.finished, true);

            // If distance from previous point is not enough, and line is not finished, undo the last point
            if(dist < distanceThreshold && !openPolyLine.finished) {
                if(len > (drawingData.length * 2)) {
                    let previousPoints = newPoints.slice(0, -2);
                    drawnShape.points(previousPoints); // no need to update len as we return after this
                }
                return;
            }

            if (dist >= distanceThreshold && !openPolyLine.finished) {
                // The point coordinates are relative to the starting point of the Polyline
                // so we need to add the starting point coordinates to the relative ones
                emphasizePoint(lastX + drawnShape.x(), lastY + drawnShape.y(), true, true, false);
                log(DEBUG_LEVELS.DEV, 'Created intermediate point for polyline, length = ' + len / 2, true);
            } else if (openPolyLine.finished) {
                // If we are at third point at least (each point is 2 coordinates), it's ok to finish the polyline
                if (len > 4) {
                    log(DEBUG_LEVELS.DEV, 'Polyline finished.', true);
                } else {
                    // We have only one previous point in the polyline and snapped to it
                    // so issue a warning and remove the polyline (just one point)
                    resetPolyline();
                    log(DEBUG_LEVELS.INFO, 'Polyline needs at least two distinct points.', true);
                    return;
                }
            }

            // Proceed to create the new point in database
            drawingData.push([
                pointTime, 
                toRelativeCoords(lastX, stageSize.width), 
                toRelativeCoords(lastY, stageSize.height)
            ]);

            const dataToSave = drawingData; // take a snapshot of the data points so we can continue drawing

            // If we already have dbId, it means we have saved the shape to db
            // and can just update points. Otherwise, we need to wait for dbId
            const hasDbId = openPolyLine.shape?.attrs?.dbId;
            log(DEBUG_LEVELS.DEV, 'penUp: hasDbId=' + hasDbId + ', openPolyLine.finished=' + openPolyLine.finished, true);

            if(hasDbId) {
                //console.info('calling handleShapeUpdate');
                handleShapeUpdate(drawnShape, {shapedata: drawingData})
                .then(() => {
                    log(DEBUG_LEVELS.DEV, 'handleShapeUpdate success, openPolyLine.finished=' + openPolyLine.finished, true);

                    // If the polyline is finished, move it to permanent layer and cleanup
                    if(openPolyLine.finished) {
                        drawnShape.moveTo(mainLayer.current);
                        if(drawnShape.fillEnabled() && shouldCreateOutlineClones) {
                            const outlineClone = createOutlineClone(drawnShape);
                            if(outlineClone) {
                                drawnShape.listening(false);
                                mainLayer.current.add(outlineClone);
                            }
                        }
                        log(DEBUG_LEVELS.DEV, 'Polyline finished with dbId; destroying children!', true);
                        resetPolyline();
                    } else {
                        // Just an intermediate point, reset snapped for next point
                        openPolyLine.snapped = null;
                        setBusyPainting(false);
                    }
                }, reason => {
                    log(DEBUG_LEVELS.DEBUG, 'Error on penUp (already have a shape): ' + reason, true);
                    resetPolyline();
                })
            } else {
                if(len > 2) {
                    if(stroke.color === 'wipe') {
                        drawnShape.attrs.stroke = 'wipe';
                        drawnShape.attrs.globalCompositeOperation = 'destination-out';
                    }
                    // We have no dbId, so let's do the initial save to db.
                    saveShape(drawnShape, dataToSave)
                    .then(() => {
                        log(DEBUG_LEVELS.DEV, 'Saved initial Polyline, finished=' + openPolyLine.finished, true);

                        // If this was the finishing point (snapped to a circle), complete the polyline
                        if(openPolyLine.finished) {
                            drawnShape.moveTo(mainLayer.current);
                            if(drawnShape.fillEnabled() && shouldCreateOutlineClones) {
                                const outlineClone = createOutlineClone(drawnShape);
                                if(outlineClone) {
                                    drawnShape.listening(false);
                                    mainLayer.current.add(outlineClone);
                                }
                            }
                            log(DEBUG_LEVELS.DEV, 'Polyline finished on first save; destroying children!', true);
                            resetPolyline();
                        } else {
                            // Just an intermediate point, reset snapped for next point
                            openPolyLine.snapped = null;
                            setBusyPainting(false);
                        }
                    }, reason => {
                        log(DEBUG_LEVELS.ERROR, 'Error on penUp (no shape yet): ' + reason, true);
                        resetPolyline();
                    }) 
                }
            }
            return;
        } else {    
            // Not Polyline
            const dLen = drawingData.length;
            //console.info(drawingData);

            // Only one Polyline point or at most two Line points recorded; save result as a Dot
            if(mode === 'Line' && (dLen < 3)) {
                log(DEBUG_LEVELS.DEV, 'Pixel radius is ' + (drawnShape.attrs.strokeWidth * 0.5));

                let newDot;
                try {
                    newDot = new Konva.Circle({
                      name: 'Dot',
                      radius: Math.max(drawnShape.attrs.strokeWidth * 0.5, 0.8), // need sensible minimum radius or deleting won't work
                      stroke: drawnShape.attrs.stroke,
                      strokeWidth: 1,
                      hitStrokeWidth: Math.max(drawnShape.attrs.strokeWidth * 0.5, HIT_STROKE_WIDTH),
                      globalCompositeOperation: drawnShape.attrs.globalCompositeOperation,
                      strokeEnabled: false,
                      fillEnabled: true,
                      fill: drawnShape.attrs.stroke,
                      x: drawnShape.attrs.x,
                      y: drawnShape.attrs.y
                    });
                
                    newDot.setAttr("startTime", drawnShape.attrs.startTime);
                    newDot.setAttr("boardId", drawnShape.attrs.boardId);
                
                } catch (error) {
                    log(DEBUG_LEVELS.ERROR, 'Error creating dot: ' + error);
                    return;
                }

                if(newDot) {
                    drawLayer.current.add(newDot);
                } else {
                    log(DEBUG_LEVELS.ERROR, 'Error creating a new dot');
                    return;
                }
                // Destroy the original line as we replace it with the dot at this point
                drawnShape.destroy();

                // Reset the konvaShape.current so we can change from pen to finger if desired
                // (allowed pointerId is stored in shape metadata)
                konvaShape.current = null;

                // Clear drawingData of old points
                drawingData = [];

                saveShape(newDot, null)
                    .then(() => {
                        // Move finished line to main layer and destroy everything in the drawing layer
                        newDot.moveTo(mainLayer.current);
                        log(DEBUG_LEVELS.DEV, 'Moved dot id ' + newDot.attrs.dbId + '. Now ' + drawLayer.current.children.length + ' shapes on drawLayer)');
                        // Need to create outline clone for Dots, too, so deleting works before page reload
                        const outlineClone = createOutlineClone(newDot);
                        if(outlineClone) {
                            newDot.listening(false);
                            mainLayer.current.add(outlineClone);
                        }
                        //drawLayer.current.destroyChildren(); // cannot destroy here to avoid shapes flickering on/off
                        setBusyPainting(false);
                        return;
                        //if(lineProperties.showPoints) drawLayer.current.find().forEach((c) => c.destroy());
                    }, reason => {
                        drawLayer.current.destroyChildren();
                        setBusyPainting(false);
                        log(DEBUG_LEVELS.ERROR, 'Error in saveShape: ' + reason, true);
                        return;
                    })
            } else {
                // We have more than two Line points
                const dataToSave = drawingData; // take a snapshot of the data points so we can continue drawing

                // Reset the konvaShape.current so we can change from pen to finger if desired
                // (allowed pointerId is stored in shape metadata)
                konvaShape.current = null;

                // Clear drawingData of old points
                drawingData = [];
                // Reset the global indicating existence of an open polyLine
                //TODO?: if(mode === 'Polyline') openPolyLine = {firstCoords: null, lastCoords: null, snapped: null};
                if(stroke.color === 'wipe') {
                    drawnShape.attrs.stroke = 'wipe';
                    drawnShape.attrs.globalCompositeOperation = 'destination-out';
                }
                saveShape(drawnShape, dataToSave)
                .then(() => {
                    // Move finished line to main layer and destroy everything in the drawing layer
                    drawnShape.moveTo(mainLayer.current);
                    if(drawnShape.fillEnabled() && shouldCreateOutlineClones) {
                        const outlineClone = createOutlineClone(drawnShape);
                        if(outlineClone) {
                            drawnShape.listening(false);
                            mainLayer.current.add(outlineClone);
                        }
                    }

                    log(DEBUG_LEVELS.DEV, 'Moved saved shape id ' + drawnShape.attrs.dbId + '. ' + drawLayer.current.children.length + ' shapes remain on drawLayer.');
                    //drawLayer.current.destroyChildren(); // cannot destroy here to avoid shapes flickering on/off
                    setBusyPainting(false);
                    
                    //if(lineProperties.showPoints) drawLayer.current.find().forEach((c) => c.destroy());
                }, reason => {
                    drawLayer.current.destroyChildren();
                    setBusyPainting(false);
                    log(DEBUG_LEVELS.ERROR, 'Error in penUp: ' + reason);
                }) 
            }
        }
    }

    const listenToShapes = (mode) => {
        log(DEBUG_LEVELS.DEV, 'listenToShapes: creating event listeners for stage id ' + stageEl.current._id);
        if(!stageEl.current) {
            log(DEBUG_LEVELS.ERROR, 'Stage not found!');
            return;
        }
        const strokeWidth = lineProperties.width;

        const strokeWidthPx = pctToPixels(strokeWidth, stageSize.width);

        // Begin new line on mousedown / touchstart
        // For Polyline, don't use 'once' so it fires for each intermediate point
        stageEl.current.addEventListener('pointerdown', (e) => penDown(mode, strokeWidthPx, e), { once: mode !== 'Polyline', passive: true });
        
        /*stage.addEventListener('pointercancel lostpointercapture', function (e) {
            if(!e.isPrimary || !drawingPointer) return;
            log(DEBUG_LEVELS.ERROR, 'canceling draw operation');
            drawingPointer = null;
            openPolyLine.firstCoords = null;
            openPolyLine.lastCoords = null;
            //setBusyPainting(false);
        }, { passive: true })*/

        // Save shape to Postgres on mouseup / touchend
        // For Polyline, don't use 'once' so it fires for each intermediate point
        stageEl.current.addEventListener('pointerup', (e) => penUp(mode, e), { once: mode !== 'Polyline', passive: false });
    
        // Add points to line on mousemove / touchmove if currently painting
        // For Polyline, don't use 'once' so it fires throughout the drawing
        stageEl.current.addEventListener('pointermove', penMove, { once: mode !== 'Polyline', passive: false });
        //console.info('listenToShapes added event listener for pointermove');
        // NOTE: We are passing the local lineStartTime here to event listener
        //stage.addEventListener('pointermove', (evt) => penMove(lineStartTime, evt), { passive: false });
        /*bgRectRef.current.on('pointerleave', function (e) {
            console.info('Pointer left element',e.evt.type,e.target);
        });*/
    }
    
    const emphasizePoint = (x, y, permanent = false, snappable = false, first = false) => {
        //console.info('emphasizing point',x,y);
        var idleColor, activeColor, firstColor;
        if(tinycolor(boardSettings.color).isDark()) {
            idleColor = '#888888';
            activeColor = '#ffffff';
            firstColor = '#f4e300';
        } else {
            idleColor = '#000000';
            activeColor = '#666666';
            firstColor = '#80b70b';
        }
        const ePoint = new Konva.Circle({
            radius: stageSize.width * 0.007,
            stroke: first ? firstColor : idleColor,
            strokeWidth: stageSize.width * 0.001,
            fillEnabled: true, // so no need to set hitStrokeWidth too high
            x: x,
            y: y
        });
        if(snappable) {
            ePoint.setAttr('canSnap', false);
            ePoint.stroke(idleColor);
            setTimeout(() => { 
                ePoint.setAttr('canSnap', true);
                ePoint.stroke(first ? firstColor : activeColor);
            }, 400);

            ePoint.on('pointerdown', function () {
                if(ePoint.getAttr('canSnap') === true) {
                    openPolyLine.snapped = ePoint;
                    ePoint.stroke(activeColor);
                }
            })

            ePoint.on('pointerenter', function () {
                ePoint.to({
                    stroke: firstColor,
                    scaleX: 1.5,
                    scaleY: 1.5,
                    duration: 0.1
                })

                if(ePoint.getAttr('canSnap') === true) {
                    openPolyLine.snapped = ePoint;
                    ePoint.stroke(first ? firstColor : activeColor);
                }
            })
            ePoint.on('pointerleave', function () {
                ePoint.to({
                    stroke: idleColor,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 0.1
                })
                openPolyLine.snapped = null;
                ePoint.setAttr('canSnap', false);
                setTimeout(() => { 
                    ePoint.setAttr('canSnap', true);
                    ePoint.stroke(first ? firstColor : activeColor);
                }, 200);
            })
        }
        drawLayer.current.add(ePoint);
        drawLayer.current.draw();

        // Points will self-destruct in 500ms if not set as permanent
        if(!permanent) setTimeout(() => {
            ePoint.off('pointerenter pointerleave pointerup pointerdown');
            ePoint.destroy();
        }, 500);
    }

    // options: skipPenUps, drawAsap
    // NOTE: Does not currently send any socket messages to viewers !!
    const playShapes = useCallback(async (socket, json, options) => {
        if(currentBoard > 0) {
            //setBusyPainting(true);
            const layer = mainLayer.current;
            if (layer === null) {
                log(DEBUG_LEVELS.ERROR, 'playShapes: layer is null!');
                //setBusyPainting(false);
                return {'error': true, 'reason': 'layer_null'};
            }
            const functionCallTime = Date.now(); // the time we called this replay function
            let currentShapeStartTime;
            let pointWaitTime;
            let lineWaitTime;
            let actualBoard;
            const layerWidth = layer.width();
            const layerHeight = layer.height();
            if (json.length) {
                let thisShape = null;
                actualBoard = json[0].boardid;
                log(DEBUG_LEVELS.DEV, 'playShapes for board ' + actualBoard + ' (currentBoard now ' + currentBoard + ')');
                const origDrawStartTime = parseInt(json[0].starttime);
                let replayTimeDiff = functionCallTime - origDrawStartTime; // how much time has passed since original drawing started
                // In case we have missing strokeWidths among shapes, add ?? 0 to avoid NaN...
                for (const shape of json) {
                    if(actualBoard !== currentBoard) {
                        log(DEBUG_LEVELS.DEBUG, 'playShapes: board changed while drawing (',actualBoard,'->', currentBoard,')!');
                        //setBusyPainting(false);
                        return {'error': true, 'reason': 'board_changed'};
                    }
                    //console.time('line');
                    const strokeWidthPx = pctToPixels(shape.shapedetails.strokeWidth, layerWidth) ?? 0;
                    switch(shape.shapetype) {
                        case 'Line':
                        case 'Polyline':
                            if(shape.shapedata) {
                                thisShape = new Konva.Line({
                                    name: (shape.shapetype),
                                    stroke: shape.stroke,
                                    strokeEnabled: shape.shapedetails.strokeEnabled,
                                    strokeWidth: strokeWidthPx ?? 0,
                                    hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                                    bezier: shape.shapedetails.bezier,
                                    tension: Number(shape.shapedetails.tension),
                                    rotation: shape.shapedetails.rotation ?? 0,
                                    scaleX: shape.shapedetails.scaleX ?? 1,
                                    scaleY: shape.shapedetails.scaleY ?? 1,
                                    // Wipes can never have fill enabled (at least for now)
                                    closed: shape.shapedetails.closed ? true : false,
                                    fillEnabled: shape.shapedetails.fillEnabled ? true : false,
                                    fill: shape.fill,
                                    globalCompositeOperation: ((shape.stroke === 'wipe' || shape.fill === 'wipe') ? 'destination-out' : 'source-over'),
                                    x: Math.round(shape.x * layerWidth),
                                    y: Math.round(shape.y * layerHeight),
                                    points: shape.shapedata.length ? [shape.shapedata[0][1] * layerWidth, shape.shapedata[0][2] * layerHeight] : [],
                                    lineCap: 'round',
                                    lineJoin: 'round',
                                    strokeScaleEnabled: false // Needed for cleaner resizing
                                });
                            } else log(DEBUG_LEVELS.DEBUG, 'Note: A line of type ' + shape.shapetype + ' has no points defined!')
                            break;
                        case 'Arrow':
                            if(shape.shapedata) {
                                // Arrow shapedata format: [[0, 0, 0], [0, rel_x_pct, rel_y_pct]]
                                let arrowPoints = [];
                                if(shape.shapedata.length === 4) {
                                    // Old format: [0, x1, y1, x2, y2] with percentage values
                                    arrowPoints = [0, 0, pctToPixels(shape.shapedata[2], layerWidth), pctToPixels(shape.shapedata[3], layerHeight)]
                                }
                                if(shape.shapedata.length === 2) {
                                    // Current format: [[0, 0, 0], [0, rel_x, rel_y]] with percentage values
                                    arrowPoints = [0, 0, pctToPixels(shape.shapedata[1][1], layerWidth), pctToPixels(shape.shapedata[1][2], layerHeight)]
                                }
                                thisShape = new Konva.Arrow({
                                    name: (shape.shapetype),
                                    stroke: shape.stroke,
                                    strokeEnabled: shape.shapedetails.strokeEnabled,
                                    strokeWidth: strokeWidthPx ?? 0,
                                    hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                                    fillEnabled: shape.shapedetails.fillEnabled ? true : false,
                                    fill: shape.fill,
                                    globalCompositeOperation: ((shape.stroke === 'wipe' || shape.fill === 'wipe') ? 'destination-out' : 'source-over'),
                                    x: Math.round(shape.x * layerWidth),
                                    y: Math.round(shape.y * layerHeight),
                                    points: arrowPoints,
                                    pointerLength: (strokeWidthPx + 2) * 2,
                                    pointerWidth: (strokeWidthPx + 2) * 2,
                                    lineCap: 'round',
                                    lineJoin: 'round'
                                });
                            } else log(DEBUG_LEVELS.DEBUG, 'Note: An arrow has no points defined!')
                            break;
                        case 'Grid':
                            thisShape = new Konva.Shape({
                                name: (shape.shapetype),
                                x: Math.round(shape.x * layerWidth),
                                y: Math.round(shape.y * layerHeight),
                                width: pctToPixels(shape.shapedetails.width, layerWidth),
                                height: pctToPixels(shape.shapedetails.height, layerHeight),
                                rotation: shape.shapedetails.rotation ?? 0,
                                hspacing: pctToPixels(shape.shapedetails.hspacing, layerWidth) ?? 0,
                                vspacing: pctToPixels(shape.shapedetails.vspacing, layerHeight) ?? 0,
                                sceneFunc: makeKonvaGrid,
                                fillEnabled: shape.shapedetails.fillEnabled ? true : false,
                                fill: shape.fill,
                                stroke: shape.stroke,
                                strokeWidth: strokeWidthPx ?? 0,
                                hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                                lineCap: 'round',
                                lineJoin: 'round'
                        });
                            break;
                        case 'Rect':
                            thisShape = new Konva.Rect({
                                name: (shape.shapetype),
                                width: pctToPixels(shape.shapedetails.width, layerWidth),
                                height: pctToPixels(shape.shapedetails.height, layerHeight),
                                rotation: shape.shapedetails.rotation ?? 0,
                                stroke: shape.stroke,
                                strokeWidth: strokeWidthPx ?? 0,
                                hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                                fillEnabled: shape.shapedetails.fillEnabled,
                                fill: shape.fill,
                                globalCompositeOperation: ((shape.stroke === 'wipe' || shape.fill === 'wipe') ? 'destination-out' : 'source-over'),
                                x: Math.round(shape.x * layerWidth),
                                y: Math.round(shape.y * layerHeight),
                            });
                            //log(DEBUG_LEVELS.DEV, 'rect, width: ' + thisShape.attrs.width + ', height: ' + thisShape.attrs.height);
                            break;
                        case 'Circle':
                        case 'Ellipse':
                            var radius = null;
                            if(shape.shapedetails.radius) radius = pctToPixels(shape.shapedetails.radius, layerWidth);
                            thisShape = new Konva.Ellipse({
                                name: (shape.shapetype),
                                radiusX: (radius ? radius : pctToPixels(shape.shapedetails.radiusX, layerWidth)),
                                radiusY: (radius ? radius : pctToPixels(shape.shapedetails.radiusY, layerHeight)),
                                rotation: shape.shapedetails.rotation ?? 0,
                                //radius: pctToPixels(shape.shapedetails.radius, layerWidth),
                                stroke: shape.stroke,
                                strokeWidth: strokeWidthPx ?? 0,
                                hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                                fillEnabled: shape.shapedetails.fillEnabled,
                                fill: shape.fill,
                                globalCompositeOperation: ((shape.stroke === 'wipe' || shape.fill === 'wipe') ? 'destination-out' : 'source-over'),
                                x: Math.round(shape.x * layerWidth),
                                y: Math.round(shape.y * layerHeight),
                            });
                            //log(DEBUG_LEVELS.DEV, 'ellipse, X radius: ' + thisShape.attrs.radiusX + ', Y radius: ' + thisShape.attrs.radiusY);
                            break;
                        case 'Dot':
                            thisShape = new Konva.Circle({
                                name: (shape.shapetype),
                                radius: pctToPixels(shape.shapedetails.radius, layerWidth),
                                stroke: shape.stroke,
                                strokeWidth: 0,
                                hitStrokeWidth: Math.max(strokeWidthPx, HIT_STROKE_WIDTH),
                                // Dot is always filled with stroke color
                                fillEnabled: true,
                                fill: shape.stroke,
                                globalCompositeOperation: ((shape.stroke === 'wipe' || shape.fill === 'wipe') ? 'destination-out' : 'source-over'),
                                x: Math.round(shape.x * layerWidth),
                                y: Math.round(shape.y * layerHeight),
                            });
                            //log(DEBUG_LEVELS.DEV, 'Dot, radius: ' + shape.shapedetails.radius + ', in pixels: ' + pctToPixels(shape.shapedetails.radius, layerWidth));
                            break;
                        default:
                            // Bail out if shape not known, but don't crash
                            log(DEBUG_LEVELS.ERROR, 'Unknown shape type found!');
                            //setBusyPainting(false);
                            return {'error': false, 'reason': 'unknown shape type'};
                    }
                    // If there was a problem with data, thisShape was not created at this point
                    if(thisShape) {
                        thisShape.setAttr("startTime", origDrawStartTime);
                        thisShape.setAttr("boardId", actualBoard);
                        thisShape.setAttr("dbId", shape.id);
        
                        if (!options.drawAsap) {
                            currentShapeStartTime = Date.now();
                            lineWaitTime = (parseInt(shape.starttime) + replayTimeDiff) - currentShapeStartTime;
                            if (!options.skipPenUps) { // draw shapes without a delay between each
                                if (lineWaitTime > 5) {
                                    await sleep(lineWaitTime - 2);
                                }
                            } else { // just draw line after line as quickly as you can
                                replayTimeDiff = replayTimeDiff - lineWaitTime;
                                lineWaitTime = 0;
                            }
                        }
        
                        if (layer === null) {
                            //setBusyPainting(false);
                            return {'error': true, 'reason': 'layer is null'};
                        } else layer.add(thisShape);
                        
                        // Arrows only have 2 points so they need no more handling
                        if(shape.shapetype !== 'Arrow' && shape.shapedata && thisShape.points) {
                            let linePoints = []; // Helper array into which we push coordinates instead of concat for better performance
                            for (const point of shape.shapedata) {
                                if (!options.drawAsap) {
                                    let newPoints = thisShape.points().concat(Math.round(point[1] * layerWidth), Math.round(point[2] * layerHeight));
                                    thisShape.points(newPoints);
                                    let currentTime = Date.now();
                                    const currentPointTimeOffset = parseInt(point[0]);
                                    pointWaitTime = currentShapeStartTime + lineWaitTime + currentPointTimeOffset - currentTime;
                                    if (pointWaitTime > 5) {
                                        await sleep(pointWaitTime - 2);
                                    }
                                    try {
                                        thisShape.draw();
                                    }
                                    catch {
                                        //setBusyPainting(false);
                                        return {'error': true, 'reason': 'got interrupted'};
                                    }
                                } else {
                                    // If drawing asap, just push the new points to temp array and move on
                                    linePoints.push(Math.round(point[1] * layerWidth), Math.round(point[2] * layerHeight));
                                }
                            }
                            if(options.drawAsap) {
                                //log(DEBUG_LEVELS.DEV, 'Instantly drawn ' + linePoints.length + ' points');
                                thisShape.points(linePoints);
                            }
                        //console.timeEnd('line');
                        }
                        
                        // If we have a filled shape, create an outline clone so we can drag over shapes on top of fills
                        if(thisShape.fillEnabled() && shouldCreateOutlineClones) {
                            const outlineClone = createOutlineClone(thisShape);
                            if(outlineClone) {
                                thisShape.listening(false);
                                layer.add(outlineClone);
                            }
                        }
                    }
                }
            }
        
            if (options.drawAsap) {
                layer.batchDraw();
            }
            //setBusyPainting(false);
            return {'error': false};
        } else {
            log(DEBUG_LEVELS.DEBUG, 'currentBoard not set, skipping playShapes');
            return {'error': false};
        }
    }, [currentBoard, shouldCreateOutlineClones]);


    /**
     * Replay shapes of a single board. This can be done either:
     * 1) In realtime: All pauses between initial drawing included.
     * 2) Skipping pauses: Any single line is drawn at the speed it was initially
     * drawn, but the next begins instantly after the previous is finished.
     * 3) Instant: Just draw everything as soon as possible, ignoring the
     * original drawing speed
     * 
     * @param {boolean} skipPenups Don't wait between consecutive shapes
     * @param {boolean} drawAsap Just draw everything instantly
     */
    const replayShapes = useCallback(async (skipPenups, drawAsap, board) => {
        try {
            const layer = mainLayer.current;
            // Replay is currently not implemented for viewers, so don't emit anything
            //socket.emit('clear_board', {sid: props.sid, boardId: parseInt(currentBoard), token: getPresenterToken(props.sid)});
            layer.destroyChildren();
            layer.batchDraw();
            log(DEBUG_LEVELS.DEV, 'replayShapes: getting content for board ' + parseInt(currentBoard));
            const resp = await fetch(ENDPOINT + `/board/` + props.sid + '/' + board, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getPresenterToken(props.sid)
                }
            })
            if(!resp.ok) {
                log(DEBUG_LEVELS.ERROR, 'replayShapes: Error getting shapes to draw!');
                return Promise.reject('Error (' + resp.status + ') occurred')
            } else {
                const json = await resp.json();
                if(json.shapes.length) {
                    const play = playShapes(socket, json.shapes, { skipPenUps: skipPenups, drawAsap: drawAsap });
                    if(play.error) log(DEBUG_LEVELS.ERROR, 'Error in playShapes: ' + play.reason);
                }
                //.then(mainLayer.current.find('Line').cache().filters([Konva.Filters.Noise]))
            }
        } catch (error) {
            log(DEBUG_LEVELS.ERROR, 'Error in replayShapes: ' + error);
        }
    },[props.sid, playShapes]);
    
    /**
     * Handle the UI actions for playback of the drawn shapes in the current board.
     * @param {string} method Method of playback of shapes
     */
    const doReplay = useCallback((method) => {
        handleCloseSidebar();
        if (method === 'realtime') replayShapes(0, 0, currentBoard);
        if (method === 'skipPenups') replayShapes(1, 0, currentBoard);
        if (method === 'instant') replayShapes(1, 1, currentBoard);
    }, [currentBoard])
        
    
    function clearAllPreviews() {
        // Remove all thumbnails from this browser (no point in keeping other sessions' data as it is now cleared on login anyway)
        localStorage.clear();
        saveThumbnail(props.sid, 1); // uses the default empty background
    };

    return (
        <Container fluid style={{ padding: 0, overflow: "hidden" }}>
            <ToastDisplay></ToastDisplay>
            {boardLimits && <MemoizedSettingsSidebar 
                handleSessionChange = {handleSessionChange}
                saveAndQuit = {saveAndQuit}
                doReplay = {doReplay}
                handleSaveImage = {handleSaveImage}
                handleCloseSidebar = {handleCloseSidebar}
                releaseToken = {releaseToken}
                postClear = {postClear}
                setUiOptions = {setUiOptions}
                setLineProperties =  {setLineProperties}
                setLaserProperties = {setLaserProperties}
                showSidebar = {showSidebar}
                sessionInfo = {sessionInfo}
                ENDPOINT = {ENDPOINT}
                mainLayer = {mainLayer}
                ui = {ui}
                lineProperties = {lineProperties}
                laserProperties = {laserProperties}
            />}
            {boardLimits ? (
                <ButtonToolbar ref={mainToolbar} aria-label="Blackboard Toolbar">
                    <ButtonGroup className="me-2">
                        <Button size={wideUI ? "" : "sm"} title="Show settings" className="me-2" variant="primary" onClick={handleShowSidebar}>
                            <Icon.GearFill />
                        </Button>
                        <Dropdown>
                            <Dropdown.Toggle title="Switch user interface" size={wideUI ? "" : "sm"}>
                                <Icon.MenuButton /> {ui.complex ? 'Adv. ' : 'Simple '} UI
                            </Dropdown.Toggle>
                            <Dropdown.Menu>
                                <Dropdown.Item className={ui.complex ? null : 'active'} onClick={switchToSimpleMode}><Icon.MenuApp /> Simple UI</Dropdown.Item>
                                <Dropdown.Item className={ui.complex ? 'active' : null} onClick={switchToAdvancedMode}><Icon.MenuButtonWideFill /> Advanced UI</Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown>
                    </ButtonGroup>
                    <MemoizedToolMenu size={wideUI ? "" : "sm"} complexUi={ui.complex} selectedCallback={handleToolChange} currentTool={currentTool}></MemoizedToolMenu>
                    {(currentTool.name !== 'Pointer' && currentTool.name !== 'Delete') &&
                    <ButtonGroup size={wideUI ? "" : "sm"}>
                        <MemoizedLineColorMenu
                            key = {'Stroke'}
                            mode = {'Stroke'}
                            sid = {props.sid}
                            handleShapeColorChange={handleShapeColorChange}
                            //colorArray = {strokeColors}
                            colorProp = {stroke}
                            stroke = {stroke}
                            fill = {fill}
                            boardColor = {boardSettings.color}
                            ui = {ui}
                            wideUI = {wideUI}
                        />
                        <MemoizedLineWidthMenu 
                            handleStrokeWidthChange = {handleStrokeWidthChange}
                            stageSize = {stageSize}
                            width = {/*currentTool.name === 'Wipe' ? lineProperties.wipeWidth : */lineProperties.width}
                            ui = {ui}
                            wideUI = {wideUI}
                        />
                        { ui.complex && <MemoizedFillColorMenu
                            key = {'Fill'}
                            mode = {'Fill'}
                            sid = {props.sid}
                            handleShapeColorChange={handleShapeColorChange}
                            //colorArray = {fillColors}
                            colorProp = {fill}
                            stroke = {stroke}
                            fill = {fill}
                            boardColor = {boardSettings.color}
                            ui = {ui}
                            wideUI = {wideUI}
                        /> }
                    </ButtonGroup>}
                    { ui.complex && <Button size={wideUI ? "" : "sm"} title="Turn line smooothing on/off" className="me-2" variant={lineProperties.bezier ? 'primary' : 'secondary'} onClick={(e) => {
                        const newBezier = !lineProperties.bezier;
                        setLineProperties({...lineProperties, bezier: newBezier});
                        localStorage.setItem('lineSmoothing', newBezier.toString());
                    }}><Icon.Bezier2 /></Button>}
                    <ButtonGroup className="me-2" size={wideUI ? "" : "sm"}>
                        <Button size={wideUI ? "" : "sm"} title="Remove last added shape" variant="primary" onClick={clearLast}><Icon.ArrowCounterclockwise /> {wideUI ? "Undo" : ""}</Button>
                        <Button size={wideUI ? "" : "sm"} title="Restore last added shape" variant="primary" onClick={restoreLast}><Icon.ArrowClockwise /> {wideUI ? "Redo" : ""}</Button>
                    </ButtonGroup>
                    <MemoizedThumbnailNav
                        changeBoard = {changeBoard}
                        navigateBoard = {navigateBoard}
                        reConfigureBoards={reConfigureBoards}
                        sessionId = {props.sid}
                        busyPainting = {busyPainting}
                        busyFetching = {busyFetching}
                        numBoards = {numBoards}
                        boardLimits = {boardLimits}
                        wideUI = {wideUI}
                        />
                    { ui.complex && <ButtonGroup size={wideUI ? "" : "sm"}>
                        <MemoizedBoardColorMenu 
                            handleBoardColorChange = {handleBoardColorChange}
                            handleBoardSettingsSave = {handleBoardSettingsSave}
                            boardColors = {boardColors}
                            boardColor = {boardSettings.color}
                            stroke = {stroke}
                            wideUI = {wideUI}
                        />
                    </ButtonGroup>}
                    { ui.complex && <MemoizedBackgroundImageMenu
                        setBoardProperty={setBoardProperty}
                        updateBgImage={updateBgImage}
                        bg={boardSettings.settings.bg}
                        complex={ui.complex}
                        wideUI = {wideUI}
                    />}
                    <MemoizedHelperGridMenu
                        handleBoardSettingsSave = {handleBoardSettingsSave}
                        setBoardProperty={setBoardProperty}
                        grid={boardSettings.settings.grid}
                        complex={ui.complex}
                        wideUI = {wideUI}
                    />
                    { ui.showFSDialog && <MemoizedFullScreenMenu size={wideUI ? "" : "sm"}></MemoizedFullScreenMenu> }
                    <ButtonGroup className="me-2" size={wideUI ? "" : "sm"}>
                        { ui.showClock && <Clock /> }
                        { ui.showViewerCount && <Button title="Current viewer count" variant="secondary" style={{ whiteSpace: 'nowrap' }}><Icon.EyeFill /> {viewerCount}</Button> }
                        { ui.showPps && <Button title="Points per second" variant="secondary"><Icon.Speedometer /> {pps} pps</Button> }
                        { ui.complex && <Button title={ui.mouse ? "Use mouse (show cursor location)" : "Use pen" } onClick={(e) => { setUiOptions({...ui, mouse: !ui.mouse})}}>{ui.mouse ? <Icon.Mouse /> : <Icon.Pen />}</Button>}
                    </ButtonGroup>
                    <ButtonGroup size={wideUI ? "" : "sm"}>
                        <Button size={wideUI ? "" : "sm"} title="Save boards as PDF" variant="primary" className="me-2" onClick={() => handleSaveImage("pdf")}><Icon.FileEarmarkPdf /> {wideUI ? "PDF" : null}</Button>
                        <Button size={wideUI ? "" : "sm"} title="Save settings and quit to main page" variant="danger" onClick={saveAndQuit}><Icon.BoxArrowRight /> {wideUI ? "Quit" : null}</Button>
                    </ButtonGroup>
                </ButtonToolbar>
            ) : (
                <ButtonToolbar ref={mainToolbar} aria-label="Blackboard Toolbar">
                    <ButtonGroup className="me-2">
                        <Button size={wideUI ? "" : "sm"} disabled>
                            Waiting for presenter authentication...
                        </Button>
                    </ButtonGroup>
                </ButtonToolbar>
            )}
            { boardLimits && ui.showFps && <FPSStats top={41}/> }
            <div ref={drawArea} style={{ height: `calc(100% - ${toolbarSize.height}px)`/*}, backgroundImage: boardSettings.settings.bg?.url ? "url(" + boardSettings.settings.bg?.url + ")" : 'none', backgroundRepeat: "no-repeat", backgroundSize: "100% 100%"*/}}>
            <Stage id="mainstage" 
                /*tabIndex={0} 
                onKeyPress={keyNavigation}*/
                touch-action="none"
                width={window.innerWidth}
                height={window.innerHeight - (toolbarSize.height ?? 41)}
                ref={stageEl}
                onTouchStart={e => {
                    e.evt.preventDefault();
                    if(ui.swipeEnabled) {
                        if(e.evt.touches.length === 2) {
                            log(DEBUG_LEVELS.DEV, 'onTouchStart: 2 fingers, id ' + e.evt.touches[0].identifier);
                            swipeOngoing = 2;
                            drawingPointer = null;
                            //setBusyPainting(false);
                            log(DEBUG_LEVELS.DEV, 'onTouchStart: dragging with ' + e.evt.touches.length + ' fingers!');
                            // where the gesture was started and which was the second touch point used
                            setSwipeStart({x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY, id: e.evt.touches[0].identifier, num: 2});
                            swipeRef.current = true;
                            log(DEBUG_LEVELS.DEV, 'onTouchStart: 2 fingers, assigned starting finger ' + e.evt.touches[0].identifier);
                        } else {
                            if(e.evt.touches.length === 3) {
                                log(DEBUG_LEVELS.DEV, 'onTouchStart: 3 fingers, id ' + e.evt.touches[0].identifier);
                                swipeOngoing = 3;
                                drawingPointer = null;
                                //setBusyPainting(false);
                                if(swipeStart.id) {
                                    setSwipeStart({...swipeStart, num: 3});
                                    swipeRef.current = true;
                                } else {
                                    setSwipeStart({x: e.evt.touches[0].clientX, y: e.evt.touches[0].clientY, id: e.evt.touches[0].identifier, num: 3});
                                    swipeRef.current = true;
                                    log(DEBUG_LEVELS.DEV, 'onTouchStart: 3 fingers, assigned starting finger ' + e.evt.touches[0].identifier);
                                }
                            }
                        }
                    }
                    //const stage = e.target.currentTarget;
                }}
                onTouchMove={e => {
                    if(swipeStart) {
                        //alert('dragging with ' + e.evt.touches.length + ' fingers!');
                        e.evt.preventDefault();
                        if(ui.swipeEnabled) {
                            if(e.evt.touches.length === 3 && swipeStart.id !== undefined) {
                                if(e.evt.touches[0].identifier === swipeStart.id) {
                                    handleSwipe(e);
                                } else log(DEBUG_LEVELS.DEBUG, 'onTouchMove: got id ' + e.evt.touches[0].identifier + ' but started with ' + swipeStart.id)
                            }
                        }
                    }
                }}
                onTouchEnd={e => {
                    e.evt.preventDefault();
                    //log(DEBUG_LEVELS.DEV, 'end drag with ' + e.evt.touches.length + 'fingers');
                    if(ui.swipeEnabled) {
                        if(e.evt.changedTouches[0].identifier === swipeStart.id) {
                            log(DEBUG_LEVELS.DEV, 'onTouchEnd: lifted starting finger, id ' + e.evt.changedTouches[0].identifier);
                            if(swipeStart.num === 3 && swipeOngoing === 3) {
                                handle3fSwipeEnd(e);
                                swipeOngoing = false;
                            }
                            if(swipeStart.num === 2 && swipeOngoing === 2) {
                                handle2fSwipeEnd(e);
                                swipeOngoing = false;
                            }
                        } else {
                            log(DEBUG_LEVELS.DEV, 'onTouchEnd: lifted other finger, id ' + e.evt.changedTouches[0].identifier);
                        }
                    }
                }}
            >
                <Layer id="bglayer" perfectDrawEnabled={false} listening={false}>
                    <Background ref={bgRectRef} stageSize={stageSize} bgProps={bgProps} boardSettings={boardSettings} />
                    { boardSettings.settings?.grid?.visible && <MemoizedHelperGrid gridBlockSize={gridBlockSize} stageSize={stageSize} gridProperties={boardSettings.settings?.grid} /> }
                </Layer>
                <Layer id="mainlayer" ref={mainLayer} perfectDrawEnabled={false}>
                    {<Rect visible={swipeOngoing} id="swiperect" x={0} y={0} width={stageSize.width} height={stageSize.height} fill={boardSettings.color} stroke="grey" strokeWidth={1}></Rect>}
                </Layer>
                <Layer id="drawlayer" ref={drawLayer} listening={true} perfectDrawEnabled={false}>
                    {contextMenu && (
                        <Portal>
                        <ContextMenu
                            {...contextMenu}
                            onOptionSelected={handleOptionSelected}
                        />
                        </Portal>
                    )}
                    {fingerMenu && (
                        <Portal>
                        <ContextMenu
                            {...fingerMenu}
                            onOptionSelected={handleFingerSelection}
                        />
                        </Portal>
                    )}
                </Layer>
                <Layer id="toollayer" ref={toolLayer} listening={false} perfectDrawEnabled={false} transformsEnabled="none">
                    <Cursor ref={konvaCursor} penLoc={penLoc} cursor={cursor} />
                </Layer>
            </Stage>
            </div>
        </Container >
    );
}

export default Blackboard;