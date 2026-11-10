import { expect, test, type Page } from '@playwright/test';

const CLIENTE = {
    id: 'cliente-ana',
    nome: 'Ana Souza',
    telefone: '11999990001',
};

const SERVICOS = [
    {
        id: 'servico-corte',
        nome: 'Corte',
        duracaoMinutos: 30,
        preco: '50.00',
        permiteExtensaoFechamento: false,
    },
    {
        id: 'servico-barba',
        nome: 'Barba',
        duracaoMinutos: 45,
        preco: '65.00',
        permiteExtensaoFechamento: false,
    },
];

const PACOTES = [
    {
        id: 'pacote-corte',
        nome: 'Corte mensal',
        duracaoDias: 30,
        preco: '120.00',
        liberadoParaGemini: false,
        createdAt: '2026-01-01T12:00:00.000Z',
        arquivadoEm: null,
        servicos: [
            {
                pacoteId: 'pacote-corte',
                servicoId: 'servico-corte',
                quantidadeTotal: 4,
                servico: SERVICOS[0],
            },
        ],
    },
    {
        id: 'pacote-barba',
        nome: 'Barba mensal',
        duracaoDias: 30,
        preco: '65.00',
        liberadoParaGemini: false,
        createdAt: '2026-01-01T12:00:00.000Z',
        arquivadoEm: null,
        servicos: [
            {
                pacoteId: 'pacote-barba',
                servicoId: 'servico-barba',
                quantidadeTotal: 2,
                servico: SERVICOS[1],
            },
        ],
    },
];

const AGENDAMENTO_ID = 'agendamento-1';
const PACOTE_CLIENTE_ID = 'pacote-cliente-1';

type MockResponse = { status: number; body: unknown };
type MockOptions = {
    status?: string;
    vinculado?: boolean;
    pacoteAtivo?: boolean;
    pacotes?: typeof PACOTES;
    putResponse?: (payload: Record<string, unknown>) => MockResponse | null;
};
type MockApi = {
    agendamento: Record<string, unknown>;
    pacoteAtivo: Record<string, unknown> | null;
    pacotes: typeof PACOTES;
    catalogRequests: number;
    activeLookups: number;
    puts: Record<string, unknown>[];
    patches: number;
};

function makeAgendamento(
    status = 'AGENDADO',
    vinculado = false,
): Record<string, unknown> {
    return {
        id: AGENDAMENTO_ID,
        dataHoraInicio: '2026-10-25T13:00:00.000Z',
        dataHoraFim: '2026-10-25T13:30:00.000Z',
        status,
        pacoteClienteId: vinculado ? PACOTE_CLIENTE_ID : null,
        numeroNoPacote: vinculado ? 1 : null,
        totalServicoNoPacote: vinculado ? 4 : null,
        loteId: null,
        concluido: status === 'CONCLUIDO',
        concluidoEm: null,
        concluidoPor: null,
        estornavel: false,
        autoConclusaoPendente: false,
        cliente: CLIENTE,
        servico: SERVICOS[0],
    };
}

function makePacoteAtivo(pacote = PACOTES[0]): Record<string, unknown> {
    const servico = pacote.servicos[0].servico;
    return {
        id: PACOTE_CLIENTE_ID,
        clienteId: CLIENTE.id,
        pacoteId: pacote.id,
        dataInicio: '2026-10-01T12:00:00.000Z',
        renovadoEm: null,
        status: 'ATIVO',
        createdAt: '2026-10-01T12:00:00.000Z',
        pacote,
        servicos: [
            {
                id: 'saldo-corte',
                pacoteClienteId: PACOTE_CLIENTE_ID,
                servicoId: servico.id,
                quantidadeTotal: pacote.servicos[0].quantidadeTotal,
                quantidadeRestante: 3,
                usosAnteriores: 0,
                servico,
            },
        ],
    };
}

