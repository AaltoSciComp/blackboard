import { expect, test } from '@playwright/test';
import {
    createPresentation,
    drawLine,
    getBoardShapes,
    getStageBounds,
} from './helpers.js';

test('creates a presentation and opens its board', async ({ page }) => {
    await createPresentation(page);
});

test('navigates to the next board and loads it from the server', async ({ page }) => {
    const { sessionId } = await createPresentation(page);
    const boardLoaded = page.waitForResponse(response =>
        response.url().endsWith(`/board/${sessionId}/2`) && response.request().method() === 'GET'
    );
    await page.getByTitle('Go to next board').click();

    const boardResponse = await boardLoaded;
    expect(boardResponse.ok()).toBe(true);
    const board = await boardResponse.json();
    expect(board.shapes).toEqual([]);
    await expect(page.getByTitle('Navigate and set the size of boards grid for viewers')).toContainText('2');
});

test('draws a line and persists it to the active board', async ({ page }) => {
    const { sessionId } = await createPresentation(page);
    const bounds = await getStageBounds(page);

    await drawLine(page, sessionId, bounds, [0.3, 0.3], [0.5, 0.45]);

    const shapes = await getBoardShapes(page, sessionId);
    expect(shapes.some(shape => shape.shapetype === 'Line')).toBe(true);
});

test('deletes a drawn line with the eraser tool', async ({ page }) => {
    const { sessionId } = await createPresentation(page);
    const bounds = await getStageBounds(page);

    const { startX, startY, endX, endY } = await drawLine(page, sessionId, bounds, [0.3, 0.3], [0.5, 0.45]);
    expect((await getBoardShapes(page, sessionId)).some(shape => shape.shapetype === 'Line')).toBe(true);

    // Switch to the eraser (Delete) tool and click on the middle of the line.
    // Deletions are batched and sent to the server once per second.
    await page.getByTitle('Delete shapes').click();
    const deleteRequest = page.waitForResponse(response =>
        response.url().endsWith(`/shapes/${sessionId}`) && response.request().method() === 'DELETE'
    );
    await page.mouse.click((startX + endX) / 2, (startY + endY) / 2);

    const deleteResponse = await deleteRequest;
    expect(deleteResponse.ok()).toBe(true);

    await expect.poll(async () => {
        const shapes = await getBoardShapes(page, sessionId);
        return shapes.filter(shape => shape.shapetype === 'Line').length;
    }, { timeout: 10_000 }).toBe(0);
});