import { expect } from '@playwright/test';

export const API_BASE = 'http://127.0.0.1:8080';

export async function createPresentation(page) {
    const sessionName = `Playwright ${Date.now()}`;
    const password = 'e2e-test-password';

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Create a new presentation' })).toBeVisible();

    await page.locator('#sessionname').fill(sessionName);
    await page.locator('#presenterpw').fill(password);
    await page.getByRole('button', { name: 'Create presentation' }).click();

    const presenterDialog = page.getByRole('dialog').filter({ hasText: 'Presenter password required' });
    await expect(presenterDialog).toBeVisible();
    await expect(page).toHaveURL(/\/\d+$/);
    const sessionId = Number(new URL(page.url()).pathname.slice(1));
    const boardLoaded = page.waitForResponse(response =>
        response.url().endsWith(`/board/${sessionId}/1`) && response.request().method() === 'GET'
    );
    await presenterDialog.locator('input[name="password"]').fill(password);
    await presenterDialog.getByRole('button', { name: 'Submit' }).click();

    const boardResponse = await boardLoaded;
    expect(boardResponse.ok()).toBe(true);
    await expect(presenterDialog).toBeHidden();
    const canvas = page.locator('#mainstage canvas').first();
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate(element => element.width)).toBeGreaterThan(0);
    await expect.poll(() => canvas.evaluate(element => element.height)).toBeGreaterThan(0);
    await expect(page.getByTitle('Navigate and set the size of boards grid for viewers').locator('.spinner-border')).toHaveCount(0);

    await expect.poll(() => page.evaluate(id => sessionStorage.getItem(`presentertoken_${id}`), sessionId)).toBeTruthy();
    const fullscreenDialog = page.getByRole('dialog').filter({ hasText: 'Enter fullscreen mode?' });
    await expect(fullscreenDialog).toBeVisible();
    await fullscreenDialog.getByRole('button', { name: 'No, continue windowed' }).click();
    await expect(fullscreenDialog).toBeHidden();

    return {
        sessionId,
    };
}

export async function getPresenterToken(page, sessionId) {
    const token = await page.evaluate(id => sessionStorage.getItem(`presentertoken_${id}`), sessionId);
    expect(token).toBeTruthy();
    return token;
}

export async function getBoardShapes(page, sessionId, boardId = 1) {
    const token = await getPresenterToken(page, sessionId);
    const response = await page.request.get(`${API_BASE}/board/${sessionId}/${boardId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBe(true);
    const board = await response.json();
    return board.shapes;
}

export async function getStageBounds(page) {
    const bounds = await page.locator('#mainstage').boundingBox();
    expect(bounds).not.toBeNull();
    return bounds;
}

/**
 * Switch from simple UI to advanced (complex) UI via the toolbar dropdown.
 */
export async function switchToAdvancedUi(page) {
    await page.getByTitle('Switch user interface').click();
    await page.getByText('Advanced UI', { exact: true }).click();
    await expect(page.getByTitle('Select tool')).toBeVisible();
}

/**
 * Select a tool from the tool dropdown (requires advanced UI).
 */
export async function selectTool(page, toolLabel) {
    await page.getByTitle('Select tool').click();
    await page.getByText(toolLabel, { exact: true }).click();
    await expect(page.getByTitle('Select tool')).toContainText(toolLabel);
}

/**
 * Wait until the app has settled: no board data fetching is ongoing.
 * While a board fetch is in flight, pointer events on the stage are
 * intentionally ignored (penDown returns early), so drawing must wait for
 * the backend round-trips triggered by login/setup to finish.
 */
export async function waitForBoardSettled(page) {
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
}

/**
 * Drag the mouse across the board stage between two fractional points.
 * When expectSave is true, waits for the initial shape save (PUT /shape/:sid)
 * to complete. The gesture is retried if the save request never fires, which
 * can happen when a board fetch is still in flight and swallows penDown.
 * Returns the start and end points in viewport coordinates.
 */
export async function dragOnStage(page, sessionId, bounds, fromFraction, toFraction, { expectSave = true, attempts = 3 } = {}) {
    const startX = bounds.x + bounds.width * fromFraction[0];
    const startY = bounds.y + bounds.height * fromFraction[1];
    const endX = bounds.x + bounds.width * toFraction[0];
    const endY = bounds.y + bounds.height * toFraction[1];

    await waitForBoardSettled(page);

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const saveArrived = expectSave
            ? page.waitForResponse(response =>
                response.url().endsWith(`/shape/${sessionId}`) && response.request().method() === 'PUT',
                { timeout: 4000 }
            )
            : null;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.waitForTimeout(40);
        await page.mouse.move(startX + (endX - startX) / 2, startY + (endY - startY) / 2);
        await page.waitForTimeout(40);
        await page.mouse.move(endX, endY);
        await page.waitForTimeout(40);
        await page.mouse.up();

        if (!saveArrived) {
            await page.waitForTimeout(300);
            return { startX, startY, endX, endY };
        }
        try {
            const saveResponse = await saveArrived;
            expect(saveResponse.ok()).toBe(true);
            return { startX, startY, endX, endY };
        } catch (error) {
            if (attempt === attempts) throw error;
            // The gesture was likely swallowed by an in-flight board fetch;
            // wait for the app to go quiet, then retry the whole drag.
            await waitForBoardSettled(page);
        }
    }

    return { startX, startY, endX, endY };
}

/**
 * Draw a freehand line with the (default) Draw tool by dragging the mouse.
 */
export async function drawLine(page, sessionId, bounds, fromFraction, toFraction) {
    return dragOnStage(page, sessionId, bounds, fromFraction, toFraction);
}

/**
 * Poll the board via the backend API until at least one shape of the given
 * type exists whose shapedata satisfies the predicate.
 */
export async function expectBoardShape(page, sessionId, shapetype, predicate, { timeout = 10_000 } = {}) {
    await expect.poll(async () => {
        const shapes = await getBoardShapes(page, sessionId);
        return shapes.some(shape => shape.shapetype === shapetype && predicate(shape));
    }, { timeout, message: `expected a persisted ${shapetype} matching the predicate` }).toBe(true);
}
