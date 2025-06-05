import React, {useState, useCallback} from 'react';
import Offcanvas from 'react-bootstrap/Offcanvas'
import FloatingLabel from "react-bootstrap/FloatingLabel";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import * as Icon from 'react-bootstrap-icons';
import { HexColorPicker } from 'react-colorful';
import { DEBUG_LEVELS, DEF_UI } from "../constants.js";
import { log, setDebugLevel } from "../logging.js";
import { useAtomValue } from "jotai";
import { currentBoardAtom } from "../atoms.js";

const ClearModal = (props) => {
    return(
    <Modal show={props.showConfirm} onHide={() => props.setShowConfirm(false)}>
        <Modal.Header closeButton>
            <Modal.Title>Clear {props.showConfirm === 'all' ? 'all boards' : props.showConfirm === 'session' ? 'session and all data' : 'this board'}?</Modal.Title>
        </Modal.Header>
        <Modal.Body>Clearing of {props.showConfirm === 'all' ? 'all boards' : props.showConfirm === 'session' ? 'session and all data' : 'this board'} cannot be undone! Proceed?</Modal.Body>
        <Modal.Footer>
            <Button variant="success" onClick={() => props.setShowConfirm(false)}>
                No way, cancel!
            </Button>
            <Button variant="danger" onClick={props.showConfirm === 'all' ? props.clearBoards  : props.showConfirm === 'session' ? props.clearAll : props.clearBoard}>
                Sure, go ahead!
            </Button>
        </Modal.Footer>
    </Modal>
    )
}

