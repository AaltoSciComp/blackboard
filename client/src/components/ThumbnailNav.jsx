import React, { useState } from 'react';
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import CloseButton from 'react-bootstrap/CloseButton'
import InputGroup from "react-bootstrap/InputGroup";
import FormControl from "react-bootstrap/FormControl";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import * as Icon from 'react-bootstrap-icons';
import MemoizedBoardThumbnail from './BoardThumbnail';
import { useAtomValue } from "jotai";
import { currentBoardAtom } from "../atoms.js";

const ThumbnailNav = (props) => {
    const currentBoard = useAtomValue(currentBoardAtom);

    const [localOffset, setLocalOffset] = useState(0);
    const [menuOpen, setMenuOpen] = useState(false);

    /**
     * Navigation logic within grid menu.
     * Local offset is used to allow user to navigate between pages
     * without affecting the viewers' screens
     */
    const prevGrid = () => {
        if(localOffset + props.boardLimits.from > props.numBoards) {
            setLocalOffset(localOffset - props.numBoards);
        } else {
            setLocalOffset(props.numBoards - props.boardLimits.to);
        }
    }

    const nextGrid = () => {
        setLocalOffset(localOffset + props.numBoards);
    }
    
    const Icon4x4Svg = () => {
        return (<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px"
                width="16px" height="16px" viewBox="0 0 16 16">
           <path fill="#FFFFFF" d="M1,1.8C1,1.4,1.3,1,1.8,1h1.5C3.6,1,4,1.4,4,1.8v1.5C4,3.7,3.6,4,3.2,4H1.8C1.3,4,1,3.7,1,3.2V1.8z M4.7,1.8
               C4.7,1.4,5,1,5.4,1h1.5c0.4,0,0.7,0.3,0.7,0.7v1.5C7.7,3.7,7.3,4,6.9,4H5.4C5,4,4.7,3.7,4.7,3.2V1.8z M8.4,1.8C8.4,1.4,8.7,1,9.1,1
               h1.5c0.4,0,0.7,0.3,0.7,0.7v1.5C11.3,3.7,11,4,10.6,4H9.1C8.7,4,8.4,3.7,8.4,3.2V1.8z M12,1.8C12,1.4,12.4,1,12.8,1h1.5
               C14.7,1,15,1.4,15,1.8v1.5C15,3.7,14.7,4,14.3,4h-1.5C12.4,4,12,3.7,12,3.2V1.8z M12,5.4c0-0.4,0.3-0.7,0.7-0.7h1.5
               C14.7,4.7,15,5,15,5.4v1.5c0,0.4-0.3,0.7-0.7,0.7h-1.5c-0.4,0-0.7-0.3-0.7-0.7V5.4z M12,9.1c0-0.4,0.3-0.7,0.7-0.7h1.5
               c0.4,0,0.7,0.3,0.7,0.7v1.5c0,0.4-0.3,0.7-0.7,0.7h-1.5c-0.4,0-0.7-0.3-0.7-0.7V9.1z M12,12.8c0-0.4,0.3-0.7,0.7-0.7h1.5
               c0.4,0,0.7,0.3,0.7,0.7v1.5c0,0.4-0.3,0.7-0.7,0.7h-1.5c-0.4,0-0.7-0.3-0.7-0.7V12.8z M8.4,12.8c0-0.4,0.3-0.7,0.7-0.7h1.5
               c0.4,0,0.7,0.3,0.7,0.7v1.5c0,0.4-0.3,0.7-0.7,0.7H9.2c-0.4,0-0.7-0.3-0.7-0.7V12.8z M4.7,12.8C4.7,12.3,5,12,5.4,12h1.5
               c0.4,0,0.7,0.3,0.7,0.7v1.5c0,0.4-0.3,0.7-0.7,0.7H5.4c-0.4,0-0.7-0.3-0.7-0.7V12.8z M1,12.8C1,12.3,1.4,12,1.8,12h1.5
               C3.7,12,4,12.3,4,12.8v1.5C4,14.6,3.7,15,3.2,15H1.8C1.4,15,1,14.6,1,14.2V12.8z M1,5.5C1,5,1.3,4.7,1.8,4.7h1.5C3.6,4.7,4,5,4,5.5
               v1.5c0,0.4-0.3,0.7-0.7,0.7H1.8C1.3,7.7,1,7.3,1,6.9V5.5z M4.7,5.5C4.7,5,5,4.7,5.4,4.7h1.5c0.4,0,0.7,0.3,0.7,0.7v1.5
               c0,0.4-0.3,0.7-0.7,0.7H5.4C5,7.7,4.7,7.3,4.7,6.9V5.5z M8.4,5.5c0-0.4,0.3-0.7,0.7-0.7h1.5c0.4,0,0.7,0.3,0.7,0.7v1.5
               c0,0.4-0.3,0.7-0.7,0.7H9.1c-0.4,0-0.7-0.3-0.7-0.7V5.5z M1,9.1c0-0.4,0.3-0.7,0.7-0.7h1.5C3.6,8.4,4,8.7,4,9.1v1.5
               c0,0.4-0.3,0.7-0.7,0.7H1.8C1.3,11.4,1,11,1,10.6V9.1z M4.7,9.1c0-0.4,0.3-0.7,0.7-0.7h1.5c0.4,0,0.7,0.3,0.7,0.7v1.5
               c0,0.4-0.3,0.7-0.7,0.7H5.4c-0.4,0-0.7-0.3-0.7-0.7V9.1z M8.4,9.1c0-0.4,0.3-0.7,0.7-0.7h1.5c0.4,0,0.7,0.3,0.7,0.7v1.5
               c0,0.4-0.3,0.7-0.7,0.7H9.1c-0.4,0-0.7-0.3-0.7-0.7V9.1z"/>
           </svg>);
    }

    const gridIcon = (b) => {
        switch(b) {
            case 1:
                return <Icon.SquareFill/>;
            case 2:
                return <Icon.HddStackFill/>;
            case 4:
                return <Icon.GridFill/>;
            case 9:
                return <Icon.Grid3x3GapFill/>;
            case 16:
                // No 4x4 icon available, so we fake our own...
                return Icon4x4Svg();
            default:
                return <Icon.SquareFill/>;
        }
    }

    /**
     * 
     * @param {*} board board id that was clicked
     * 
     * We need to reset local offset when user makes a selection
     */
    const thumbnailClicked = (board) => {
        if(props.busyPainting) return;
        setLocalOffset(0);
        props.changeBoard(board);
    }
    
    // Sequence generator function (commonly referred to as "range", e.g. Clojure, PHP etc)
    const range = (start, stop, step) => Array.from({ length: (stop - start) / step + 1}, (_, i) => start + (i * step));

    const boardThumbnails = range(localOffset + props.boardLimits?.from || 1,localOffset + props.boardLimits?.to || 1,1).map((board) =>
        <MemoizedBoardThumbnail key={board} sessionId={props.sessionId} board={board} thumbnailClicked={thumbnailClicked} currentBoard = {currentBoard} />
    );

    const GridSelectButton = ({bds}) => {
        return(
            <Button title={'Present ' + bds + ' boards at once'} className="flex-fill" variant="primary" onClick={() => {props.reConfigureBoards(bds)}} disabled={props.numBoards === bds ? true : false}>{gridIcon(bds)}</Button>
        )
    }
    
    const handleToggle = (e, t) => {
        if(menuOpen){
            // Use small timeout so we don't immediately open the menu again
            setTimeout(() => {
                setMenuOpen(false);
            }, 100);
        } else {
            setMenuOpen(true);
        }
    }

    return (
    <ButtonGroup className="me-2">
        <Button size={props.wideUI ? "" : "sm"} title="Go to first board" id="first" onClick={() => props.navigateBoard('first')} disabled={props.busyPainting ? true : false}><Icon.ChevronBarLeft /></Button>
        <Button size={props.wideUI ? "" : "sm"} title="Go to previous board" id="backward" onClick={() => props.navigateBoard('previous')} disabled={props.busyPainting ? true : false}><Icon.ChevronLeft /></Button>
        <Dropdown show={menuOpen} onToggle={handleToggle} className={"width-" + props.numBoards} >
        <Dropdown.Toggle size={props.wideUI ? "" : "sm"} title="Navigate and set the size of boards grid for viewers" >
            {props.busyFetching ? <span className="spinner-border spinner-border-sm"></span> : gridIcon(props.numBoards)} {currentBoard}
        </Dropdown.Toggle>
        <Dropdown.Menu rootCloseEvent="pointerdown">
            <Row className="d-flex">
            <InputGroup className="w-50">
            <InputGroup.Text>Board:</InputGroup.Text>
            <FormControl type="number"
                placeholder="board"
                size="3"
                id="boardinput"
                min={1}
                value={currentBoard}
                onChange={(e) => props.changeBoard(e.target.value)}
            />
            </InputGroup>
            <span className="w-50">
            <span className="d-flex">
            <GridSelectButton bds={1} />
            <GridSelectButton bds={2} />
            <GridSelectButton bds={4} />
            <GridSelectButton bds={9} />
            <GridSelectButton bds={16} />
            <CloseButton onClick={handleToggle} className="ms-2"/>
            </span>
            </span>
            </Row>
            <Row className="g-1 mt-1">
                <Col style={{ width: '40px' }}>
                    <Button title="Previous boards" variant="primary" className="h-100" onClick={prevGrid}><Icon.CaretLeft /></Button>
                </Col>
                <Col className={'tn-' + props.numBoards}>
                    {boardThumbnails}
                </Col>
                <Col style={{ width: '40px' }}>
                    <Button title="Next boards" variant="primary" className="h-100" onClick={nextGrid}><Icon.CaretRight /></Button>
                </Col>
            </Row>
            </Dropdown.Menu>
        </Dropdown>
        <Button size={props.wideUI ? "" : "sm"} title="Go to next board" id="forward" onClick={() => props.navigateBoard('next')} disabled={props.busyPainting ? true : false}><Icon.ChevronRight /></Button>
        <Button size={props.wideUI ? "" : "sm"} title="Go to last board" id="last" onClick={() => props.navigateBoard('last')} disabled={props.busyPainting ? true : false}><Icon.ChevronBarRight /> {props.boardLimits?.end || 1}</Button>
    </ButtonGroup>
     );
}
const MemoizedThumbnailNav = React.memo(ThumbnailNav);
export default MemoizedThumbnailNav;
