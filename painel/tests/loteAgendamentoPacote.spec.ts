import { expect, test, type Page } from '@playwright/test';

const CLIENTES = [
    { id: 'cliente-ana', nome: 'Ana Souza', telefone: '11999990001' },
    { id: 'cliente-bruno', nome: 'Bruno Lima', telefone: '11999990002' },
];

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
        servicos: [
            {
                pacoteId: 'pacote-corte',
                servicoId: 'servico-corte',
                quantidadeTotal: 2,
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
        servicos: [
            {
                pacoteId: 'pacote-barba',
                servicoId: 'servico-barba',
                quantidadeTotal: 1,
                servico: SERVICOS[1],
            },
        ],
    },
    {
        id: 'pacote-corte-capacidade-1',
        nome: 'Corte unitário',
        duracaoDias: 30,
        preco: '45.00',
        liberadoParaGemini: false,
        createdAt: '2026-01-01T12:00:00.000Z',
        servicos: [
            {
                pacoteId: 'pacote-corte-capacidade-1',
                servicoId: 'servico-corte',
                quantidadeTotal: 1,
                servico: SERVICOS[0],
            },
        ],
    },
];

type MockResponse = { status: number; body: unknown };
type MockOptions = {
    activeLookup?: (clienteId: string, attempt: number) => MockResponse;
    simulationResponse?: (payload: Record<string, unknown>) => MockResponse;
    createResponse?: (payload: Record<string, unknown>) => MockResponse;
};

type MockApi = {
    activeLookups: Map<string, number>;
    catalogRequests: number;
    events: string[];
    simulations: Record<string, unknown>[];
    creates: Record<string, unknown>[];
    unexpectedPosts: string[];
    agendaLoads: number;
};

function makeActivePackage(
    clienteId: string,
    quantidadeRestante: number,
): Record<string, unknown> {
    const pacote = PACOTES[0];
    const servico = SERVICOS[0];
    return {
        id: `pacote-cliente-${clienteId}`,
        clienteId,
        pacoteId: pacote.id,
        dataInicio: '2026-01-01T12:00:00.000Z',
        status: 'ATIVO',
        createdAt: '2026-01-01T12:00:00.000Z',
        pacote,
        servicos: [
            {
                id: `saldo-${clienteId}`,
                pacoteClienteId: `pacote-cliente-${clienteId}`,
                servicoId: servico.id,
                quantidadeTotal: 4,
                quantidadeRestante,
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
        activeLookups: new Map(),
        catalogRequests: 0,
        events: [],
        simulations: [],
        creates: [],
        unexpectedPosts: [],
        agendaLoads: 0,
    };

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        let response: MockResponse = {
            status: 404,
            body: { message: 'Rota não prevista pelo teste.' },
        };

        if (method === 'GET' && url.pathname === '/api/auth/me') {
            response = {
                status: 200,
                body: { username: 'e2e', role: 'admin' },
            };
        } else if (method === 'GET' && url.pathname === '/api/agendamentos') {
            state.agendaLoads += 1;
            response = { status: 200, body: [] };
        } else if (method === 'GET' && url.pathname === '/api/clientes') {
            response = { status: 200, body: CLIENTES };
        } else if (method === 'GET' && url.pathname === '/api/servicos') {
            response = { status: 200, body: SERVICOS };
        } else if (
            method === 'GET' &&
            url.pathname.startsWith('/api/pacotes/cliente/')
        ) {
            const clienteId = url.pathname.split('/').at(-1) ?? '';
            const attempt = (state.activeLookups.get(clienteId) ?? 0) + 1;
            state.activeLookups.set(clienteId, attempt);
            state.events.push('pacote-ativo');
            response = options.activeLookup?.(clienteId, attempt) ?? {
                status: 200,
                body: null,
            };
        } else if (method === 'GET' && url.pathname === '/api/pacotes') {
            state.catalogRequests += 1;
            state.events.push('catalogo');
            response = { status: 200, body: PACOTES };
        } else if (
            method === 'POST' &&
            url.pathname === '/api/agendamentos/lote/simular'
        ) {
            const payload = JSON.parse(request.postData() ?? '{}') as Record<
                string,
                unknown
            >;
            state.simulations.push(payload);
            response = options.simulationResponse?.(payload) ?? {
                status: 200,
                body: { disponiveis: payload.slots, conflitos: [] },
            };
        } else if (
            method === 'POST' &&
            url.pathname === '/api/agendamentos/lote'
        ) {
            const payload = JSON.parse(request.postData() ?? '{}') as Record<
                string,
                unknown
            >;
            state.creates.push(payload);
            response = options.createResponse?.(payload) ?? {
                status: 201,
                body: {
                    loteId: 'lote-mock',
                    criados: [
                        {
                            agendamentoId: 'agendamento-mock',
                            data: '2026-11-15',
                            horario: '10:00',
                        },
                    ],
                    falhados: [],
                    ...(typeof payload.pacoteId === 'string'
                        ? { pacoteClienteId: 'pacote-cliente-mock' }
                        : {}),
                },
            };
        } else if (method === 'POST') {
            state.unexpectedPosts.push(url.pathname);
            response = {
                status: 501,
                body: { message: 'POST inesperado interceptado.' },
            };
        }

        await route.fulfill({ status: response.status, json: response.body });
    });

    return state;
}

