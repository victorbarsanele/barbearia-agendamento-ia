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

type MockResponse = { status: number; body: unknown };
type MockOptions = {
    activeLookup?: (clienteId: string, attempt: number) => MockResponse;
    createResponse?: (attempt: number) => MockResponse;
};

type MockApi = {
    activeLookups: Map<string, number>;
    catalogRequests: number;
    posts: Record<string, unknown>[];
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
        posts: [],
    };
    let createAttempts = 0;

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        let response: MockResponse = {
            status: 501,
            body: { message: 'Endpoint não previsto pelo teste.' },
        };

        if (method === 'GET' && url.pathname === '/api/auth/me') {
            response = {
                status: 200,
                body: { username: 'e2e', role: 'admin' },
            };
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
            response = options.activeLookup?.(clienteId, attempt) ?? {
                status: 200,
                body: null,
            };
        } else if (method === 'GET' && url.pathname === '/api/pacotes') {
            state.catalogRequests += 1;
            response = { status: 200, body: PACOTES };
        } else if (method === 'POST' && url.pathname === '/api/agendamentos') {
            const payload = JSON.parse(request.postData() ?? '{}') as Record<
                string,
                unknown
            >;
            state.posts.push(payload);
            createAttempts += 1;
            response = options.createResponse?.(createAttempts) ?? {
                status: 201,
                body: { id: 'agendamento-mock' },
            };
        }

        await route.fulfill({ status: response.status, json: response.body });
    });

    return state;
}

async function selecionarCliente(page: Page, nome: string): Promise<void> {
    await page.getByLabel('Buscar cliente').fill(nome);
    await page.getByRole('button', { name: new RegExp(nome) }).click();
}

async function selecionarServico(page: Page, nome: string): Promise<void> {
    const radio = page.getByRole('radio', { name: new RegExp(nome) });
    if (!(await radio.isChecked())) {
        await radio.locator('..').click();
    }
}

async function selecionarDataHoraFutura(page: Page): Promise<void> {
    const calendario = page
        .getByText('SELECIONE UMA DATA')
        .locator('..')
        .locator('..')
        .locator('..');
    await calendario.getByRole('button', { name: 'Próximo mês' }).click();
    await calendario.getByRole('button', { name: '15', exact: true }).click();

    const seletorHora = page.getByText('SELECIONE UM HORÁRIO').locator('..');
    await seletorHora.getByRole('button', { name: '10', exact: true }).click();
    await seletorHora.getByRole('button', { name: '00', exact: true }).click();
}

async function configurarMinAntecedencia(
    page: Page,
    status: number,
    body: unknown,
): Promise<void> {
    await page.route('**/api/configuracao-agendamento', async (route) => {
        await route.fulfill({ status, json: body });
    });
}

async function abrirNovoAgendamentoHoje(page: Page): Promise<void> {
    await page.clock.install({
        time: new Date('2026-10-22T12:10:00.000Z'),
    });
    const respostaConfiguracao = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname ===
            '/api/configuracao-agendamento',
    );
    await page.goto('/novo');
    await respostaConfiguracao;
    await selecionarCliente(page, 'Ana Souza');
    await selecionarServico(page, 'Corte');

    const calendario = page
        .getByText('SELECIONE UMA DATA')
        .locator('..')
        .locator('..')
        .locator('..');
    await calendario.getByRole('button', { name: '22', exact: true }).click();
}

async function salvar(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Salvar agendamento' }).click();
}

test('catálogo filtra serviços, mostra valor e envia apenas pacoteId', async ({
    page,
}) => {
    const api = await mockApi(page);
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');

    const catalogo = page.getByLabel('Pacote do catálogo (opcional)');
    await expect(catalogo).toBeVisible();
    await expect(catalogo.locator('option')).toHaveCount(3);

    await catalogo.selectOption('pacote-corte');
    await expect(page.getByRole('radio', { name: /Corte/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Barba/ })).toHaveCount(0);
    await expect(
        page.getByText(/R\$\s*120,00 · cobrado à parte/),
    ).toBeVisible();
    await expect(page.getByRole('radio', { name: /30 min/ })).toBeVisible();

    await catalogo.selectOption('pacote-barba');
    await expect(page.getByRole('radio', { name: /Barba/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Corte/ })).toHaveCount(0);
    await expect(page.getByText(/R\$\s*65,00 · cobrado à parte/)).toBeVisible();

    await catalogo.selectOption('pacote-corte');
    await selecionarServico(page, 'Corte');
    await selecionarDataHoraFutura(page);
    await salvar(page);

    await expect.poll(() => api.posts.length).toBe(1);
    expect(api.posts[0]).toMatchObject({
        clienteId: 'cliente-ana',
        servicoId: 'servico-corte',
        pacoteId: 'pacote-corte',
    });
    expect(api.posts[0]).not.toHaveProperty('pacoteClienteId');
});

