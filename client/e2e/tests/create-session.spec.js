import { expect, test } from '@playwright/test';

test('creates a presentation and opens its board', async ({ page }) => {
    const sessionName = `Playwright ${Date.now()}`;
    const password = 'e2e-test-password';

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Create a new presentation' })).toBeVisible();

    await page.locator('#sessionname').fill(sessionName);
    await page.locator('#presenterpw').fill(password);
    await page.getByRole('button', { name: 'Create presentation' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('[role="dialog"] input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page).toHaveURL(/\/\d+$/);
    const canvas = page.locator('#mainstage canvas').first();
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate(element => element.width)).toBeGreaterThan(0);
    await expect.poll(() => canvas.evaluate(element => element.height)).toBeGreaterThan(0);
});