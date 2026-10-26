import { expect, test } from '@playwright/test';

async function createPresentation(page) {
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
    const token = await page.evaluate(id => sessionStorage.getItem(`presentertoken_${id}`), sessionId);
    const bounds = await page.locator('#mainstage').boundingBox();

    expect(token).toBeTruthy();
    expect(bounds).not.toBeNull();

    const startX = bounds.x + bounds.width * 0.3;
    const startY = bounds.y + bounds.height * 0.3;
    const shapeSaved = page.waitForResponse(response =>
        response.url().endsWith(`/shape/${sessionId}`) && response.request().method() === 'PUT'
    );

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.move(startX + 30, startY + 25);
    await page.waitForTimeout(40);
    await page.mouse.move(startX + 90, startY + 60);
    await page.waitForTimeout(40);
    await page.mouse.up();

    const saveResponse = await shapeSaved;
    expect(saveResponse.ok()).toBe(true);

    const boardResponse = await page.request.get(`http://127.0.0.1:8080/board/${sessionId}/1`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(boardResponse.ok()).toBe(true);
    const board = await boardResponse.json();
    expect(board.shapes.some(shape => shape.shapetype === 'Line')).toBe(true);
});