import { expect, test } from '@playwright/test';
import { createPresentation, getStageBounds } from './helpers.js';

/**
 * Wet-ink overlay tests: the Line tool draws the in-progress stroke on a
 * plain canvas overlay (incremental, no Konva redraw) for a snappy pen feel.
 * The overlay must show ink DURING the stroke and be cleared after the
 * stroke is committed to the Konva main layer.
 */

test('wet ink overlay shows the stroke while drawing and clears on commit', async ({ page }) => {
    const { sessionId } = await createPresentation(page);
    const bounds = await getStageBounds(page);

    // The overlay is the canvas with pointer-events: none / z-index style
    const overlay = page.locator('canvas[style*="pointer-events: none"]').first();
    await expect(overlay).toBeAttached();

    // Start a stroke and pause mid-way: the overlay must contain ink
    await page.waitForTimeout(1000); // let initial board load settle
    const startX = bounds.x + bounds.width * 0.3;
    const startY = bounds.y + bounds.height * 0.3;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
        await page.mouse.move(startX + i * 15, startY + Math.sin(i) * 10, { steps: 1 });
        await page.waitForTimeout(40);
    }

    const inkDuringStroke = await overlay.evaluate(canvas => {
        const ctx = canvas.getContext('2d');
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let inked = 0;
        for (let i = 3; i < img.length; i += 4) if (img[i] > 0) inked++;
        return inked;
    });
    expect(inkDuringStroke).toBeGreaterThan(0);

    // Finish the stroke: the shape is committed to Konva and the overlay cleared
    await page.mouse.up();
    await expect.poll(async () => {
        return overlay.evaluate(canvas => {
            const ctx = canvas.getContext('2d');
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let inked = 0;
            for (let i = 3; i < img.length; i += 4) if (img[i] > 0) inked++;
            return inked;
        });
    }, { timeout: 5000, message: 'wet ink overlay was not cleared after commit' }).toBe(0);

    // And the committed line exists in the backend
    await expect.poll(async () => {
        const shapes = await getBoardShapesSafe(page, sessionId);
        return shapes.filter(s => s.shapetype === 'Line').length;
    }, { timeout: 10_000 }).toBe(1);
});

async function getBoardShapesSafe(page, sessionId) {
    const token = await page.evaluate(id => sessionStorage.getItem(`presentertoken_${id}`), sessionId);
    const response = await page.request.get(`http://127.0.0.1:8080/board/${sessionId}/1`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).shapes;
}
