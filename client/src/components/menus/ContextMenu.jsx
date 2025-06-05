import React from "react";
import "./ContextMenu.css";

export const getContextMenuOptions = (target, stroke, fill) => {
  let commonOptions = [
      {id: "clone", title: "Clone"},
      {id: "send_to_back", title: "Send to back"},
      {id: "bring_to_front", title: "Bring to front"},
      {id: "delete", title: "Delete"}
  ]

  const haveStrokeInUI = (stroke.enabled && stroke.color !== 'wipe');
  const haveFillInUI = (fill.enabled && fill.color !== 'wipe');
  
  if(target.attrs.name !== 'Dot') {
      if(typeof target.fillEnabled === "function") {
          if(target.fillEnabled()) {
              if(haveFillInUI && (target.fill() !== fill.color)) {
                  commonOptions.push({id: "add_fill", title: "Add/recolor fill"});
              }
              if(target.strokeEnabled()) {
                  // Only offer to remove fill if there is a stroke
                  commonOptions.push({id: "remove_fill", title: "Remove fill"});
              }
          } else {
              if(haveFillInUI) commonOptions.push({id: "add_fill", title: "Add/recolor fill"});
          }
      }
      if(typeof target.strokeEnabled === "function") {
          if(target.strokeEnabled()) {
              if(haveStrokeInUI && (target.stroke() !== stroke.color)) {
                  commonOptions.push({id: "recolor_stroke", title: "Recolor stroke"});
              }
              if(target.fillEnabled()) {
                  // Only offer to remove stroke if there is a fill
                  commonOptions.push({id: "remove_stroke", title: "Remove stroke"});
              }
          } else {
              if(haveStrokeInUI) commonOptions.push({id: "add_stroke", title: "Add/recolor stroke"});
          }
      }
  }

  let result;
  switch(target.attrs.name) {
      case 'Line':
      case 'Polyline':
              if(target.bezier()) {
              commonOptions.push({id: "remove_bezier", title: "Remove smoothing"});
          } else {
              commonOptions.push({id: "add_bezier", title: "Add smoothing"});
          }
          if(target.closed() && target.strokeEnabled()) {
              // Only offer open path if stroke is enabled to prevent shape disappearing
              commonOptions.push({id: "open_path", title: "Open path"});
          } else {
              commonOptions.push({id: "close_path", title: "Close path"});
          }
          result = commonOptions.concat({id: "change_stroke_width", title: "Apply current line width"});
          break;
      case 'Arrow':
      case 'Ellipse':
      case 'Circle':
      case 'Rect':
          result = commonOptions.concat({id: "change_stroke_width", title: "Apply current line width"});
              break;
      case 'Dot':
          if(haveStrokeInUI & (target.fill() !== stroke.color)) {
              commonOptions.push({id: "recolor", title: "Recolor dot"});
          }
          result = commonOptions.concat({id: "change_dot_size", title: "Apply current line width"});
          break;
      case 'Grid':
          result = commonOptions;
          break;
      default:
          return {id: "cancel", title: "Cancel (unsupported shape type)"};
  }
  return result.concat({id: "cancel", title: "Cancel"});
}

const OptionRows = ({handleOptionSelected, options}) => {
    const rows = options.length ? options : [];
    return (
        rows.map(row => 
            <li key={row.id} onClick={handleOptionSelected(row.id)}>{row.title}</li>
        )
    )
}

export const ContextMenu = ({ position, options, onOptionSelected }) => {
  const dialogHeight = (options.length * 34) + 5; // TODO: do not hardcode menuitem height
  const top = (window.innerHeight - position.y) < dialogHeight ? (window.innerHeight - dialogHeight) : position.y;
  const left = (window.innerWidth - position.x) < 250 ? window.innerWidth - 250 : position.x; // TODO: no hardcoding

  const handleOptionSelected = option => () => onOptionSelected(option);

  return (
    <div
      className="ctxmenu"
      style={{
        position: "absolute",
        left: left,
        top: top
      }}
    >
    <ul>
        <OptionRows handleOptionSelected={handleOptionSelected} options={options}/>
    </ul>
    </div>
  );
};