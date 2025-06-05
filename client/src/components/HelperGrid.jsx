import React, {useState, useEffect} from 'react';
import { Line } from "react-konva";

const HelperGrid = (props) => {

    const [gridCoords, setGridCoords] = useState([]);
    
    const gridLines = gridCoords.map((coord) => {
        return (
            <Line 
                key={'y'+coord.y+'x'+coord.x}
                x={coord.x}
                y={coord.y}
                points={[0, 0, coord.x ? 0 : props.stageSize.width, coord.y ? 0 : props.stageSize.height]}
                stroke={props.gridProperties?.stroke ?? '#fff'}
                strokeWidth={Number(props.gridProperties?.strokeWidth * props.stageSize.width * 0.01) || 0.1}
                strokeEnabled={true}
                opacity={Number(props.gridProperties?.opacity) || 0.5}
                listening={false}
            />
        )
    })
    
    useEffect(() => {
        let coords = [];
        if(!props.stageSize.height || !props.stageSize.width) return (<></>);

        let numVCells = props.stageSize.height / props.gridBlockSize.y;
        let numHCells = props.stageSize.width / props.gridBlockSize.x;

        for(var h = 1; h <= numVCells; h++) {
            coords.push({x: 0, y: h * props.gridBlockSize.y});
        }
        for(var w = 1; w <= numHCells; w++) {
            coords.push({x: w * props.gridBlockSize.x, y: 0});
        }
        setGridCoords(coords);
    }, [props.gridBlockSize, props.gridProperties]);
    
    return (
        <>
        {gridLines}
        </>
    );
}
const MemoizedHelperGrid = React.memo(HelperGrid);
export default MemoizedHelperGrid;
