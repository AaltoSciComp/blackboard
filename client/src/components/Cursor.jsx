import React from 'react';
import { Circle } from 'react-konva';

const Cursor = ({ ref, penLoc, cursor }) => {
    return (
        <Circle 
            ref={ref}
            x={penLoc.x} 
            y={penLoc.y} 
            visible={cursor.visible} 
            radius={cursor.radius}
            strokeEnabled={cursor.strokeEnabled} 
            stroke={cursor.stroke}
            fill={cursor.fill} 
            hitStrokeWidth={0} 
            shadowEnabled={false} 
            listening={false} 
            perfectDrawEnabled={false}>
        </Circle>
    )
};

export default Cursor;
