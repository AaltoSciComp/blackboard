import React, {useState, useEffect, useCallback} from 'react';
import Dropdown from "react-bootstrap/Dropdown";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import CloseButton from 'react-bootstrap/CloseButton'
import { HexColorPicker } from 'react-colorful';
import * as Icon from 'react-bootstrap-icons';
import tinycolor from 'tinycolor2';
import { rgb2hex } from "../../Utils.js";
import { displayError } from "../ToastDisplay.jsx";
import { COLOR_OPTIONS, DEFAULT_SHAPE_STROKE } from "../../constants.js";
import { getUsedColors } from '../../Utils.js';

const LineColorMenu = (props) => {
    
    const [menuOpen, setMenuOpen] = useState(false);
    const [colorDisabled, setColorDisabled] = useState(props.colorProp.enabled ? false : true);
    const [darkMenu, setDarkMenu] = useState(tinycolor(props.boardColor).isDark());
    const [strokeColors, setStrokeColors] = useState([DEFAULT_SHAPE_STROKE]);

    useEffect(() => {
        async function cb() {
            const clrs = await getUsedColors('stroke', props.sid).catch(err => displayError(err + ' while getting colors used'));
            if(Array.isArray(clrs?.colors)) setStrokeColors(clrs?.colors);    
        }
        if (props.sid > 0) cb();
    }, [props.sid]);

    // We need to tell this component that color is re-enabled when switching to simple mode
    // as this command originates from outside the component (chalkboard.js).
    // Without this, (local) colorDisabled stays on even when stroke color is enabled.
    // TODO: find a cleaner way to do this...
    useEffect(() => {
        if(!props.ui.complex && props.mode === 'Stroke') setColorDisabled(false);
    }, [props.ui, props.mode]);

    // Cache board background color type for performance
    useEffect(() => {
        setDarkMenu(tinycolor(props.boardColor).isDark());
    }, [props.boardColor]);

    /**
     * Handle changing the line color. Set save to true to update fill colors in menu.
     * NOTE: the color argument is an object like {color: '#000000', enabled: true}
     */
    /*const handleShapeColorChange = useCallback(async (mode, color, save=false) => {
        const adjustingFill = mode === 'fill';
        if(!color.color) {
            throw new Error('Stroke color missing!');
        }
        setStroke(color);
        if(save) {
            const clrs = await getUsedColors(adjustingFill ? 'fill' : 'stroke').catch(err => displayError(err + ' while getting colors used'));
            if(Array.isArray(clrs.colors)) adjustingFill ? setFillColors(clrs.colors) : setStrokeColors(clrs.colors);

            // Remove duplicates from used colors
            if(!strokeColors.includes(color.color)) {
                //console.info(color + ' not included yet')
                const colors = strokeColors.concat(color.color);
                setStrokeColors(colors);
            }
        }
    }, [fillColors, strokeColors]);*/
    
    const menuIcon = useCallback((m) => {
        if(props.colorProp.color === 'wipe') {
            return <Icon.DashSquare color={props.boardColor}/>;
        } else {
            if(colorDisabled) {
                return <Icon.XSquare color={props.colorProp.color}/>;
            } else {
                return <Icon.CircleSquare color={props.colorProp.color}/>;
            }
        }
    }, [colorDisabled, props.colorProp.color]);

    const shapeColorOptions = COLOR_OPTIONS.map((color) => {
        return (tinycolor.isReadable(color, props.boardColor,{level:"AA",size:"large"})) ? <Button key={`sc_` + props.mode + color} className={(darkMenu ? `btn-dark` : `btn-light`) + ` picker__swatch`} style={{ background: color }} onClick={() => handleSave(color, false)} /> : null;
    });

    const usedShapeColors = strokeColors.map((color) =>
        <Button key={`usc_` + props.mode + color} className={(darkMenu ? `btn-dark` : `btn-light`) + ` picker__swatch`} style={{ background: color }} onClick={() => handleSave(color, false)}>{tinycolor.isReadable(color, props.boardColor,{level:"AA",size:"large"}) ? '' : '!'}</Button>
    );

    const handleToggle = (e) => {
        if(menuOpen){
            // Save selected color when closing the menu
            props.handleShapeColorChange('stroke', {color: props.colorProp.color, enabled: !colorDisabled}, true);
            // Use small timeout so we don't immediately open the menu again
            setTimeout(() => {
                setMenuOpen(false);
            }, 100);
        } else setMenuOpen(true);
    }

    const handleSave = (a, close=false) => {
        props.handleShapeColorChange('stroke', {color: a, enabled: !colorDisabled});
        if(close) handleToggle();
    }

    const toggleColorDisabled = (e) => {
        props.handleShapeColorChange('stroke', {color: props.colorProp.color, enabled: !e});
        setColorDisabled(e);
    }

    const openEyeDropper = (e) => {
        if (typeof window === 'undefined' || !('EyeDropper' in window)) {
            console.error('Your browser does not support the EyeDropper API');
            return;
        }
        // Need to disable eslint as EyeDropper is not found at compilation phase
        // eslint-disable-next-line
        const eyeDropper = new EyeDropper();
        
        // Abortcontroller should be able to cancel the EyeDropper, but does not seem to...
        // Using EyeDropper only in mouse use, as with touch it seems broken
        /*const abortController = new AbortController();

        setTimeout(() => {
            abortController.abort('Eyedropper timed out');
        }, 1000);*/

        eyeDropper.open(/*{ signal: abortController.signal }*/).then(result => {
            // Color might be in rgb format, so we need to convert it to hex
            let color = result.sRGBHex;
            if(color.length > 7) color = rgb2hex(color);
            if(color) {
                props.handleShapeColorChange('stroke', {color: color, enabled: !colorDisabled});
            }
        }).catch(e => {
            console.error(e);
        });
    }

    return (
    <Dropdown show={menuOpen} onToggle={handleToggle} size={props.wideUI ? "" : "sm"}>
        <Dropdown.Toggle size={props.wideUI ? "" : "sm"} title={'Set line color'}>
            {props.wideUI ? 'Line c' : null} {menuIcon(props.mode)} {/*<span key={'toggle-' + props.mode} className={colorDisabled ? 'colorbox disabled' : 'colorbox'} style={{ height: '16px', backgroundColor: (props.colorProp.color === 'wipe' ? 'transparent' : props.colorProp.color) }}>{props.colorProp.color === 'wipe' && <Icon.PatchMinus />}</span>*/ }
        </Dropdown.Toggle>
        <Dropdown.Menu rootCloseEvent="pointerdown" style={{minWidth: "232px", backgroundColor: props.boardColor}} className={darkMenu ? "darkmenu" : null}>
            <CloseButton onClick={handleToggle} className="float-end" variant={darkMenu ? "white" : null}/>
            <Form.Label className={darkMenu ? "text-light ms-1" : "ms-1"}>{'Line color:'} {colorDisabled ? 'none' : props.stroke.color}</Form.Label>
            { props.ui?.complex && <Form.Check type="checkbox" id={'disable-' + props.mode} label={'Disable line'} onChange={(e) => (toggleColorDisabled(e.target.checked))} checked={colorDisabled || false}></Form.Check>}
            {!colorDisabled && props.ui.complex && <HexColorPicker key={'picker-' + props.mode} className="mb-3 mt-3" color={props.colorProp.color} onChange={handleSave} />}
            {!colorDisabled && <>
            <Button key={`usc_wipe_` + props.mode} className={`btn mb-1 w-50` + (darkMenu ? ` btn-dark` : ` btn-light`)} style={{backgroundColor: props.boardColor}} onClick={() => handleSave('wipe', false)}><Icon.PatchMinus /> Eraser</Button>
            { props.ui?.mouse && <Button onClick={openEyeDropper} className={`btn mb-1 w-50` + (darkMenu ? ` btn-dark` : ` btn-light`)} disabled={!window.EyeDropper}><Icon.Eyedropper /> Pick</Button>}
            <p style={{marginBottom: "0px"}}>Used in this presentation:</p>
            {usedShapeColors}
            </>}
            {!colorDisabled && <Dropdown.Divider/>}
            {!colorDisabled && 
                <><p style={{marginBottom: "0px"}}>Suggestions:</p>
                {shapeColorOptions}
            </>}
            {!colorDisabled && <div className="mt-2" style={{backgroundColor: props.boardColor, minHeight: "60px"}}>
                <>
                <h1 style={{color: props.stroke.color, padding: "10px"}}>Sample<span className="samplebox" style={{backgroundColor: props.fill.color, border: 'solid 3px ' + props.stroke.color}}></span></h1>
                </>
            </div>}
        </Dropdown.Menu>
    </Dropdown>
);
}
const MemoizedLineColorMenu = React.memo(LineColorMenu);
export default MemoizedLineColorMenu;
