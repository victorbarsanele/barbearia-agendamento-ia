import { expect, test } from '@playwright/test';

const DATA_FIXA = new Date('2026-10-15T12:00:00-03:00');

function mesAnoFuturo(meses: number): Date {
    const data = new Date(DATA_FIXA);
    data.setUTCMonth(data.getUTCMonth() + meses);
    return data;
}

function rotuloMesAno(data: Date): string {
    const rotulo = data.toLocaleDateString('pt-BR', {
        month: 'long',
        timeZone: 'UTC',
        year: 'numeric',
    });
    return rotulo.charAt(0).toLocaleUpperCase('pt-BR') + rotulo.slice(1);
}

function quantidadeMesesEntre(inicio: Date, fim: Date): number {
    return (
        (fim.getUTCFullYear() - inicio.getUTCFullYear()) * 12 +
        fim.getUTCMonth() -
        inicio.getUTCMonth()
    );
}

test('calendário avança de dezembro para janeiro sem erro', async ({
    page,
}) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.clock.setFixedTime(DATA_FIXA);
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.pathname === '/api/auth/me') {
            await route.fulfill({
                status: 200,
                json: { username: 'e2e', role: 'admin' },
            });
            return;
        }
        if (request.method() === 'GET' && url.pathname === '/api/servicos') {
            await route.fulfill({
                status: 200,
                json: [
                    {
                        id: 'servico-corte',
                        nome: 'Corte',
                        duracaoMinutos: 30,
                        preco: '50.00',
                        permiteExtensaoFechamento: false,
                    },
                ],
            });
            return;
        }
        await route.fulfill({
            status: 404,
            json: { message: 'Rota não prevista pelo teste.' },
        });
    });
    await page.goto('/novo');
    const nextMonthButton = page.getByRole('button', {
        name: 'Próximo mês',
    });
    const dezembro = mesAnoFuturo(2);
    const janeiro = mesAnoFuturo(3);
    const mesesAteDezembro = quantidadeMesesEntre(DATA_FIXA, dezembro);

    for (let attempt = 0; attempt < mesesAteDezembro; attempt += 1) {
        await nextMonthButton.click();
    }

    await expect(
        page.getByText(rotuloMesAno(dezembro), { exact: true }),
    ).toBeVisible();
    await nextMonthButton.click();
    await expect(
        page.getByText(rotuloMesAno(janeiro), { exact: true }),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
    await expect(page.locator('body')).not.toBeEmpty();
});
