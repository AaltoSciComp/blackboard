import React, { useState, useCallback } from 'react';
import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";
import CloseButton from 'react-bootstrap/CloseButton'
import Button from "react-bootstrap/Button";
import * as Icon from 'react-bootstrap-icons';
import { HexColorPicker } from 'react-colorful';
import { COLOR_OPTIONS } from "../../constants.js";

const BoardColorMenu = (props) => {
    // Keep the state of original color when the dialog is opened so we don't save to db when no changes done
    const [colorWhenOpened, setColorWhenOpened] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    
    const boardColorOptions = COLOR_OPTIONS.map((color) =>
        <Button key={`bc_` + color} className="picker__swatch" style={{ background: color }} onClick={() => handleChange(color)} />
    );

    const usedBoardColors = props.boardColors.map((color) =>
        <Button key={`ubc_` + color} className="picker__swatch" style={{ background: color }} onClick={() => handleChange(color)} />
    );

    const handleToggle = (e, t) => {
        //console.info('Event:', e, 't:', t, 'Menu open:', menuOpen);
        if (menuOpen) {
            // Do DB update only if we really changed the color
            if(colorWhenOpened !== props.boardColor) {
                props.handleBoardSettingsSave();
            }
            // Use small timeout so we don't immediately open the menu again
            setTimeout(() => {
                setMenuOpen(false);
            }, 100);
        } else {
            setColorWhenOpened(props.boardColor);
            setMenuOpen(true);
        }
    };

    const handleChange = (e) => {
        //setMyColor(e);
        props.handleBoardColorChange(e)
    }

    return (
        <Dropdown show={menuOpen} onToggle={handleToggle} autoClose="outside" size={props.wideUI ? "" : "sm"}>
            <Dropdown.Toggle size={props.wideUI ? "" : "sm"} title="Set board color" >
                {props.wideUI ? 'Board c' : null} <Icon.EaselFill color={props.boardColor} /> {/*<span className="colorbox" style={{ height: '16px', backgroundColor: props.boardColor }}></span>*/}
            </Dropdown.Toggle>

            <Dropdown.Menu rootCloseEvent="pointerdown">
                <CloseButton onClick={handleToggle} className="float-end"/>
                <Form.Label className="text-dark ms-1">Board color: {props.boardColor}</Form.Label>

                <HexColorPicker className="mb-2" color={props.boardColor} onChange={handleChange} />
                <p className="text-dark small" style={{marginBottom: "0px"}}>Used colors:</p>
                {usedBoardColors}
                <Dropdown.Divider/>
                <p className="text-dark small" style={{marginBottom: "0px"}}>Default palette:</p>
                {boardColorOptions}
                <div className="mt-2" style={{backgroundColor: props.boardColor}}>
                    <h1 style={{color: props.shapeColor, padding: "10px"}}>Sample</h1>
                </div>
            </Dropdown.Menu>
        </Dropdown>
);
}
const MemoizedBoardColorMenu = React.memo(BoardColorMenu)
export default MemoizedBoardColorMenu;