test('sem pacote mantém o payload avulso sem campos de pacote', async ({
    page,
}) => {
    const api = await mockApi(page);
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');
    await expect(
        page.getByLabel('Pacote do catálogo (opcional)'),
    ).toBeVisible();
    await selecionarServico(page, 'Corte');
    await selecionarDataHoraFutura(page);
    await salvar(page);

    await expect.poll(() => api.posts.length).toBe(1);
    expect(api.posts[0]).toMatchObject({
        clienteId: 'cliente-ana',
        servicoId: 'servico-corte',
    });
    expect(api.posts[0]).not.toHaveProperty('pacoteId');
    expect(api.posts[0]).not.toHaveProperty('pacoteClienteId');
});

test('configuração de 15 minutos libera horário de hoje a 20 minutos', async ({
    page,
}) => {
    await mockApi(page);
    await configurarMinAntecedencia(page, 200, {
        minAntecedenciaMinutos: 15,
    });
    await abrirNovoAgendamentoHoje(page);

    const seletorHora = page.getByText('SELECIONE UM HORÁRIO').locator('..');
    await expect(
        seletorHora.getByRole('button', { name: '09', exact: true }),
    ).toBeEnabled();
    await seletorHora.getByRole('button', { name: '09', exact: true }).click();
    await expect(
        seletorHora.getByRole('button', { name: '30', exact: true }),
    ).toBeEnabled();
});

test('falha de configuração mantém fallback de 60 minutos e permite horário posterior', async ({
    page,
}) => {
    const api = await mockApi(page);
    await configurarMinAntecedencia(page, 500, {
        message: 'Falha ao carregar configuração.',
    });
    await abrirNovoAgendamentoHoje(page);

    const seletorHora = page.getByText('SELECIONE UM HORÁRIO').locator('..');
    await expect(
        seletorHora.getByRole('button', { name: '09', exact: true }),
    ).toBeDisabled();
    await seletorHora.getByRole('button', { name: '10', exact: true }).click();
    await seletorHora
        .getByRole('button', { name: '15', exact: true })
        .last()
        .click();
    await salvar(page);

    await expect.poll(() => api.posts.length).toBe(1);
});

test('fora do expediente exige confirmação e reenvia o mesmo payload com override', async ({
    page,
}) => {
    const api = await mockApi(page, {
        createResponse: (attempt) =>
            attempt === 1
                ? {
                      status: 422,
                      body: {
                          message: 'Horário fora do expediente.',
                          code: 'FORA_DO_EXPEDIENTE',
                          motivos: ['fora_funcionamento', 'almoco'],
                      },
                  }
                : { status: 201, body: { id: 'agendamento-mock' } },
    });
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');
    await selecionarServico(page, 'Corte');
    await selecionarDataHoraFutura(page);
    await salvar(page);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Fora do horário de funcionamento');
    await expect(dialog).toContainText('Horário de almoço');
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await expect.poll(() => api.posts.length).toBe(1);
    expect(api.posts[0]).not.toHaveProperty('permitirForaDoExpediente');

    await dialog.getByRole('button', { name: 'Encaixar mesmo assim' }).click();
    await expect.poll(() => api.posts.length).toBe(2);
    expect(api.posts[1]).toEqual({
        ...api.posts[0],
        permitirForaDoExpediente: true,
    });
});

test('cancelar confirmação de expediente não reenvia agendamento', async ({
    page,
}) => {
    const api = await mockApi(page, {
        createResponse: () => ({
            status: 422,
            body: {
                message: 'Horário fora do expediente.',
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['dia_fechado'],
            },
        }),
    });
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');
    await selecionarServico(page, 'Corte');
    await selecionarDataHoraFutura(page);
    await salvar(page);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Salvar agendamento' }),
    ).toBeFocused();
    expect(api.posts).toHaveLength(1);
});

test('conflito duro continua inline e não oferece override', async ({
    page,
}) => {
    const api = await mockApi(page, {
        createResponse: () => ({
            status: 409,
            body: {
                message: 'Já existe um agendamento nesse horário.',
                code: 'CONFLITO_HORARIO',
            },
        }),
    });
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');
    await selecionarServico(page, 'Corte');
    await selecionarDataHoraFutura(page);
    await salvar(page);

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(
        page.getByText('Já existe um agendamento nesse horário.'),
    ).toBeVisible();
    expect(api.posts).toHaveLength(1);
});

test('pacote ativo com saldo oculta catálogo e alterna o vínculo', async ({
    page,
}) => {
    const api = await mockApi(page, {
        activeLookup: (clienteId) => ({
            status: 200,
            body: makeActivePackage(clienteId, 2),
        }),
    });
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');

    const usarPacote = page.getByRole('checkbox', {
        name: /Usar pacote ativo/,
    });
    await expect(usarPacote).toBeVisible();
    await expect(usarPacote).not.toBeChecked();
    await expect(page.getByLabel('Pacote do catálogo (opcional)')).toHaveCount(
        0,
    );
    await usarPacote.locator('..').click();
    await expect(usarPacote).toBeChecked();
    await usarPacote.locator('..').click();
    await usarPacote.locator('..').click();

    await selecionarServico(page, 'Corte');
    await selecionarDataHoraFutura(page);
    await salvar(page);

    await expect.poll(() => api.posts.length).toBe(1);
    expect(api.posts[0]).toHaveProperty(
        'pacoteClienteId',
        'pacote-cliente-cliente-ana',
    );
    expect(api.posts[0]).not.toHaveProperty('pacoteId');
    expect(api.catalogRequests).toBe(0);
});

