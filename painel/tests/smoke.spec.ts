import { test, expect } from '@playwright/test';

test('painel abre autenticado direto na Agenda', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Agenda')).toBeVisible();
});