async function abrirLote(page: Page, nome = 'Ana Souza'): Promise<void> {
    await page.goto('/');
    await page.getByRole('button', { name: 'Lote' }).click();
    await expect(
        page.getByRole('heading', { name: 'Agendar em lote' }),
    ).toBeVisible();
    await page.getByLabel('Cliente').fill(nome);
    await page.getByRole('button', { name: new RegExp(nome) }).click();
}

async function avançarParaDatas(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Próximo', exact: true }).click();
    await expect(page.getByText('Selecione as datas')).toBeVisible();
}

async function selecionarDias(page: Page, dias: number[]): Promise<void> {
    const calendar = page
        .getByText('Selecione as datas')
        .locator('..')
        .locator('..')
        .locator('..');
    await calendar.getByRole('button', { name: 'Próximo mês' }).click();
    for (const dia of dias) {
        await calendar
            .getByRole('button', { name: String(dia), exact: true })
            .click();
    }
}

async function simularEAvançar(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Simular' }).click();
    await page.getByRole('button', { name: 'Avançar' }).click();
}

async function confirmar(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Confirmar' }).click();
}

test('catálogo aparece somente após consulta ativa confirmar ausência', async ({
    page,
}) => {
    const api = await mockApi(page);
    await abrirLote(page);

    await expect(
        page.getByLabel('Pacote do catálogo (opcional)'),
    ).toBeVisible();
    expect(api.events.slice(0, 2)).toEqual(['pacote-ativo', 'catalogo']);
    expect(api.unexpectedPosts).toEqual([]);
});

test('filtra serviço, mostra preço do pacote e omite preço avulso', async ({
    page,
}) => {
    await mockApi(page);
    await abrirLote(page);
    const pacoteSelect = page.getByLabel('Pacote do catálogo (opcional)');
    await pacoteSelect.selectOption('pacote-barba');

    const servicoSelect = page.getByLabel('Serviço');
    await expect(servicoSelect.locator('option')).toHaveCount(2);
    await expect(servicoSelect.locator('option').nth(1)).toHaveText('Barba');
    await expect(servicoSelect).toHaveValue('');
    await servicoSelect.selectOption('servico-barba');
    await expect(page.getByText(/R\$\s*65,00 · cobrado à parte/)).toBeVisible();
    await expect(
        page.getByText(/R\$\s*65,00(?! · cobrado à parte)/),
    ).toHaveCount(0);
});

test('pacote ativo com saldo mantém fluxo e oculta catálogo', async ({
    page,
}) => {
    const api = await mockApi(page, {
        activeLookup: (clienteId) => ({
            status: 200,
            body: makeActivePackage(clienteId, 2),
        }),
    });
    await abrirLote(page);

    const checkbox = page.getByRole('checkbox', {
        name: /Vincular ao pacote ativo/,
    });
    await expect(checkbox).toBeVisible();
    await expect(page.getByLabel('Pacote do catálogo (opcional)')).toHaveCount(
        0,
    );
    await checkbox.locator('..').click();
    await avançarParaDatas(page);
    await selecionarDias(page, [15]);
    await simularEAvançar(page);
    await confirmar(page);

    expect(api.simulations[0]).toHaveProperty(
        'pacoteClienteId',
        'pacote-cliente-cliente-ana',
    );
    expect(api.creates[0]).toHaveProperty(
        'pacoteClienteId',
        'pacote-cliente-cliente-ana',
    );
    expect(api.creates[0]).not.toHaveProperty('pacoteId');
});

test('trocar cliente limpa vínculo com pacote ativo no lote', async ({
    page,
}) => {
    const api = await mockApi(page, {
        activeLookup: (clienteId) => ({
            status: 200,
            body: makeActivePackage(clienteId, 2),
        }),
    });
    await abrirLote(page);

    const checkbox = page.getByRole('checkbox', {
        name: /Vincular ao pacote ativo/,
    });
    await checkbox.locator('..').click();
    await expect(checkbox).toBeChecked();

    await page.getByRole('textbox', { name: 'Cliente' }).fill('Bruno');
    await page.getByRole('button', { name: /Bruno Lima/ }).click();
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    await page.getByLabel('Serviço').selectOption('servico-corte');
    await avançarParaDatas(page);
    await selecionarDias(page, [15]);
    await simularEAvançar(page);
    await confirmar(page);
    await expect.poll(() => api.creates).toHaveLength(1);

    expect(api.simulations[0]).toHaveProperty('clienteId', 'cliente-bruno');
    expect(api.simulations[0]).not.toHaveProperty('pacoteClienteId');
    expect(api.creates[0]).not.toHaveProperty('pacoteClienteId');
});