async function mockApi(
    page: Page,
    options: MockOptions = {},
): Promise<MockApi> {
    const state: MockApi = {
        agendamento: makeAgendamento(options.status, options.vinculado),
        pacoteAtivo: options.pacoteAtivo ? makePacoteAtivo() : null,
        pacotes: options.pacotes ?? PACOTES,
        catalogRequests: 0,
        activeLookups: 0,
        puts: [],
        patches: 0,
    };

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();

        if (method === 'GET' && url.pathname === '/api/auth/me') {
            await route.fulfill({
                status: 200,
                json: { username: 'e2e', role: 'admin' },
            });
        } else if (method === 'GET' && url.pathname === '/api/servicos') {
            await route.fulfill({ status: 200, json: SERVICOS });
        } else if (
            method === 'GET' &&
            url.pathname === `/api/agendamentos/${AGENDAMENTO_ID}`
        ) {
            await route.fulfill({ status: 200, json: state.agendamento });
        } else if (
            method === 'GET' &&
            url.pathname === `/api/pacotes/cliente/${CLIENTE.id}`
        ) {
            state.activeLookups += 1;
            await route.fulfill({ status: 200, json: state.pacoteAtivo });
        } else if (method === 'GET' && url.pathname === '/api/pacotes') {
            state.catalogRequests += 1;
            await route.fulfill({ status: 200, json: state.pacotes });
        } else if (
            method === 'PUT' &&
            url.pathname === `/api/agendamentos/${AGENDAMENTO_ID}`
        ) {
            const payload = JSON.parse(request.postData() ?? '{}') as Record<
                string,
                unknown
            >;
            state.puts.push(payload);
            const failure = options.putResponse?.(payload);
            if (failure) {
                await route.fulfill({
                    status: failure.status,
                    json: failure.body,
                });
                return;
            }

            if (typeof payload.pacoteId === 'string') {
                const pacote = state.pacotes.find(
                    (item) => item.id === payload.pacoteId,
                );
                if (pacote) {
                    state.pacoteAtivo = makePacoteAtivo(pacote);
                    state.agendamento = {
                        ...state.agendamento,
                        pacoteClienteId: PACOTE_CLIENTE_ID,
                        numeroNoPacote: 1,
                        totalServicoNoPacote:
                            pacote.servicos[0].quantidadeTotal,
                    };
                }
            }

            await route.fulfill({ status: 200, json: state.agendamento });
        } else if (
            method === 'PATCH' &&
            url.pathname === `/api/agendamentos/${AGENDAMENTO_ID}/pacote`
        ) {
            state.patches += 1;
            state.agendamento = {
                ...state.agendamento,
                pacoteClienteId: PACOTE_CLIENTE_ID,
                numeroNoPacote: 1,
                totalServicoNoPacote: 4,
            };
            await route.fulfill({ status: 200, json: state.agendamento });
        } else {
            await route.fulfill({
                status: 404,
                json: { message: 'Rota não prevista pelo teste.' },
            });
        }
    });

    return state;
}

async function abrirEdicao(page: Page): Promise<void> {
    await page.goto(`/editar/${AGENDAMENTO_ID}`);
    await expect(page.getByLabel('Serviço')).toBeVisible();
}

async function salvar(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
}

test('vende pacote pelo PUT e mostra vínculo atualizado de N de M', async ({
    page,
}) => {
    const api = await mockApi(page);
    await abrirEdicao(page);

    const catalogo = page.getByLabel('Pacote do catálogo (opcional)');
    await expect(catalogo).toBeVisible();
    await catalogo.selectOption('pacote-corte');
    await expect(
        page.getByText(/R\$\s*120,00 · cobrado à parte/),
    ).toBeVisible();
    await salvar(page);

    await expect.poll(() => api.puts.length).toBe(1);
    expect(api.puts[0]).toMatchObject({
        clienteId: CLIENTE.id,
        servicoId: 'servico-corte',
        pacoteId: 'pacote-corte',
    });
    expect(api.puts[0]).not.toHaveProperty('pacoteClienteId');
    await expect(
        page.getByText('Pacote vinculado a este agendamento'),
    ).toBeVisible();
    await expect(
        page.getByText('Corte mensal — 3 de 4 usos de Corte'),
    ).toBeVisible();
    expect(api.activeLookups).toBe(2);
});

