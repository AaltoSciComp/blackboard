import React, {useState, useEffect } from 'react';
import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import InputGroup from "react-bootstrap/InputGroup";
import CloseButton from 'react-bootstrap/CloseButton'
import * as Icon from 'react-bootstrap-icons';
import { isValidUrl } from '../../Utils';
import { useDebounce } from "use-debounce";
import { currentBoardAtom } from "../../atoms.js";
import { useAtomValue } from "jotai";
import { DEBUG_LEVELS } from '../../constants.js';
import { log } from '../../logging.js';

const BackgroundImageMenu = (props) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [errors, setErrors] = useState(false);
    const [url, setUrl] = useState(props.bg.url);
    const [debouncedUrl] = useDebounce(url, 1000);
    const currentBoard = useAtomValue(currentBoardAtom);

    //const defaultImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mO8UQ8AAjUBWXO9i8oAAAAASUVORK5CYII=";
    const defaultImage = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" fill="lightgray" class="bi bi-image-alt" viewBox="0 0 16 16">  <path d="M7 2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm4.225 4.053a.5.5 0 0 0-.577.093l-3.71 4.71-2.66-2.772a.5.5 0 0 0-.63.062L.002 13v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4.5l-4.777-3.947z"/></svg>';
    // Used for testing if we are able to load image data from the given URL
    const bgImage = new Image();

    /**
     * Debounce the URL input so we don't try to fetch new images on every
     * keypress.
     */
    useEffect(() => {
        const placeholder = document.getElementById('background-thumbnail');
        if(!placeholder) return; // Bail out if image placeholder not found in DOM yet
        const checkUrlInput = async (value) => {
            // Accept an empty string to remove url
            if(value === '') {
                setErrors(false);
                props.setBoardProperty('bg','url', '');
                return true;
            }
            if(isValidUrl(value)) {
                bgImage.src = value;

                if (bgImage.complete) {
                    setErrors(false);
                } else {
                    bgImage.onload = () => {
                        setErrors(false);
                        placeholder.src = value;
                        props.updateBgImage(value);
                        props.setBoardProperty('bg','url', value);
                    };
                    
                    bgImage.onerror = () => {
                        setErrors('Could not load image');
                    };
                }
            } else {
                setErrors('Invalid URL');
                return false;
            }
        }

        checkUrlInput(debouncedUrl).catch((error) => {
            log(DEBUG_LEVELS.ERROR, 'Error in BackgroundImageMenu: ', error);
        });
    }, [debouncedUrl]);

    /**
     * When the background properties change (like when changing board), we
     * need to update the URL input field.
     */
    useEffect(() => {
        setUrl(props.bg.url);
    }, [props.bg]);

    const handleToggle = (e) => {
        if(menuOpen){
            // Use small timeout so we don't immediately open the menu again
            setTimeout(() => {
                setMenuOpen(false);
            }, 100);
        } else {
            setMenuOpen(true);
        }
    }
    
    // Do not let the user submit the form, or we get a page reload...
    const preventSubmit = (event) => {
        event.preventDefault();
    };

    const pasteText = () => {
        navigator.clipboard.readText()
        .then((copied) => {
            setUrl(copied);
        });
    }

    return (
        <Dropdown onToggle={handleToggle} show={menuOpen} as={ButtonGroup} autoClose="outside">
        <Button disabled={ !!errors || !url} variant={props.bg.visible ? 'primary' : 'secondary'} size={props.wideUI ? "" : "sm"} title="Turn background image on/off" onClick={(e) => {props.setBoardProperty('bg','visible', props.bg.visible ? false : true)}}><Icon.Image /></Button>
    
        <Dropdown.Toggle split variant="primary" title="Adjust background image settings" size={props.wideUI ? "" : "sm"} />
    
        <Dropdown.Menu rootCloseEvent="pointerdown" style={{minWidth: "30vw", maxWidth: "40vw"}}>
        <CloseButton className="float-end" onClick={handleToggle}/>
        <Form noValidate validated={!errors} onSubmit={preventSubmit} className="mb-2">
        <p>Background image URL:</p>
        <InputGroup>
        <Form.Control 
            as="textarea"
            rows={3}
            className="mb-2"
            type="text"
            id="bgimageurl"
            placeholder="Background image url" 
            onChange={(e) => setUrl(e.target.value)}
            value={url}
            isInvalid={ !!errors }
        />
        <Form.Control.Feedback type="invalid">
            {errors}
        </Form.Control.Feedback>
        </InputGroup>
        <Button variant="primary" onClick={(e) => pasteText()}><Icon.Clipboard /> Paste from clipboard</Button>
        <Button variant="danger" onClick={(e) => setUrl('')}><Icon.XCircleFill /> Clear URL</Button>
        </Form>
        <div className="p-2" style={{border: '1px solid #aaaaaa'}}>
        <p>Preview</p>
        <div id="background-thumbnail-wrapper">
        {props.bg.url ? (
            <img 
                id="background-thumbnail" 
                style={{maxWidth: "20vw", maxHeight: "20vh"}} 
                src={props.bg.url} 
                alt="Background image preview"
            />
        ) : (
            <img 
                id="background-thumbnail" 
                style={{maxWidth: "20vw", maxHeight: "20vh"}} 
                src={defaultImage} 
                alt="Default background image preview"
            />
        )}
        <p className="mt-2 mb-0">{props.bg.url || '(no image loaded)'}</p>
        </div>
        </div>
        </Dropdown.Menu>
    </Dropdown>
);
}
const MemoizedBackgroundImageMenu = React.memo(BackgroundImageMenu);
export default MemoizedBackgroundImageMenu;
