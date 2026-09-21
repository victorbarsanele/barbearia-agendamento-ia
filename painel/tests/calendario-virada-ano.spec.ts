import { expect, test } from '@playwright/test';

test('calendário avança de dezembro para janeiro sem erro', async ({
    page,
}) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/novo');
    const nextMonthButton = page.getByRole('button', {
        name: 'Próximo mês',
    });

    for (let attempt = 0; attempt < 12; attempt += 1) {
        if (
            await page
                .getByText('Dezembro de 2026', { exact: true })
                .isVisible()
        ) {
            break;
        }

        await nextMonthButton.click();
    }

    await expect(
        page.getByText('Dezembro de 2026', { exact: true }),
    ).toBeVisible();
    await nextMonthButton.click();
    await expect(
        page.getByText('Janeiro de 2027', { exact: true }),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
    await expect(page.locator('body')).not.toBeEmpty();
});
