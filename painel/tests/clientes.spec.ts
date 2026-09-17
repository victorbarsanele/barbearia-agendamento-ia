import { test, expect } from '@playwright/test';

test.describe('ações dos cards de clientes', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('exibe legendas das quatro ações em viewport mobile', async ({
        page,
    }) => {
        await page.goto('/clientes');

        for (const legenda of ['Agenda', 'Pacote', 'Editar', 'Excluir']) {
            await expect(
                page.getByText(legenda, { exact: true }).first(),
            ).toBeVisible();
        }
    });
});
