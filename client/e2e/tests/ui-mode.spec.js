import { expect, test } from '@playwright/test';
import { createPresentation } from './helpers.js';

test('switches from simple UI to advanced UI', async ({ page }) => {
    await createPresentation(page);

    // In simple UI there are only simple tool buttons, no tool dropdown
    await expect(page.getByTitle('Select tool')).toHaveCount(0);
    await expect(page.getByTitle('Draw')).toBeVisible();
    await expect(page.getByTitle('Delete shapes')).toBeVisible();

    await page.getByTitle('Switch user interface').click();
    await page.getByText('Advanced UI', { exact: true }).click();
    await expect(page.getByTitle('Switch user interface')).toContainText('Adv. UI');

    // Advanced UI shows the tool dropdown and extra tool options
    await expect(page.getByTitle('Select tool')).toBeVisible();

    // The tool dropdown lists all tools, including advanced-only ones
    await page.getByTitle('Select tool').click();
    await expect(page.getByText('Rectangle', { exact: true })).toBeVisible();
    await expect(page.getByText('Polyline', { exact: true })).toBeVisible();
    await expect(page.getByText('Arrow', { exact: true })).toBeVisible();
});

test('switches back from advanced UI to simple UI', async ({ page }) => {
    await createPresentation(page);

    await page.getByTitle('Switch user interface').click();
    await page.getByText('Advanced UI', { exact: true }).click();
    await expect(page.getByTitle('Select tool')).toBeVisible();

    await page.getByTitle('Switch user interface').click();
    await page.getByText('Simple UI', { exact: true }).click();
    await expect(page.getByTitle('Switch user interface')).toContainText('Simple UI');
    await expect(page.getByTitle('Select tool')).toHaveCount(0);
    await expect(page.getByTitle('Draw')).toBeVisible();
});
