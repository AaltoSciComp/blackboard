import React, {useState} from 'react';
import Dropdown from "react-bootstrap/Dropdown";
import Col from "react-bootstrap/Col";
import FloatingLabel from "react-bootstrap/FloatingLabel";
import FormControl from "react-bootstrap/FormControl";
import Form from "react-bootstrap/Form";
import CloseButton from 'react-bootstrap/CloseButton'
import * as Icon from 'react-bootstrap-icons';

const LineWidthMenu = (props) => {

    const [menuOpen, setMenuOpen] = useState(false);

    /**
     * Default line width options, in percentages of the screen width.
     */
    const widthOptions = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3, 4, 5, 7.5, 10, 15].map((width) =>
        <Dropdown.Item onClick={() => handleSave(width, true)} style={{padding: "2px"}} key={width} eventKey={width} as="button"><span className="colorbox" style={{ width: (props.stageSize.width * width * 0.01) }}></span> {width}</Dropdown.Item>
    );

    const handleToggle = (e) => {
        if(menuOpen){
            // Use small timeout so we don't immediately open the menu again
            setTimeout(() => {
                setMenuOpen(false);
            }, 100);
        } else setMenuOpen(true);
    }

    const handleSave = (a, close) => {
        props.handleStrokeWidthChange(a);
        if(close) handleToggle();
    }

    return (
        <Dropdown show={menuOpen} onToggle={handleToggle} size={props.wideUI ? "" : "sm"}>
        <Dropdown.Toggle title="Set line width" size={props.wideUI ? "" : "sm"}>
            <Icon.BorderWidth /> {(props.wideUI && !props.ui.complex) && "Line width: "} {props.width}
        </Dropdown.Toggle>
        <Dropdown.Menu rootCloseEvent="pointerdown" style={{minWidth: "232px"}}>

    {/*<DropdownButton 
        rootCloseEvent="pointerdown"
        autoClose="outside"
        id="width-button" 
        title={<><Icon.BorderWidth /> {props.lineProperties.width}</>} 
    onSelect={(e) => props.handleStrokeWidthChange(e)}>*/}
            <CloseButton onClick={handleToggle} className="float-end"/>
            {props.ui.complex && <Col xs={10}>
            <FloatingLabel label="Line width">
                <FormControl
                    className="mb-2"
                    type="number"
                    step="0.1"
                    size="3"
                    min="0.05"
                    value={props.width}
                    onChange={(e) => props.handleStrokeWidthChange(e.target.value)}
                />
            </FloatingLabel>
            </Col>}
            {!props.ui.complex && <div>Line width</div>}
            <small>(% of board width)</small>
            {props.ui.complex && <Form.Range value={props.width} min={0.05} max={15} step={0.05} onChange={(e) => props.handleStrokeWidthChange(e.target.value)}/>}
            {props.ui.complex && widthOptions}
            {!props.ui.complex && <>
            <Dropdown.Item onClick={() => handleSave(0.05, true)}><span className="colorbox" style={{ width: (props.stageSize.width * 0.0005) }}></span> Ultra thin (0.05)</Dropdown.Item>
            <Dropdown.Item onClick={() => handleSave(0.15, true)}><span className="colorbox" style={{ width: (props.stageSize.width * 0.0015) }}></span> Thin (0.15)</Dropdown.Item>
            <Dropdown.Item onClick={() => handleSave(0.25, true)}><span className="colorbox" style={{ width: (props.stageSize.width * 0.0025) }}></span> Regular (0.25)</Dropdown.Item>
            <Dropdown.Item onClick={() => handleSave(0.35, true)}><span className="colorbox" style={{ width: (props.stageSize.width * 0.0035) }}></span> Bold (0.35)</Dropdown.Item>
            <Dropdown.Item onClick={() => handleSave(0.5, true)}><span className="colorbox" style={{ width: (props.stageSize.width * 0.005) }}></span> Heavy (0.5)</Dropdown.Item>
            <Dropdown.Item onClick={() => handleSave(0.65, true)}><span className="colorbox" style={{ width: (props.stageSize.width * 0.0065) }}></span> Ultra (0.65)</Dropdown.Item>
            <Dropdown.Divider></Dropdown.Divider>
            <Dropdown.Item onClick={() => handleSave(2, true)}><span className="colorbox" style={{ width: (props.stageSize.width * 0.02) }}></span> Eraser small (2)</Dropdown.Item>
            <Dropdown.Item onClick={() => handleSave(5, true)}><span className="colorbox" style={{ width: (props.stageSize.width * 0.05) }}></span> Eraser large (5)</Dropdown.Item>
            </>}
        </Dropdown.Menu>
    </Dropdown>
);
}

const MemoizedLineWidthMenu = React.memo(LineWidthMenu);
export default MemoizedLineWidthMenu;
