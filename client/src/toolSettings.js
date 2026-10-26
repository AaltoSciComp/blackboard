export function getToolSettingsUpdates(newTool, lineProperties, savedBezier) {
    let updatedLineProperties = null;

    if (newTool.name === 'Line') {
        updatedLineProperties = {
            ...lineProperties,
            bezier: savedBezier === null ? true : savedBezier === 'true',
        };
    } else if (newTool.name === 'Polyline') {
        updatedLineProperties = { ...lineProperties, bezier: false };
    }

    return {
        lineProperties: updatedLineProperties,
        snapToGrid: newTool.name === 'Grid',
    };
}