const SettingsSidebar = (props) => {

    const currentBoard = useAtomValue(currentBoardAtom);

    const [showConfirm, setShowConfirm] = useState(false);
    const [debugMode, setDebugMode] = useState(props.ui.debugLevel >= DEBUG_LEVELS.DEBUG);
    const [settingsChanged, setSettingsChanged] = useState(false);

    /**
     * Clear a single board (not actually, just marks the shapes
     * as hidden in DB).
     */
    const clearBoard = useCallback(async () => {
        setShowConfirm(false);
        const layer = props.mainLayer.current;
        try {
            const resp = await fetch(props.ENDPOINT + `/board/` + props.sessionInfo.id + `/` + currentBoard, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + sessionStorage.getItem('presentertoken_' + props.sessionInfo.id)
                }
            });
            if(resp.ok) {
                layer.destroyChildren();
                layer.batchDraw();
                props.handleCloseSidebar();
            } else {
                log(DEBUG_LEVELS.ERROR, 'Error clearing board ' + currentBoard, true)
                return Promise.reject('Error (' + resp.status + ') occurred')
            }
        } catch (err) {
            log(DEBUG_LEVELS.ERROR, 'Error: ' + err, true)
        }
    }, [props.sessionInfo.id, currentBoard, props.mainLayer.current]);

    const clearBoards = async () => {
        setShowConfirm(false);
        //const layer = stageEl.current.children[1];
        try {
            const layer = props.mainLayer.current;
            const resp = await fetch(props.ENDPOINT + `/boards/all/` + props.sessionInfo.id , {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + sessionStorage.getItem('presentertoken_' + props.sessionInfo.id)
                }
            })
            if(resp.ok) {
                layer.batchDraw();
                try {
                    props.postClear();
                    props.handleCloseSidebar();
                } catch (error) {
                    log(DEBUG_LEVELS.ERROR, 'Boards cleared from database, but then got: ' + error, true)
                }
            } else {
                log(DEBUG_LEVELS.ERROR, 'clearBoards: Database call resulted in status '+ resp.status, false);
                return Promise.reject('Error (' + resp.status + ') occurred')
            }
        } catch (err) {
            log(DEBUG_LEVELS.ERROR, 'Error: ' + err, true)
        }
    }

    const clearAll = async () => {
        setShowConfirm(false);
        //const layer = stageEl.current.children[1];
        try {
            //const layer = props.mainLayer.current;
            const resp = await fetch(props.ENDPOINT + `/session/` + props.sessionInfo.id , {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + sessionStorage.getItem('presentertoken_' + props.sessionInfo.id)
                }
            })
            if(resp.ok) {
                window.location.href="/";
            } else {
                log(DEBUG_LEVELS.ERROR, 'clearAll: Database call resulted in status '+ resp.status, false);
                return Promise.reject('Error (' + resp.status + ') occurred')
            }
        } catch (err) {
            log(DEBUG_LEVELS.ERROR, 'Error: ' + err, true)
        }
    }

    //We need separate (local) functions for passing new settings to detect when changes have been made
    const setLineSettings = (opts) => {
        setSettingsChanged(true);
        props.setLineProperties(opts);
    }

    const setUiSettings = (opts) => {
        setSettingsChanged(true);
        props.setUiOptions(opts);
    }

    const setLaserSettings = (opts) => {
        setSettingsChanged(true);
        props.setLaserProperties(opts);
    }

    const setLaserColor = (color) => {
        setLaserSettings({...props.laserProperties, color: color});
    }
    
    // Tell if we have changed settings or not, so db save can be avoided if not
    const closeSidebar = () => {
        props.handleCloseSidebar(settingsChanged);
        setSettingsChanged(false);
    }

    const handleKeyPress = (e) => {
        if(e.keyCode === 13){
            e.target.blur();
            document.dispatchEvent(new MouseEvent('click')); // need click event to close menu
        }
    }

    return (
        <>
        <Offcanvas show={props.showSidebar} onHide={closeSidebar}>
            <Offcanvas.Header closeButton>
            <Offcanvas.Title className="text-dark">Settings and Extras</Offcanvas.Title>
            </Offcanvas.Header>
            <Offcanvas.Body>
                <div className="sidebar-box">
                <Form.Group className="d-grid">
                <Form.Label><Icon.KeyFill /> Session properties</Form.Label>
                <FloatingLabel label="Set session name">
                <Form.Control 
                    className="mb-1"
                    type="text"
                    id="sessionname"
                    placeholder="Session name" 
                    onBlur={(e) => e.target.value !== '' ? props.handleSessionChange('sessionname', e.target.value) : e.target.value = props.sessionInfo.sessionname} 
                    onKeyDown={(e) => handleKeyPress(e)}
                    defaultValue={props.sessionInfo.sessionname}
                />
                </FloatingLabel>
                <Form.Check type="checkbox" className="mb-3 mt-2" id="ispublic" label="Show session in list" onChange={(e) => props.handleSessionChange('ispublic', e.target.checked)} checked={props.sessionInfo.ispublic ?? false}></Form.Check>
                {!props.sessionInfo.ispublic && <div className="alert alert-danger">
                <small><strong>Important:</strong> Take note of the presentation id (<strong>{props.sessionInfo.id}</strong>) to resume it later!</small>
                </div>}
                <FloatingLabel label="Set presenter password">
                <Form.Control 
                    className="mb-2"
                    id="presenterpw"
                    type="password"
                    placeholder="Set presenter password" 
                    onBlur={(e) => e.target.value !== '' ? props.handleSessionChange('presenterpw', e.target.value) : ''} 
                    onKeyDown={(e) => handleKeyPress(e)}
                    defaultValue={props.sessionInfo.presenterpw}
                />
                </FloatingLabel>
                <FloatingLabel label="Set viewer password">
                <Form.Control 
                    className="mb-1"
                    type="text"
                    id="viewerpw"
                    placeholder="Set viewer password" 
                    onBlur={(e) => e.target.value !== props.sessionInfo.viewerpw ? props.handleSessionChange('viewerpw', e.target.value) : ''} 
                    onKeyDown={(e) => handleKeyPress(e)}
                    defaultValue={props.sessionInfo.viewerpw}
                />
                </FloatingLabel>
                <small>New passwords are saved (if changed) when leaving the input field</small>
                {/*<Button className="mt-3" variant="primary" onClick={props.saveAndQuit}><Icon.BoxArrowRight /> {settingsChanged ? 'Save and r' : 'R'}eturn to main page</Button>*/}
                </Form.Group>
                </div>
                <div className="sidebar-box">
                <Form.Label><Icon.Sliders /> UI options</Form.Label>
                <Form.Group className="d-grid">
                <Form.Check className="mb-3" type="checkbox" id="debugmode" label="Show advanced options" onChange={(e) => (setDebugMode(e.target.checked))} checked={debugMode ?? false}></Form.Check>
                <Form.Label>Pointing device</Form.Label>
                <Form.Check 
                    type="radio" 
                    id="usemouse" 
                    name="pointingDevice" 
                    label="Mouse (show cursor)" 
                    onChange={(e) => setUiSettings({...props.ui, mouse: true})} 
                    checked={props.ui.mouse === true}
                />
                <Form.Check 
                    type="radio" 
                    id="usepen" 
                    name="pointingDevice" 
                    label="Pen (hide cursor)" 
                    onChange={(e) => setUiSettings({...props.ui, mouse: false})} 
                    checked={props.ui.mouse === false}
                />
                <Form.Check className="mt-2" type="checkbox" id="fswarning" label="Fullscreen prompt on startup" onChange={(e) => setUiSettings({...props.ui, showFSDialog: e.target.checked})} checked={props.ui.showFSDialog ?? false}></Form.Check>
                <Form.Check type="checkbox" id="showclock" label="Show clock" onChange={(e) => setUiSettings({...props.ui, showClock: e.target.checked})} checked={props.ui.showClock ?? false}></Form.Check>
                <Form.Check type="checkbox" id="showclock" label="Show viewer count" onChange={(e) => setUiSettings({...props.ui, showViewerCount: e.target.checked})} checked={props.ui.showViewerCount ?? false}></Form.Check>
                {debugMode && <Form.Check type="checkbox" id="rotateenabled" label="Enable rotating shapes (experimental)" onChange={(e) => setUiSettings({...props.ui, rotateEnabled: e.target.checked})} checked={props.ui.rotateEnabled ?? false}></Form.Check>}
                {debugMode && <Form.Check type="checkbox" id="swipeenabled" label="Enable swipe gestures (experimental)" onChange={(e) => setUiSettings({...props.ui, swipeEnabled: e.target.checked})} checked={props.ui.swipeEnabled ?? false}></Form.Check>}
                {debugMode && <Form.Check type="checkbox" id="showpps" label="Show points per second" onChange={(e) => setUiSettings({...props.ui, showPps: e.target.checked})} checked={props.ui.showPps ?? false}></Form.Check>}
                {debugMode && <Form.Check type="checkbox" id="showfps" label="Show frames per second" onChange={(e) => setUiSettings({...props.ui, showFps: e.target.checked})} checked={props.ui.showFps ?? false}></Form.Check>}
                {debugMode && <><Form.Label className="mt-2">Debug level</Form.Label>
                <Form.Select 
                    aria-label="Set debug level" 
                    value={props.ui.debugLevel ? props.ui.debugLevel.toString() : "2"} 
                    onChange={(e) => { setDebugLevel(parseInt(e.target.value)); setUiSettings({...props.ui, debugLevel: parseInt(e.target.value)})}}
                >
                    <option value="0">None (minimal messages)</option>
                    <option value="1">Error</option>
                    <option value="2">Warning (default)</option>
                    <option value="3">Info</option>
                    <option value="4">Debug</option>
                    <option value="5">Development (a lot of messages!)</option>
                </Form.Select></>}
                </Form.Group>
                </div>
                <div className="sidebar-box">
                <Form.Label><Icon.Cursor /> Laser pointer options</Form.Label>
                <Form.Group className="d-grid laserpicker">
                    <Form.Label>Pointer color: {props.laserProperties.color}</Form.Label>
                    <HexColorPicker className="mb-2" color={props.laserProperties.color} onChange={setLaserColor} />
                    <Form.Label>Pointer size: {props.laserProperties.size}</Form.Label>
                    <Form.Range className="mb-10" value={props.laserProperties.size} min={0.5} max={3} step={0.1} onChange={(e) => setLaserSettings({...props.laserProperties, size: Number(e.target.value)})}/>
                    <Button className="mt-3" variant="primary" onClick={(e) => setLaserSettings(DEF_UI.laser)}>Restore defaults</Button>
                </Form.Group>
                </div>
                {debugMode && <div className="sidebar-box">
                <Form.Label><Icon.Brush /> Line options</Form.Label>
                <Form.Group className="d-grid">
                    {/*debugMode && <Form.Check type="checkbox" id="moreevents" label="Get more events from browser" onChange={(e) => setLineSettings({...props.lineProperties, allEvents: e.target.checked})} checked={props.lineProperties.allEvents ?? false}></Form.Check>*/}
                    {debugMode && <Form.Check type="checkbox" id="showpoints" label="Show points when drawing" onChange={(e) => setLineSettings({...props.lineProperties, showPoints: e.target.checked})} checked={props.lineProperties.showPoints ?? false}></Form.Check>}
                    <Form.Label>Time between points: {props.lineProperties.pointsThresholdMs} ms (max {Math.round(1000 / props.lineProperties.pointsThresholdMs)} pps)</Form.Label>
                    <Form.Range value={props.lineProperties.pointsThresholdMs} min={0} max={50} onChange={(e) => setLineSettings({...props.lineProperties, pointsThresholdMs: e.target.value})}/>
                    <Form.Label>Min distance between points: {Math.round(props.lineProperties.distThreshold * 10000) / 100}% of width</Form.Label>
                    <Form.Range value={props.lineProperties.distThreshold} min={0} max={0.02} step={0.0005} onChange={(e) => setLineSettings({...props.lineProperties, distThreshold: e.target.value})}/>
                    <Form.Check type="checkbox" id="smoothlines" label="Smooth lines" onChange={(e) => setLineSettings({...props.lineProperties, bezier: e.target.checked})} checked={props.lineProperties.bezier ?? false}></Form.Check>
                    <Form.Label>Line tension: {props.lineProperties.lineTension}</Form.Label>
                    <Form.Range className="mb-10" disabled={!props.lineProperties.bezier} value={props.lineProperties.lineTension} min={0} max={0.8} step={0.05} onChange={(e) => setLineSettings({...props.lineProperties, lineTension: Number(e.target.value)})}/>
                    <Button className="mt-3" variant="primary" onClick={(e) => setLineSettings({...props.lineProperties, bezier: DEF_UI.line.bezier, lineTension: DEF_UI.line.lineTension, pointsThresholdMs: DEF_UI.line.pointsThresholdMs, distThreshold: DEF_UI.line.distThreshold, showPoints: DEF_UI.line.showPoints, allEvents: DEF_UI.line.allEvents})}>Restore defaults</Button>
                </Form.Group>
                </div>}
                <div className="sidebar-box">
                <Form.Label><Icon.XCircleFill /> Clear (removes data from database)</Form.Label>
                <Form.Group className="d-grid gap-3">
                <Button variant="warning" onClick={() => setShowConfirm("board")}>This board</Button>
                <Button variant="danger" onClick={() => setShowConfirm("all")}>All boards</Button>
                <Button variant="danger" onClick={() => setShowConfirm("session")}>The whole presentation</Button>
                </Form.Group>
                </div>
                <div className="sidebar-box">
                <Form.Group>
                <Form.Label><Icon.Save /> Save / download</Form.Label>
                </Form.Group>
                <Form.Group className="d-grid gap-3">
                <Button variant="primary" onClick={() => props.handleSaveImage("png")}><Icon.CardImage /> Current board as PNG</Button>
                <Button variant="primary" onClick={() => props.handleSaveImage("pdf")}><Icon.FileEarmarkPdf /> All boards as single PDF</Button>
                </Form.Group>
                </div>
                {debugMode && <div className="sidebar-box">
                <Form.Label><Icon.PlayBtn /> Replay current board</Form.Label>
                <Form.Group className="d-grid gap-3">
                <Button variant="primary" onClick={() => props.doReplay("instant")}>Instant (sync board with database)</Button>
                <Button variant="primary" onClick={() => props.doReplay("skipPenups")}>Realtime, skipping pauses</Button>
                <Button variant="warning" onClick={() => props.doReplay("realtime")}>Realtime, including pauses</Button>
                </Form.Group>
                </div>}
            </Offcanvas.Body>
        </Offcanvas>
        <ClearModal showConfirm={showConfirm} setShowConfirm={setShowConfirm} clearAll={clearAll} clearBoards={clearBoards} clearBoard={clearBoard} />
        </>
    );
}
const MemoizedSettingsSidebar = React.memo(SettingsSidebar);
export default MemoizedSettingsSidebar;
