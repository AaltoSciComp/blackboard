import { expect, test } from '@playwright/test';
import {
    createPresentation,
    dragOnStage,
    expectBoardShape,
    getBoardShapes,
    getStageBounds,
    selectTool,
    switchToAdvancedUi,
    waitForBoardSettled,
} from './helpers.js';

test('draws an arrow with the arrow tool', async ({ page }) => {
    const { sessionId } = await createPresentation(page);
    const bounds = await getStageBounds(page);

    await switchToAdvancedUi(page);
    await selectTool(page, 'Arrow');

    await dragOnStage(page, sessionId, bounds, [0.25, 0.6], [0.55, 0.35]);

    await expectBoardShape(page, sessionId, 'Arrow', shape => true);
});

test('draws a rectangle with the rectangle tool', async ({ page }) => {
    const { sessionId } = await createPresentation(page);
    const bounds = await getStageBounds(page);

    await switchToAdvancedUi(page);
    await selectTool(page, 'Rectangle');

    await dragOnStage(page, sessionId, bounds, [0.3, 0.3], [0.55, 0.6]);

    await expectBoardShape(page, sessionId, 'Rect', shape => true);
});

test('deletes a drawn rectangle via the context menu', async ({ page }) => {
    const { sessionId } = await createPresentation(page);
    const bounds = await getStageBounds(page);

    await switchToAdvancedUi(page);
    await selectTool(page, 'Rectangle');
    await dragOnStage(page, sessionId, bounds, [0.3, 0.3], [0.55, 0.6]);
    await expectBoardShape(page, sessionId, 'Rect', shape => true);

    // The Select ("Modify shape") tool opens the context menu when a shape is
    // clicked. Rectangles are drawn without fill, so click on the frame where
    // the hit area is.
    await selectTool(page, 'Modify shape');
    await page.mouse.click(bounds.x + bounds.width * 0.425, bounds.y + bounds.height * 0.3);
    await expect(page.locator('.ctxmenu')).toBeVisible();

    const deleteRequest = page.waitForResponse(response =>
        response.url().endsWith(`/shapes/${sessionId}`) && response.request().method() === 'DELETE'
    );
    await page.locator('.ctxmenu li', { hasText: 'Delete' }).click();

    const deleteResponse = await deleteRequest;
    expect(deleteResponse.ok()).toBe(true);

    await expect.poll(async () => {
        const shapes = await getBoardShapes(page, sessionId);
        return shapes.filter(shape => shape.shapetype === 'Rect').length;
    }, { timeout: 10_000 }).toBe(0);
});

/**
 * Reset any half-drawn polyline by switching to another tool and back.
 * (Switching away from Polyline calls resetPolyline in the app.)
 */
async function resetPolylineTool(page) {
    await selectTool(page, 'Draw');
    await selectTool(page, 'Polyline');
}

test('draws a polyline and finishes it on the starting point', async ({ page }) => {
    const { sessionId } = await createPresentation(page);
    const bounds = await getStageBounds(page);

    await switchToAdvancedUi(page);
    await selectTool(page, 'Polyline');

    const a = { x: bounds.x + bounds.width * 0.3, y: bounds.y + bounds.height * 0.3 };
    const b = { x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * 0.45 };

    // A click can be swallowed while a board fetch is in flight (penDown
    // returns early), and finishing by hovering the helper circle is timing
    // sensitive, so retry the entire gesture if any step misfires.
    for (let attempt = 1; attempt <= 4; attempt++) {
        await waitForBoardSettled(page);

        // First point. This also spawns a snappable helper circle at the
        // starting point, which becomes active after 400ms.
        await page.mouse.click(a.x, a.y);
        await page.waitForTimeout(550);

        // Intermediate point: click further away than the snapping distance.
        // This triggers the initial save of the polyline to the database.
        const intermediateSaved = page.waitForResponse(response =>
            response.url().endsWith(`/shape/${sessionId}`) && response.request().method() === 'PUT',
            { timeout: 3000 }
        ).catch(() => null);
        await page.mouse.click(b.x, b.y);
        const saveResponse = await intermediateSaved;

        if (!saveResponse || !saveResponse.ok()) {
            // The gesture was swallowed; reset and try again.
            await resetPolylineTool(page);
            continue;
        }
        await page.waitForTimeout(550);

        // Finish the polyline by hovering over the (snappable) starting point
        // circle — the hover sets openPolyLine.snapped — and clicking inside it.
        const finalUpdate = page.waitForResponse(response =>
            /\/shape\/\d+\/\d+$/.test(new URL(response.url()).pathname) && response.request().method() === 'PATCH',
            { timeout: 3000 }
        ).catch(() => null);
        await page.mouse.move(a.x, a.y, { steps: 5 });
        await page.waitForTimeout(300);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.up();
        const updateResponse = await finalUpdate;

        if (updateResponse && updateResponse.ok()) break;

        await resetPolylineTool(page);
    }

    // Three points: start, intermediate, and the snapped-back start (~0,0).
    await expectBoardShape(page, sessionId, 'Polyline', shape => {
        const points = typeof shape.shapedata === 'string'
            ? JSON.parse(shape.shapedata)
            : shape.shapedata;
        if (!Array.isArray(points) || points.length < 3) return false;
        const first = points[0];
        const last = points[points.length - 1];
        // Coordinates are relative to the starting point and stage size.
        return Math.abs(last[1] - first[1]) < 0.001 && Math.abs(last[2] - first[2]) < 0.001;
    });
});
