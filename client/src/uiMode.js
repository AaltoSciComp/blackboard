export function getSimpleModeUpdates(currentTool, fill, stroke, ui, drawTool) {
    return {
        tool: currentTool.simple ? null : drawTool,
        fill: fill.enabled ? { ...fill, enabled: false } : null,
        stroke: stroke.enabled ? null : { ...stroke, enabled: true },
        ui: { ...ui, complex: false },
    };
}