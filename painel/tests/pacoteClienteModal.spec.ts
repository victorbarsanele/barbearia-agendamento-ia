import { expect, test, type Page, type Route } from '@playwright/test';

const cliente = {
    id: 'cliente-ana',
    nome: 'Ana Souza',
    telefone: '11999990001',
};

function pacoteAtivo(renovadoEm?: string | null, arquivado = false) {
    return {
        id: 'ciclo-atual',
        clienteId: cliente.id,
        pacoteId: 'pacote-mensal',
        renovadoDeId: renovadoEm ? 'ciclo-anterior' : null,
        dataInicio: '2026-01-01T12:00:00.000Z',
        ...(renovadoEm === undefined ? {} : { renovadoEm }),
        status: 'ATIVO',
        createdAt: '2026-01-01T12:00:00.000Z',
        pacote: {
            id: 'pacote-mensal',
            nome: 'Pacote mensal',
            duracaoDias: 30,
            preco: '120.00',
            liberadoParaGemini: false,
            createdAt: '2026-01-01T12:00:00.000Z',
            ...(arquivado ? { arquivadoEm: '2026-03-10T12:00:00.000Z' } : {}),
            servicos: [],
        },
        servicos: [],
    };
}

const pacoteCatalogo = {
    id: 'pacote-mensal',
    nome: 'Pacote mensal',
    duracaoDias: 30,
    preco: '120.00',
    liberadoParaGemini: false,
    createdAt: '2026-01-01T12:00:00.000Z',
    servicos: [
        {
            pacoteId: 'pacote-mensal',
            servicoId: 'servico-corte',
            quantidadeTotal: 4,
            servico: {
                id: 'servico-corte',
                nome: 'Corte',
                duracaoMinutos: 30,
                preco: '50.00',
            },
        },
    ],
};

async function abrirModalPacote(
    page: Page,
    renovadoEm?: string | null,
    options: {
        cicloArquivado?: boolean;
        conflitoArquivado?: boolean;
        onConsultaAtiva?: () => void;
    } = {},
): Promise<string> {
    const corpoPacote = JSON.stringify(
        pacoteAtivo(renovadoEm, options.cicloArquivado),
    );
    let tentativasCatalogo = 0;
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
            options.onConsultaAtiva?.();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: options.conflitoArquivado ? 'null' : corpoPacote,
            });
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/pacotes'
        ) {
            tentativasCatalogo += 1;
            await route.fulfill({
                status: 200,
                json:
                    options.conflitoArquivado && tentativasCatalogo > 1
                        ? []
                        : [pacoteCatalogo],
            });
        } else if (
            request.method() === 'POST' &&
            url.pathname === '/api/pacotes/vincular'
        ) {
            await route.fulfill({
                status: 409,
                json: {
                    message: 'Pacote arquivado.',
                    code: 'PACOTE_ARQUIVADO',
                },
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
    return corpoPacote;
}

test('modal mostra data da renovação e remove validade de referência', async ({
    page,
}) => {
    await abrirModalPacote(page, '2026-03-02');
    const modal = page.getByRole('dialog', { name: 'Pacote de Ana Souza' });

    await expect(
        modal.getByText('Renovado automaticamente em 02/03/2026'),
    ).toBeVisible();
    await expect(modal.getByText(/Pacote arquivado:/)).toHaveCount(0);
    await expect(modal.getByText('Válido até', { exact: false })).toHaveCount(
        0,
    );
});

test('modal sem campo renovadoEm não mostra linha nem texto undefined', async ({
    page,
}) => {
    const corpoPacote = await abrirModalPacote(page);
    expect(JSON.parse(corpoPacote)).not.toHaveProperty('renovadoEm');
    const modal = page.getByRole('dialog', { name: 'Pacote de Ana Souza' });

    await expect(modal.getByText(/Renovado automaticamente em/)).toHaveCount(0);
    await expect(modal.getByText('undefined', { exact: true })).toHaveCount(0);
    await expect(modal.getByText('Válido até', { exact: false })).toHaveCount(
        0,
    );
});

test('modal com renovadoEm null não mostra linha de renovação', async ({
    page,
}) => {
    await abrirModalPacote(page, null);
    const modal = page.getByRole('dialog', { name: 'Pacote de Ana Souza' });

    await expect(modal.getByText(/Renovado automaticamente em/)).toHaveCount(0);
    await expect(modal.getByText('undefined', { exact: true })).toHaveCount(0);
});

test('modal com renovadoEm vazio não mostra linha nem texto undefined', async ({
    page,
}) => {
    await abrirModalPacote(page, '');
    const modal = page.getByRole('dialog', { name: 'Pacote de Ana Souza' });

    await expect(modal.getByText(/Renovado automaticamente em/)).toHaveCount(0);
    await expect(modal.getByText('undefined', { exact: true })).toHaveCount(0);
});

test('ciclo ativo arquivado mostra histórico da renovação e nota de arquivamento', async ({
    page,
}) => {
    await abrirModalPacote(page, '2026-03-02', { cicloArquivado: true });
    const modal = page.getByRole('dialog', { name: 'Pacote de Ana Souza' });

    await expect(
        modal.getByText(
            'Pacote arquivado: o ciclo segue até zerar, sem renovação.',
        ),
    ).toBeVisible();
    await expect(
        modal.getByText('Renovado automaticamente em 02/03/2026'),
    ).toBeVisible();
});

test('ciclo ativo arquivado sem renovadoEm mostra apenas a nota de arquivamento', async ({
    page,
}) => {
    await abrirModalPacote(page, undefined, { cicloArquivado: true });
    const modal = page.getByRole('dialog', { name: 'Pacote de Ana Souza' });

    await expect(
        modal.getByText(
            'Pacote arquivado: o ciclo segue até zerar, sem renovação.',
        ),
    ).toBeVisible();
    await expect(modal.getByText(/Renovado automaticamente em/)).toHaveCount(0);
});

test('vínculo de pacote arquivado limpa escolha e atualiza catálogo e ciclo ativo', async ({
    page,
}) => {
    let consultasAtivas = 0;
    await abrirModalPacote(page, undefined, {
        conflitoArquivado: true,
        onConsultaAtiva: () => {
            consultasAtivas += 1;
        },
    });
    const modal = page.getByRole('dialog', { name: 'Pacote de Ana Souza' });
    await modal.locator('select').selectOption('pacote-mensal');
    await modal.getByRole('button', { name: 'Vincular', exact: true }).click();

    await expect(
        modal.getByText(
            'Este pacote foi arquivado e não está mais disponível. Escolha outro pacote.',
        ),
    ).toBeVisible();
    await expect.poll(() => consultasAtivas).toBe(2);
    await expect(
        modal.getByText('Nenhum pacote cadastrado ainda.'),
    ).toBeVisible();
    await expect(modal.locator('select')).toHaveCount(0);
});
