import React, {useState, useEffect} from 'react';
import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import * as Icon from 'react-bootstrap-icons';
import { HexColorPicker } from 'react-colorful';
import { shallowEqual } from '../../Utils';

const HelperGridMenu = (props) => {
    const [optionsWhenOpened, setOptionsWhenOpened] = useState(props.grid);

    const handleSave = (state, t) => {
        if(state === true) {
            setOptionsWhenOpened(props.grid);
        }
        // When menu is closed, check if we actually changed any settings before sending request to server
        if(state === false) {
            if(!shallowEqual(optionsWhenOpened, props.grid)) {
                props.handleBoardSettingsSave();
            }
        }
    }

    return (
        <Dropdown as={ButtonGroup} onToggle={(e, t) => handleSave(e, t)} className="me-2">
        <Button 
            variant={props.grid.visible ? 'primary' : 'secondary'} 
            size={props.wideUI ? "" : "sm"} 
            title="Turn grid on/off" 
            onClick={(e) => {props.setBoardProperty('grid','visible', props.grid.visible ? false : true)}}>
            <Icon.Grid3x3 />
        </Button>
    
        <Dropdown.Toggle split variant="primary" id="dropdown-split-basic" title="Adjust grid settings" size={props.wideUI ? "" : "sm"} />
    
        <Dropdown.Menu style={{minWidth: "300px"}}>
        <p>Grid properties</p>
        <Form.Check 
            type="checkbox" 
            id="presenttoviewers" 
            label="Show in presentation" 
            className="text-dark" 
            onChange={(e) => {props.setBoardProperty('grid','present', e.target.checked ? true : false)}} 
            checked={props.grid.present || false}>
        </Form.Check>
        {props.complex && 
            <Form.Check 
                type="checkbox" 
                id="snaptogrid" 
                label="Snap to grid" 
                className="text-dark" 
                onChange={(e) => {props.setBoardProperty('grid','snap', e.target.checked ? true : false)}} 
                checked={props.grid.snap || false}>
            </Form.Check>
        }
        <Form.Check 
            type="checkbox" 
            id="squaregrid" 
            label="Try to keep square*" 
            title="Shape on viewer end depends on aspect ratio" 
            className="text-dark" 
            onChange={(e) => {props.setBoardProperty('grid','square', e.target.checked ? true : false)}} 
            checked={props.grid.square || false}>
        </Form.Check>
        <p className="mt-3">Quick grid size setup</p>
        <ButtonGroup className="mb-2">
            {[2, 4, 5, 10, 12.5, 25].map((value) => (
                <Button
                    key={value}
                    variant="primary" 
                    size={props.wideUI ? "" : "sm"} 
                    title={`Set grid cell width to ${value}% of screen width`} 
                    onClick={() => {props.setBoardProperty('grid','cellWidth', value);}}>
                    {value}%
                </Button>
            ))}
        </ButtonGroup>
        <hr/>
        <Form.Label>Horizontal gap, % of width: {props.grid.cellWidth}</Form.Label>
        <Form.Range 
            value={props.grid.cellWidth} 
            min={0.5} max={50} step={0.1} 
            onChange={(e) => {props.setBoardProperty('grid','cellWidth', Number(e.target.value))}}
        />
        <Form.Label>Vertical gap, % of height: {props.grid.cellHeight}</Form.Label>
        <Form.Range 
            value={props.grid.cellHeight} 
            min={0.5} max={50} step={0.1} 
            onChange={(e) => {props.setBoardProperty('grid','cellHeight', Number(e.target.value))}}
        />
        <Form.Label>Grid line width (% of width): {props.grid.strokeWidth}</Form.Label>
        <Form.Range 
            value={props.grid.strokeWidth} 
            min={0.01} max={1} step={0.03} 
            onChange={(e) => {props.setBoardProperty('grid','strokeWidth', Number(e.target.value))}}
        />
        <Form.Label>Grid opacity: {props.grid.opacity}</Form.Label>
        <Form.Range 
            value={props.grid.opacity} 
            min={0.05} max={1} step={0.05} 
            onChange={(e) => {props.setBoardProperty('grid','opacity', Number(e.target.value))}}
        />
        <Form.Label>Grid color: {props.grid.stroke}</Form.Label>
        <HexColorPicker key={'picker-grid'} className="mb-3 mt-3" color={props.grid.stroke} 
            onChange={(e) => { 
                props.setBoardProperty('grid','stroke', e) 
            }}
        />
        </Dropdown.Menu>
    </Dropdown>
);
}
const MemoizedHelperGridMenu = React.memo(HelperGridMenu);
export default MemoizedHelperGridMenu;