test('pacote ativo sem saldo exibe aviso e mantém catálogo oculto', async ({
    page,
}) => {
    const api = await mockApi(page, {
        activeLookup: (clienteId) => ({
            status: 200,
            body: makeActivePackage(clienteId, 0),
        }),
    });
    await abrirLote(page);

    await expect(page.getByText(/sem saldo utilizável/)).toBeVisible();
    await expect(page.getByLabel('Pacote do catálogo (opcional)')).toHaveCount(
        0,
    );
    expect(api.catalogRequests).toBe(0);
});

test('falha ao consultar pacote ativo oferece retry sem bloquear lote simples', async ({
    page,
}) => {
    const api = await mockApi(page, {
        activeLookup: (_clienteId, attempt) =>
            attempt === 1
                ? { status: 503, body: { message: 'Falha temporária' } }
                : { status: 200, body: null },
    });
    await abrirLote(page);

    await expect(page.getByRole('alert')).toContainText('Falha temporária');
    await expect(page.getByLabel('Pacote do catálogo (opcional)')).toHaveCount(
        0,
    );
    await expect(page.getByLabel('Serviço')).toBeVisible();
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(
        page.getByLabel('Pacote do catálogo (opcional)'),
    ).toBeVisible();
    expect(api.activeLookups.get('cliente-ana')).toBe(2);
});

