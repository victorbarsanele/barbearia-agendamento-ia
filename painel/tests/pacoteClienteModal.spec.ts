import { expect, test, type Page, type Route } from '@playwright/test';

const cliente = {
    id: 'cliente-ana',
    nome: 'Ana Souza',
    telefone: '11999990001',
};

function pacoteAtivo(renovadoEm: string | null) {
    return {
        id: 'ciclo-atual',
        clienteId: cliente.id,
        pacoteId: 'pacote-mensal',
        renovadoDeId: renovadoEm ? 'ciclo-anterior' : null,
        dataInicio: '2026-01-01T12:00:00.000Z',
        renovadoEm,
        status: 'ATIVO',
        createdAt: '2026-01-01T12:00:00.000Z',
        pacote: {
            id: 'pacote-mensal',
            nome: 'Pacote mensal',
            duracaoDias: 30,
            preco: '120.00',
            liberadoParaGemini: false,
            createdAt: '2026-01-01T12:00:00.000Z',
            servicos: [],
        },
        servicos: [],
    };
}

async function abrirModalPacote(
    page: Page,
    renovadoEm: string | null,
): Promise<void> {
    await page.route('**/api/**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (request.method() === 'GET' && url.pathname === '/api/auth/me') {
            await route.fulfill({
                status: 200,
                json: { username: 'e2e', role: 'admin' },
            });
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/clientes'
        ) {
            await route.fulfill({
                status: 200,
                json: {
                    data: [cliente],
                    total: 1,
                    page: 1,
                    totalPages: 1,
                },
            });
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/agendamentos'
        ) {
            await route.fulfill({ status: 200, json: [] });
        } else if (
            request.method() === 'GET' &&
            url.pathname === `/api/pacotes/cliente/${cliente.id}`
        ) {
            await route.fulfill({
                status: 200,
                json: pacoteAtivo(renovadoEm),
            });
        } else {
            await route.fulfill({
                status: 404,
                json: { message: 'Rota não prevista pelo teste.' },
            });
        }
    });

    await page.goto('/clientes');
    await page
        .getByRole('button', { name: 'Gerenciar pacote do cliente' })
        .click();
}

test('modal mostra data da renovação e remove validade de referência', async ({
    page,
}) => {
    await abrirModalPacote(page, '2026-03-02');
    const modal = page.getByRole('dialog', { name: 'Pacote de Ana Souza' });

    await expect(
        modal.getByText('Renovado automaticamente em 02/03/2026'),
    ).toBeVisible();
    await expect(modal.getByText('Válido até', { exact: false })).toHaveCount(
        0,
    );
});

test('modal sem renovação não mostra linha de renovação nem validade', async ({
    page,
}) => {
    await abrirModalPacote(page, null);
    const modal = page.getByRole('dialog', { name: 'Pacote de Ana Souza' });

    await expect(modal.getByText(/Renovado automaticamente em/)).toHaveCount(0);
    await expect(modal.getByText('Válido até', { exact: false })).toHaveCount(
        0,
    );
});
