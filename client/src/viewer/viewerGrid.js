/**
 * Helper grid rendering spec for the presentation viewer, extracted from the
 * inline viewer script (drawGrid) so it can be unit tested. The React
 * presenter app renders its own grid with components/HelperGrid.jsx using
 * the same semantics (cell width/height are percentages of board size); the
 * viewer has its own Konva code path because it draws many boards at once
 * without React.
 */

export function getViewerHelperGridSpec(layerWidth, layerHeight, settings) {
    const cellWidth = settings.cellWidth || 38;
    const cellHeight = settings.cellHeight || 20;
    // hSpacing: vertical spacing between horizontal lines; vSpacing: horizontal
    // spacing between vertical lines (both in pixels)
    const hSpacing = layerHeight * cellHeight * 0.01;
    const vSpacing = layerWidth * cellWidth * 0.01;

    const numVCells = layerHeight / hSpacing;
    const numHCells = layerWidth / vSpacing;

    // Each line is drawn from (x, y) with Konva-relative points. Note: the
    // original inline viewer drew vertical lines layerWidth long (copy-paste
    // bug); they are now the correct layerHeight, matching HelperGrid.jsx
    // used by the presenter app.
    const lines = [];
    for (let h = 1; h <= numVCells; h++) {
        lines.push({ x: 0, y: h * hSpacing, points: [0, 0, layerWidth, 0] });
    }
    for (let w = 1; w <= numHCells; w++) {
        lines.push({ x: w * vSpacing, y: 0, points: [0, 0, 0, layerHeight] });
    }

    return {
        lines,
        stroke: settings.stroke || '#fff',
        strokeWidth: Number(settings.strokeWidth * layerWidth * 0.01) || 1,
        opacity: Number(settings.opacity) || 0.5,
    };
}