test('limite e contador impedem selecionar acima da capacidade', async ({
    page,
}) => {
    await mockApi(page);
    await abrirLote(page);
    await page
        .getByLabel('Pacote do catálogo (opcional)')
        .selectOption('pacote-corte-capacidade-1');
    await avançarParaDatas(page);
    await selecionarDias(page, [15, 16]);

    await expect(page.getByText('2 de 1 horários')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('no máximo 1');
    await expect(page.getByRole('button', { name: 'Simular' })).toBeDisabled();
});

test('excesso retornado pela simulação vira conflito e bloqueia confirmação', async ({
    page,
}) => {
    const api = await mockApi(page, {
        simulationResponse: (payload) => ({
            status: 200,
            body: {
                disponiveis: (
                    payload.slots as { data: string; horario: string }[]
                ).slice(0, 1),
                conflitos: [
                    {
                        data: '2026-11-16',
                        horario: '10:00',
                        motivo: 'Todos os usos restantes já estão agendados.',
                    },
                ],
            },
        }),
    });
    await abrirLote(page);
    await page
        .getByLabel('Pacote do catálogo (opcional)')
        .selectOption('pacote-corte');
    await avançarParaDatas(page);
    await selecionarDias(page, [15, 16]);
    await page.getByRole('button', { name: 'Simular' }).click();

    await expect(page.getByText(/Todos os usos restantes/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Avançar' })).toBeDisabled();
    expect(api.simulations[0]).toHaveProperty('pacoteId', 'pacote-corte');
    expect(api.simulations[0]).not.toHaveProperty('pacoteClienteId');
});

test('simulação e criação enviam pacoteId exclusivo e sucesso fecha modal', async ({
    page,
}) => {
    const api = await mockApi(page);
    await abrirLote(page);
    await page
        .getByLabel('Pacote do catálogo (opcional)')
        .selectOption('pacote-corte');
    await avançarParaDatas(page);
    await selecionarDias(page, [15]);
    await simularEAvançar(page);
    await expect(
        page.getByText(/será criado e vinculado ao cliente ao salvar/),
    ).toBeVisible();
    await expect(page.getByText(/Tudo ou nada/)).toBeVisible();
    await confirmar(page);
    await expect.poll(() => api.creates).toHaveLength(1);

    expect(api.simulations[0]).toMatchObject({
        clienteId: 'cliente-ana',
        servicoId: 'servico-corte',
        pacoteId: 'pacote-corte',
        slots: [expect.objectContaining({ data: '2026-11-15' })],
    });
    expect(api.simulations[0]).not.toHaveProperty('pacoteClienteId');
    expect(api.creates[0]).toEqual(api.simulations[0]);
    await expect(
        page.getByRole('heading', { name: 'Agendar em lote' }),
    ).toHaveCount(0);
    expect(api.unexpectedPosts).toEqual([]);
});

test('409 atômico mostra horário e motivo, sem fechar modal', async ({
    page,
}) => {
    const api = await mockApi(page, {
        createResponse: () => ({
            status: 409,
            body: {
                message: 'Você já tem agendamento nesse horário.',
                slot: { data: '2026-11-15', horario: '10:00' },
                motivo: 'conflito_horario',
            },
        }),
    });
    await abrirLote(page);
    await page
        .getByLabel('Pacote do catálogo (opcional)')
        .selectOption('pacote-corte');
    await avançarParaDatas(page);
    await selecionarDias(page, [15]);
    await simularEAvançar(page);
    await confirmar(page);

    await expect(
        page.getByText(/15\/11\/2026 às 10:00: Este horário já está ocupado/),
    ).toBeVisible();
    await expect(page.getByText(/Este horário já está ocupado/)).toBeVisible();
    await expect(page.getByText('Nada foi criado.')).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Agendar em lote' }),
    ).toBeVisible();
    expect(api.creates).toHaveLength(1);
});

test('409 por pacote ativo divergente recarrega vínculo sem aplicá-lo', async ({
    page,
}) => {
    const api = await mockApi(page, {
        activeLookup: (clienteId, attempt) =>
            attempt === 1
                ? { status: 200, body: null }
                : {
                      status: 200,
                      body: makeActivePackage(clienteId, 2),
                  },
        createResponse: () => ({
            status: 409,
            body: {
                message:
                    'Cliente já possui pacote ativo diferente do pacote selecionado.',
            },
        }),
    });
    await abrirLote(page);
    await page
        .getByLabel('Pacote do catálogo (opcional)')
        .selectOption('pacote-corte');
    await avançarParaDatas(page);
    await selecionarDias(page, [15]);
    await simularEAvançar(page);
    const activeLookupsBeforeCreate = api.activeLookups.get('cliente-ana') ?? 0;
    await confirmar(page);

    await expect(
        page.getByRole('checkbox', { name: /Vincular ao pacote ativo/ }),
    ).toBeVisible();
    await expect(page.getByLabel('Pacote do catálogo (opcional)')).toHaveCount(
        0,
    );
    await expect(
        page.getByRole('checkbox', { name: /Vincular ao pacote ativo/ }),
    ).not.toBeChecked();
    await expect(page.getByLabel('Serviço')).toHaveValue('servico-corte');
    expect(api.activeLookups.get('cliente-ana')).toBeGreaterThan(
        activeLookupsBeforeCreate,
    );
    expect(api.creates[0]).toHaveProperty('pacoteId', 'pacote-corte');
    expect(api.creates[0]).not.toHaveProperty('pacoteClienteId');
});

test('resposta parcial mostra contagens e falhas antes de atualizar agenda', async ({
    page,
}) => {
    const api = await mockApi(page, {
        createResponse: () => ({
            status: 201,
            body: {
                loteId: 'lote-parcial',
                criados: [
                    {
                        agendamentoId: 'agendamento-ok',
                        data: '2026-11-15',
                        horario: '10:00',
                    },
                ],
                falhados: [
                    {
                        data: '2026-11-16',
                        horario: '10:00',
                        motivo: 'Horário ocupado.',
                    },
                ],
            },
        }),
    });
    await abrirLote(page);
    await avançarParaDatas(page);
    await selecionarDias(page, [15, 16]);
    await simularEAvançar(page);
    const cargasAntes = api.agendaLoads;
    await confirmar(page);

    await expect(
        page.getByRole('heading', { name: 'Lote parcialmente criado' }),
    ).toBeVisible();
    await expect(page.getByText('1 criados · 1 falharam.')).toBeVisible();
    await expect(page.getByText(/16\/11\/2026 às 10:00/)).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Agendar em lote' }),
    ).toBeVisible();
    expect(api.agendaLoads).toBe(cargasAntes);

    await page.getByRole('button', { name: 'Atualizar agenda' }).click();
    await expect(
        page.getByRole('heading', { name: 'Agendar em lote' }),
    ).toHaveCount(0);
    await expect.poll(() => api.agendaLoads).toBe(cargasAntes + 1);
});

test('lote sem pacote mantém payload e sucesso atual', async ({ page }) => {
    const api = await mockApi(page);
    await abrirLote(page);
    await avançarParaDatas(page);
    await selecionarDias(page, [15]);
    await simularEAvançar(page);
    await confirmar(page);

    expect(api.simulations[0]).not.toHaveProperty('pacoteId');
    expect(api.simulations[0]).not.toHaveProperty('pacoteClienteId');
    expect(api.simulations[0]).not.toHaveProperty('permitirForaDoExpediente');
    expect(api.creates[0]).not.toHaveProperty('pacoteId');
    expect(api.creates[0]).not.toHaveProperty('pacoteClienteId');
    expect(api.creates[0]).not.toHaveProperty('permitirForaDoExpediente');
    await expect(
        page.getByRole('heading', { name: 'Agendar em lote' }),
    ).toHaveCount(0);
    expect(api.unexpectedPosts).toEqual([]);
});
