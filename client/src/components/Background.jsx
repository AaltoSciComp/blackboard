import React from 'react';
import { Rect } from 'react-konva';
import { useAtomValue } from "jotai";
import { currentBoardAtom } from "../atoms.js";


const Background = React.forwardRef(({ stageSize, bgProps, boardSettings }, ref) => {
    const currentBoard = useAtomValue(currentBoardAtom);

    return (
        <Rect id="bgrect" ref={ref} 
            listening={false}
            x={0} 
            y={0} 
            width={stageSize.width} 
            height={stageSize.height} 
            fill={boardSettings.settings?.bg?.visible && bgProps[currentBoard]?.blobsrc ? null : boardSettings.color} 
            strokeEnabled={false} 
            fillPatternImage={bgProps[currentBoard]?.image}
            fillPatternScaleX={stageSize.width ? stageSize.width / (bgProps[currentBoard]?.x ? bgProps[currentBoard].x : 1) : 1}
            fillPatternScaleY={stageSize.height ? stageSize.height / (bgProps[currentBoard]?.y ? bgProps[currentBoard].y : 1) : 1}
        ></Rect>
        )
});

export default Background;
