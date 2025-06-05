import React, {useState} from 'react';
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import * as Icon from 'react-bootstrap-icons';
import { TOOLS } from "../../constants.js";

const ComplexToolMenuItem = (props) => {
    const { [props.tool.icon]: SelectedIcon } = Icon
    return (
        <Dropdown.Item
            key={props.tool.name}
            className={props.currentTool.name === props.tool.name ? 'active' : null}
            onClick={() => {
                props.selectedCallback(props.tool);
            }}
        >
            <SelectedIcon/> {props.tool.label}
        </Dropdown.Item>
    )
}

const SimpleToolMenuItem = (props) => {
    const { [props.tool.icon]: SelectedIcon } = Icon
    return (
        <Button
            key={props.tool.name}
            size={props.compact ? "sm" : ""}
            title={props.tool.label}
            className={props.currentTool.name === props.tool.name ? 'active' : null}
            onClick={() => { props.selectedCallback(props.tool)}}
        >
            <SelectedIcon/> {props.compact ? "" : props.tool.label}
        </Button>
    )
}

const ToolMenu = (props) => {

    return (
        <>
        { props.complexUi && <Dropdown className="me-2" size={props.size}>
            <Dropdown.Toggle title="Select tool" size={props.size}>
                <Icon.Tools /> {props.currentTool.label}
            </Dropdown.Toggle>
            <Dropdown.Menu>
                {Object.values(TOOLS).map((tool) => (
                    <ComplexToolMenuItem key={tool.name} tool={tool} currentTool={props.currentTool} selectedCallback={props.selectedCallback}>
                    </ComplexToolMenuItem>
                ))}
            </Dropdown.Menu>
        </Dropdown> }
        { !props.complexUi && <span className="me-2">
            {Object.values(TOOLS).filter((tool) => tool.simple).map((tool) => (
                <SimpleToolMenuItem key={tool.name} tool={tool} currentTool={props.currentTool} compact={props.size === 'sm'} selectedCallback={props.selectedCallback}>
                </SimpleToolMenuItem>
            ))}
        </span>}
        </>
    );
}
const MemoizedToolMenu = React.memo(ToolMenu);
export default MemoizedToolMenu;
