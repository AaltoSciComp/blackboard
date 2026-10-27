import { expect, test } from '@playwright/test';
import { createPresentation, dragOnStage, getStageBounds } from './helpers.js';

/**
 * Viewer page smoke tests.
 *
 * The viewer (viewer.html + src/viewer/viewer.js) is a plain-JavaScript
 * page (Konva + socket.io, no React) that shares its pure rendering logic
 * with the presenter app through the unit-tested modules under
 * src/viewer/. These tests cover the parts that unit tests cannot: real
 * socket.io handshakes, Konva rendering and the DOM controls.
 *
 * The viewer exposes its internals on window.viewerDebug (see
 * src/viewer/viewer.js); we use it to observe the actual Konva layers
 * instead of scraping canvas pixels.
 */

async function openViewer(page, sessionId) {
    await page.goto(`/viewer.html?s=${sessionId}&insecure=1`);
    // Wait until viewer_login has succeeded and the stages are prepared,
    // otherwise incoming shape messages would be silently dropped.
    await expect
        .poll(async () => page.evaluate(() => window.viewerDebug?.gotSettings === true), {
            message: 'viewer did not receive login_success',
        })
        .toBe(true);
    await expect
        .poll(async () => page.evaluate(() => window.viewerDebug?.numVisBoards > 0))
        .toBe(true);
}

/**
 * Total number of Konva nodes drawn on the main layers of all visible boards
 * in the viewer (i.e. the shapes it received from the presenter).
 */
function viewerShapeCount(page) {
    return page.evaluate(() => {
        const debug = window.viewerDebug;
        if (!debug) return -1;
        let count = 0;
        for (let i = 1; i < debug.layer.main.length; i++) {
            if (debug.layer.main[i]) count += debug.layer.main[i].children.length;
        }
        return count;
    });
}

test('viewer renders the board grid and a viewer token is stored', async ({ context }) => {
    // This test drives the presenter in its own page and the viewer in another.
    const presenter = await context.newPage();
    const { sessionId } = await createPresentation(presenter);

    const viewer = await context.newPage();
    await openViewer(viewer, sessionId);

    // One canvas per Konva layer (bg, grid, main) in each visible board stage
    await expect(viewer.locator('#stage-parent canvas').first()).toBeVisible();
    const canvasCount = await viewer.locator('#stage-parent canvas').count();
    const numVisBoards = await viewer.evaluate(() => window.viewerDebug.numVisBoards);
    expect(canvasCount).toBe(numVisBoards * 3);
    await expect(viewer.locator('#highlight-parent canvas')).toHaveCount(1);

    // The viewer received an access token on login
    const token = await viewer.evaluate((id) => sessionStorage.getItem(`viewertoken_${id}`), sessionId);
    expect(token).toBeTruthy();

    // Offline toggle disconnects and switches the control panel
    await viewer.click('#offlinetoggle');
    await expect(viewer.locator('#offlinetoggle')).toHaveText('Go online');
    await expect(viewer.locator('#navcontrols')).toBeVisible();
    await expect(viewer.locator('#offsetcontrols')).toBeHidden();
    await viewer.click('#offlinetoggle');
    await expect(viewer.locator('#offlinetoggle')).toHaveText('Go offline');

    await presenter.close();
    await viewer.close();
});

test('viewer shows shapes drawn by the presenter in real time', async ({ context }) => {
    const presenter = await context.newPage();
    const { sessionId } = await createPresentation(presenter);
    const bounds = await getStageBounds(presenter);
    await dragOnStage(presenter, sessionId, bounds, [0.2, 0.2], [0.8, 0.7]);

    const viewer = await context.newPage();
    await openViewer(viewer, sessionId);

    // Wait for the cached board data (and the board itself) to arrive; the
    // viewer caches boards and replays them with playShapes, which adds the
    // shapes to the Konva main layers (shared code path with live drawing).
    await expect
        .poll(() => viewerShapeCount(viewer), {
            timeout: 15_000,
            message: 'viewer never rendered the shape drawn by the presenter',
        })
        .toBeGreaterThan(0);

    const shapeInfo = await viewer.evaluate(() => {
        const debug = window.viewerDebug;
        for (let i = 1; i < debug.layer.main.length; i++) {
            const layer = debug.layer.main[i];
            if (!layer || !layer.children.length) continue;
            const shape = layer.children[0];
            return {
                name: shape.attrs.name,
                hasDbId: shape.getAttr('dbId') !== undefined,
                strokeWidth: shape.attrs.strokeWidth,
                points: shape.attrs.points.length,
            };
        }
        return null;
    });
    expect(shapeInfo).not.toBeNull();
    expect(shapeInfo.name).toBe('Line');
    // dbId must be set so live shape_modified/deleted messages can find it
    expect(shapeInfo.hasDbId).toBe(true);
    expect(shapeInfo.strokeWidth).toBeGreaterThan(0);
    expect(shapeInfo.points).toBeGreaterThanOrEqual(2);

    // Now draw a second line on the presenter *while the viewer is open* and
    // verify it arrives live via draw_shape
    await dragOnStage(presenter, sessionId, bounds, [0.7, 0.2], [0.3, 0.8]);
    await expect
        .poll(() => viewerShapeCount(viewer), {
            timeout: 15_000,
            message: 'live draw_shape never reached the viewer',
        })
        .toBeGreaterThanOrEqual(2);

    await presenter.close();
    await viewer.close();
});
