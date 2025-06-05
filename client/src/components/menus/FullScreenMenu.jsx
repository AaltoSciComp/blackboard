import React, {useState} from 'react';
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Modal from "react-bootstrap/Modal";
import * as Icon from 'react-bootstrap-icons';


const FullScreenMenu = (props) => {

    /**
     * Full screen on/off
     */
    var elem = document.documentElement;

    const [showFSDialog, setShowFSDialog] = useState(true); // This is only for showing the dialog; the setting is under ui !!

    const is_fullscreen = () => {
        return document.fullscreenElement != null;
    }

    const toggleFullscreen = () => {
        if(is_fullscreen()) {
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

    const openFullscreen = () => {
        if(is_fullscreen()) return;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
        setShowFSDialog(false);
    }

    const dismissFullscreen = () => {
        // If we come here via fullscreen dialog, dismiss it
        if(showFSDialog) {
            setShowFSDialog(false);
        }
    }
    
    return (
        <>
        <Modal show={showFSDialog} onHide={dismissFullscreen}>
            <Modal.Header closeButton>
                <Modal.Title>Enter fullscreen mode?</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                Blackboard 2.0 is best experienced in full screen mode.
                You can switch now, or do it later using the toolbar button.
            </Modal.Body>
            <Modal.Footer>
                <Button variant="primary" onClick={openFullscreen}>
                    OK, enter fullscreen
                </Button>
                <Button variant="secondary" onClick={dismissFullscreen}>
                    No, continue windowed
                </Button>
            </Modal.Footer>
        </Modal>
        <ButtonGroup className="me-2" size={props.size}>
            <Button size={props.size} title="Toggle fullscreen mode" variant="primary" onClick={toggleFullscreen}><Icon.Fullscreen /> {props.size!=="sm" ? "Fullscreen" : ""}</Button>
        </ButtonGroup>
        </>
    )
}

const MemoizedFullScreenMenu = React.memo(FullScreenMenu);
export default MemoizedFullScreenMenu;