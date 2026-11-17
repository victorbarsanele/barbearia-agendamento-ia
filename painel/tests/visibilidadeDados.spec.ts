import { expect, test } from '@playwright/test';

function criarAgendamento() {
    return {
        id: 'agendamento-visibilidade',
        origem: 'PAINEL',
        dataHoraInicio: '2026-11-05T16:30:00.000Z',
        dataHoraFim: '2026-11-05T17:00:00.000Z',
        status: 'AGENDADO',
        pacoteClienteId: null,
        numeroNoPacote: null,
        totalServicoNoPacote: null,
        loteId: null,
        concluido: false,
        concluidoEm: null,
        concluidoPor: null,
        estornavel: false,
        autoConclusaoPendente: false,
        ultimoLembrete: null,
        cliente: {
            id: 'cliente-visibilidade',
            nome: 'Cliente de teste',
            telefone: '11999990000',
        },
        servico: {
            id: 'servico-visibilidade',
            nome: 'Corte de teste',
            duracaoMinutos: 30,
            preco: '50.00',
        },
    };
}

async function expectButtonsFit(
    page: import('@playwright/test').Page,
    names: string[],
) {
    const boxes = await Promise.all(
        names.map((name) => page.getByRole('button', { name }).boundingBox()),
    );

    for (let firstIndex = 0; firstIndex < boxes.length; firstIndex += 1) {
        const firstBox = boxes[firstIndex];
        if (!firstBox) {
            throw new Error(`Botão não encontrado: ${names[firstIndex]}`);
        }

        for (
            let secondIndex = firstIndex + 1;
            secondIndex < boxes.length;
            secondIndex += 1
        ) {
            const secondBox = boxes[secondIndex];
            if (!secondBox) {
                throw new Error(`Botão não encontrado: ${names[secondIndex]}`);
            }

            const overlaps =
                firstBox.x < secondBox.x + secondBox.width &&
                firstBox.x + firstBox.width > secondBox.x &&
                firstBox.y < secondBox.y + secondBox.height &&
                firstBox.y + firstBox.height > secondBox.y;
            expect(overlaps).toBe(false);
        }
    }

    const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
}

test('oculta e reexibe o valor do serviço na agenda', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-05T15:00:00.000Z') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/auth/me') {
            await route.fulfill({ status: 200, json: { role: 'admin' } });
            return;
        }
        if (
            route.request().method() === 'GET' &&
            url.pathname === '/api/agendamentos'
        ) {
            await route.fulfill({ status: 200, json: [criarAgendamento()] });
            return;
        }
        await route.fulfill({
            status: 404,
            json: { message: 'Rota não prevista pelo teste.' },
        });
    });

    await page.goto('/');
    const card = page.getByRole('listitem').filter({
        hasText: 'Cliente de teste',
    });
    await expect(card.getByText('R$ 50,00')).toBeVisible();
    await expect(card.getByText('Corte de teste')).toBeVisible();
    await expectButtonsFit(page, ['Ocultar valores da agenda', 'Novo', 'Lote']);

    await page
        .getByRole('button', { name: 'Ocultar valores da agenda' })
        .click();
    await expect(card.getByText('R$ 50,00')).toHaveCount(0);
    await expect(card.getByLabel('Valor do serviço oculto')).toBeVisible();

    await page
        .getByRole('button', { name: 'Mostrar valores da agenda' })
        .click();
    await expect(card.getByText('R$ 50,00')).toBeVisible();
});