test('botão Trocar limpa vínculo ativo antes de selecionar outro cliente', async ({
    page,
}) => {
    const api = await mockApi(page, {
        activeLookup: (clienteId) => ({
            status: 200,
            body: makeActivePackage(clienteId, 2),
        }),
    });
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');

    const usarPacote = page.getByRole('checkbox', {
        name: /Usar pacote ativo/,
    });
    await expect(usarPacote).toBeVisible();
    await usarPacote.locator('..').click();
    await expect(usarPacote).toBeChecked();

    await page.getByRole('button', { name: 'Trocar', exact: true }).click();
    await selecionarCliente(page, 'Bruno Lima');
    await expect(usarPacote).toBeVisible();
    await expect(usarPacote).not.toBeChecked();

    await selecionarServico(page, 'Corte');
    await selecionarDataHoraFutura(page);
    await salvar(page);
    await expect.poll(() => api.posts.length).toBe(1);

    expect(api.posts[0]).toHaveProperty('clienteId', 'cliente-bruno');
    expect(api.posts[0]).not.toHaveProperty('pacoteClienteId');
});

test('pacote ativo sem saldo avisa e não carrega catálogo', async ({
    page,
}) => {
    const api = await mockApi(page, {
        activeLookup: (clienteId) => ({
            status: 200,
            body: makeActivePackage(clienteId, 0),
        }),
    });
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');

    await expect(
        page.getByText(/pacote ativo sem saldo utilizável/),
    ).toBeVisible();
    await expect(page.getByLabel('Pacote do catálogo (opcional)')).toHaveCount(
        0,
    );
    expect(api.catalogRequests).toBe(0);
});

test('falha ao consultar pacote ativo bloqueia catálogo até nova tentativa', async ({
    page,
}) => {
    const api = await mockApi(page, {
        activeLookup: (_clienteId, attempt) =>
            attempt === 1
                ? {
                      status: 503,
                      body: { message: 'Falha temporária' },
                  }
                : { status: 200, body: null },
    });
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');

    await expect(page.getByRole('alert')).toContainText('Falha temporária');
    await expect(page.getByLabel('Pacote do catálogo (opcional)')).toHaveCount(
        0,
    );
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(
        page.getByLabel('Pacote do catálogo (opcional)'),
    ).toBeVisible();
    expect(api.activeLookups.get('cliente-ana')).toBe(2);
    await expect.poll(() => api.catalogRequests).toBe(1);
});

test('trocar cliente limpa pacote selecionado e preserva data e hora', async ({
    page,
}) => {
    await mockApi(page);
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');
    const catalogo = page.getByLabel('Pacote do catálogo (opcional)');
    await expect(catalogo).toBeVisible();
    await catalogo.selectOption('pacote-corte');
    await selecionarServico(page, 'Corte');
    await selecionarDataHoraFutura(page);

    const linhaDataHora = page
        .getByText('Data e hora', { exact: true })
        .locator('..');
    const resumoAnterior = await linhaDataHora.locator('dd').innerText();

    await page.getByLabel('Buscar cliente').fill('Bruno');
    await page.getByRole('button', { name: /Bruno Lima/ }).click();
    await expect(catalogo).toHaveValue('');
    await selecionarServico(page, 'Corte');
    await expect(linhaDataHora.locator('dd')).toHaveText(resumoAnterior);
});

test('409 mantém formulário e recarrega pacote ativo sem selecioná-lo', async ({
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
    await page.goto('/novo');
    await selecionarCliente(page, 'Ana Souza');
    await page
        .getByLabel('Pacote do catálogo (opcional)')
        .selectOption('pacote-corte');
    await selecionarServico(page, 'Corte');
    await selecionarDataHoraFutura(page);
    const linhaDataHora = page
        .getByText('Data e hora', { exact: true })
        .locator('..');
    const resumoAnterior = await linhaDataHora.locator('dd').innerText();

    await salvar(page);

    await expect(
        page.getByText(/agora possui outro pacote ativo/),
    ).toBeVisible();
    const usarPacote = page.getByRole('checkbox', {
        name: /Usar pacote ativo/,
    });
    await expect(usarPacote).toBeVisible();
    await expect(usarPacote).not.toBeChecked();
    await expect(page.getByRole('radio', { name: /Corte/ })).toBeChecked();
    await expect(linhaDataHora.locator('dd')).toHaveText(resumoAnterior);
    expect(api.activeLookups.get('cliente-ana')).toBe(2);
    expect(api.posts[0]).toHaveProperty('pacoteId', 'pacote-corte');
    expect(api.posts[0]).not.toHaveProperty('pacoteClienteId');
});