test('oculta venda de catálogo quando cliente tem ciclo ativo e mantém vínculo de crédito', async ({
    page,
}) => {
    const api = await mockApi(page, { pacoteAtivo: true });
    await abrirEdicao(page);

    await expect(page.getByLabel('Pacote do catálogo (opcional)')).toHaveCount(
        0,
    );
    await expect(
        page.getByRole('button', {
            name: 'Vincular pacote a este agendamento',
        }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Vincular pacote a este agendamento' })
        .click();

    await expect(
        page.getByText('Pacote vinculado a este agendamento'),
    ).toBeVisible();
    expect(api.patches).toBe(1);
    expect(api.puts).toHaveLength(0);
    expect(api.catalogRequests).toBe(0);
});

for (const status of ['CONCLUIDO', 'CANCELADO']) {
    test(`oculta venda de catálogo com status ${status.toLowerCase()}`, async ({
        page,
    }) => {
        const api = await mockApi(page, { status });
        await abrirEdicao(page);

        await expect(
            page.getByLabel('Pacote do catálogo (opcional)'),
        ).toHaveCount(0);
        expect(api.catalogRequests).toBe(0);
    });
}

test('oculta seletor quando catálogo não tem pacote para o serviço', async ({
    page,
}) => {
    const api = await mockApi(page, { pacotes: [PACOTES[1]] });
    await abrirEdicao(page);
    await expect.poll(() => api.catalogRequests).toBe(1);

    await expect(page.getByLabel('Pacote do catálogo (opcional)')).toHaveCount(
        0,
    );
});

test('trocar serviço recalcula pacotes elegíveis e limpa seleção inválida', async ({
    page,
}) => {
    await mockApi(page);
    await abrirEdicao(page);

    const catalogo = page.getByLabel('Pacote do catálogo (opcional)');
    await expect(catalogo.locator('option')).toHaveCount(2);
    await catalogo.selectOption('pacote-corte');
    await page.getByLabel('Serviço').selectOption('servico-barba');

    await expect(catalogo).toHaveValue('');
    await expect(catalogo.locator('option')).toHaveCount(2);
    await expect(catalogo.locator('option[value="pacote-corte"]')).toHaveCount(
        0,
    );
    await expect(catalogo.locator('option[value="pacote-barba"]')).toHaveCount(
        1,
    );
});

test('erro PACOTE_ARQUIVADO mantém formulário e pacote selecionado', async ({
    page,
}) => {
    const api = await mockApi(page, {
        putResponse: () => ({
            status: 409,
            body: {
                message: 'Pacote arquivado.',
                code: 'PACOTE_ARQUIVADO',
            },
        }),
    });
    await abrirEdicao(page);
    const catalogo = page.getByLabel('Pacote do catálogo (opcional)');
    await catalogo.selectOption('pacote-corte');
    await salvar(page);

    await expect(page.getByRole('alert')).toContainText(
        'Este pacote foi arquivado e não está mais disponível. Escolha outro pacote.',
    );
    await expect(catalogo).toHaveValue('pacote-corte');
    await expect(page.getByLabel('Serviço')).toHaveValue('servico-corte');
    expect(api.puts[0]).toHaveProperty('pacoteId', 'pacote-corte');
});

test('edição sem pacote mantém PUT sem pacoteId e redirecionamento atual', async ({
    page,
}) => {
    const api = await mockApi(page);
    await abrirEdicao(page);
    await salvar(page);

    await expect.poll(() => api.puts.length).toBe(1);
    expect(api.puts[0]).not.toHaveProperty('pacoteId');
    await expect(page).toHaveURL('/');
});