test('oculta e reexibe o telefone na lista de clientes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/auth/me') {
            await route.fulfill({ status: 200, json: { role: 'admin' } });
            return;
        }
        if (
            route.request().method() === 'GET' &&
            url.pathname === '/api/clientes'
        ) {
            await route.fulfill({
                status: 200,
                json: {
                    data: [
                        {
                            id: 'cliente-visibilidade',
                            nome: 'Cliente de teste',
                            telefone: '5511999990000',
                            totalAgendamentos: 0,
                        },
                    ],
                    total: 1,
                    page: 1,
                    totalPages: 1,
                },
            });
            return;
        }
        await route.fulfill({
            status: 404,
            json: { message: 'Rota não prevista pelo teste.' },
        });
    });

    await page.goto('/clientes');
    await expect(page.getByText('+55 11 99999-0000')).toBeVisible();
    await expectButtonsFit(page, [
        'Ocultar telefones dos clientes',
        'Novo cliente',
    ]);

    await page
        .getByRole('button', { name: 'Ocultar telefones dos clientes' })
        .click();
    await expect(page.getByText('+55 11 99999-0000')).toHaveCount(0);
    await expect(page.getByLabel('Telefone oculto')).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Novo cliente' }),
    ).toBeVisible();

    await page
        .getByRole('button', { name: 'Mostrar telefones dos clientes' })
        .click();
    await expect(page.getByText('+55 11 99999-0000')).toBeVisible();
});

test('usa a contagem paginada sem listar todos os agendamentos e decrementa ao remover', async ({
    page,
}) => {
    const cliente = {
        id: 'cliente-contagem',
        nome: 'Cliente da contagem',
        telefone: '5511999990001',
    };
    const clienteSemAgendamentos = {
        id: 'cliente-zero',
        nome: 'Cliente sem agendamentos',
        telefone: '5511999990002',
    };
    const agendamento = {
        id: 'agendamento-removivel',
        origem: 'PAINEL',
        dataHoraInicio: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        dataHoraFim: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        status: 'AGENDADO',
        encaixe: false,
        pacoteClienteId: null,
        numeroNoPacote: null,
        totalServicoNoPacote: null,
        loteId: null,
        concluido: false,
        concluidoEm: null,
        concluidoPor: null,
        estornavel: false,
        autoConclusaoPendente: false,
        ultimoLembrete: null,
        cliente,
        servico: {
            id: 'servico-contagem',
            nome: 'Corte de teste',
            duracaoMinutos: 30,
            preco: '50.00',
        },
    };
    const requisicoesSemFiltro: string[] = [];

    page.on('request', (request) => {
        const url = new URL(request.url());
        if (
            request.method() === 'GET' &&
            url.pathname === '/api/agendamentos' &&
            !url.search
        ) {
            requisicoesSemFiltro.push(url.href);
        }
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.pathname === '/api/auth/me') {
            await route.fulfill({ status: 200, json: { role: 'admin' } });
            return;
        }
        if (request.method() === 'GET' && url.pathname === '/api/clientes') {
            await route.fulfill({
                status: 200,
                json: {
                    data: [
                        { ...cliente, totalAgendamentos: 3 },
                        { ...clienteSemAgendamentos, totalAgendamentos: 0 },
                    ],
                    total: 2,
                    page: 1,
                    totalPages: 1,
                },
            });
            return;
        }
        if (
            request.method() === 'GET' &&
            url.pathname === '/api/agendamentos' &&
            url.searchParams.get('clienteId') === cliente.id
        ) {
            await route.fulfill({ status: 200, json: [agendamento] });
            return;
        }
        if (
            request.method() === 'DELETE' &&
            url.pathname === '/api/agendamentos/agendamento-removivel'
        ) {
            await route.fulfill({ status: 200, json: { id: agendamento.id } });
            return;
        }
        await route.fulfill({
            status: 404,
            json: { message: 'Rota não prevista pelo teste.' },
        });
    });

    await page.goto('/clientes');
    const botaoAgenda = page.getByRole('button', {
        name: 'Ver agendamentos (3)',
    });
    await expect(botaoAgenda).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Ver agendamentos (0)' }),
    ).toBeVisible();
    expect(requisicoesSemFiltro).toEqual([]);

    await botaoAgenda.click();
    const modal = page.getByRole('dialog', {
        name: `Agendamentos de ${cliente.nome}`,
    });
    await expect(modal.getByText('Corte de teste')).toBeVisible();
    await modal.getByRole('button', { name: 'Remover' }).click();
    await modal.getByRole('button', { name: 'Sim, remover' }).click();

    await expect(
        page.getByRole('button', { name: 'Ver agendamentos (2)' }),
    ).toBeVisible();
    expect(requisicoesSemFiltro).toEqual([]);
});
