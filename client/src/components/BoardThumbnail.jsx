import React from 'react';
import { log } from '../logging';
import { DEBUG_LEVELS } from '../constants';

/**
 * Saves the thumbnail image data to the local storage.
 * 
 * @param {string} session - The session identifier.
 * @param {number} boardnum - The board number.
 * @param {string} data - Default thumbnail data in base64 format.
 */
export const saveThumbnail = (session, boardnum, data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdj0HBz+w8AAwIBtPNCQ7oAAAAASUVORK5CYII=") => {
    try {
        window.localStorage.setItem('thumb_' + session + '_' + boardnum, data);
    } catch (err) {
        if (err instanceof DOMException &&
        err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED") {
            log(DEBUG_LEVELS.INFO, 'Local storage is full, emptying...');
            localStorage.clear();
            // Could retry here but need to avoid infinite looping, and app will retry anyway in a moment
        } else {
            // Some other error than quota exceeded...
            log(DEBUG_LEVELS.ERROR, 'Error in saveThumbnail: ' + err);
        }
    }
}

const BoardThumbnail = (props) => {

    // Get a thumbnail image from localStorage and return a default 1-pixel png if not found
    // solid darkslategrey = iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdj0HBz+w8AAwIBtPNCQ7oAAAAASUVORK5CYII=
    const getThumbnail = (session, board, defaultValue = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mO8UQ8AAjUBWXO9i8oAAAAASUVORK5CYII=") => {
        try {
            const thumb = localStorage.getItem('thumb_' + session + '_' + board);
            if(!thumb) {
                return defaultValue;
            } else return thumb;
        } catch (error) {
            console.warn(error);
            return defaultValue;
        }
    }
    
    return (
        <div className="tnwrapper">
        <img key={`tn_` + props.board} 
            className={`thumbnail ${props.board === props.currentBoard ? "active" : ""}`} 
            width="192" 
            height="108" 
            src={getThumbnail(props.sessionId, props.board)} 
            alt={'Board ' + props.board} 
            onClick={() => props.thumbnailClicked(props.board)}/>
        <span className={"boardnumbers"}>{props.board}</span></div>
    );
}
const MemoizedBoardThumbnail = React.memo(BoardThumbnail);
export default MemoizedBoardThumbnail;
