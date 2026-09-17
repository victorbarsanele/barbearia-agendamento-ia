import { test, expect } from '@playwright/test';

test('menu Mais abre bottom sheet e fecha por todas as interações', async ({
    page,
}) => {
    await page.goto('/');

    const sheet = page.getByRole('dialog', { name: 'Mais opções' });
    const abrirMais = page.getByRole('button', { name: 'Mais', exact: true });

    await expect(
        page.getByRole('button', { name: 'Sair', exact: true }),
    ).toHaveCount(0);
    await abrirMais.click();
    await expect(sheet).toBeVisible();
    await expect(
        sheet.getByRole('button', { name: 'Serviços', exact: true }),
    ).toBeVisible();
    await expect(
        sheet.getByRole('button', { name: 'Pacotes', exact: true }),
    ).toBeVisible();
    await expect(
        sheet.getByRole('button', { name: 'Bloqueios', exact: true }),
    ).toBeVisible();
    await expect(
        sheet.getByRole('button', { name: 'Horários', exact: true }),
    ).toBeVisible();
    await expect(
        sheet.getByRole('button', { name: 'Sair', exact: true }),
    ).toBeVisible();

    await sheet.getByRole('button', { name: 'Fechar menu Mais' }).click();
    await expect(sheet).toBeHidden();

    await abrirMais.click();
    await page
        .getByTestId('mais-overlay')
        .click({ position: { x: 10, y: 10 } });
    await expect(sheet).toBeHidden();

    await abrirMais.click();
    const handle = sheet.getByRole('button', { name: 'Arrastar para fechar' });
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) {
        throw new Error('Handle do bottom sheet não encontrado');
    }
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 100);
    await page.mouse.up();
    await expect(sheet).toBeHidden();

    await abrirMais.click();
    await sheet.getByRole('button', { name: 'Horários', exact: true }).click();
    await expect(page).toHaveURL(/horarios/);
});

test('BottomNav aparece em Bloqueios e Horários', async ({ page }) => {
    for (const rota of ['/bloqueios', '/horarios']) {
        await page.goto(rota);
        await expect(
            page.getByRole('navigation', { name: 'Navegação principal' }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Agenda', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Mais', exact: true }),
        ).toBeVisible();
    }
});
