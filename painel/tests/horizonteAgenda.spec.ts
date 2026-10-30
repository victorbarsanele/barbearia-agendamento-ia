import { expect, test, type Page } from '@playwright/test';

interface ConfiguracaoAgendamento {
    minAntecedenciaMinutos: number;
    horizonteDias: number | null;
    limiteAte: string | null;
    horizontePadraoDias: number;
    horizonteEfetivo: string;
    limiteAtivo: boolean;
}

interface MockResponse {
    status: number;
    body: unknown;
}

interface MockOptions {
    initial?: ConfiguracaoAgendamento;
    getResponses?: MockResponse[];
    putResponse?: MockResponse;
}

interface MockApi {
    gets: number;
    puts: Record<string, unknown>[];
}

const CONFIG_PADRAO: ConfiguracaoAgendamento = {
    minAntecedenciaMinutos: 60,
    horizonteDias: null,
    limiteAte: null,
    horizontePadraoDias: 20,
    horizonteEfetivo: '2026-11-19',
    limiteAtivo: false,
};

const CONFIG_ATIVA: ConfiguracaoAgendamento = {
    ...CONFIG_PADRAO,
    horizonteDias: 30,
    limiteAte: '2026-11-20',
    horizonteEfetivo: '2026-11-20',
    limiteAtivo: true,
};

async function mockApi(
    page: Page,
    options: MockOptions = {},
): Promise<MockApi> {
    const state: MockApi = { gets: 0, puts: [] };

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        let response: MockResponse = {
            status: 404,
            body: { message: 'Rota não prevista pelo teste.' },
        };

        if (request.method() === 'GET' && url.pathname === '/api/auth/me') {
            response = {
                status: 200,
                body: { username: 'e2e', role: 'admin' },
            };
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/configuracao-agendamento'
        ) {
            response = options.getResponses?.[state.gets] ?? {
                status: 200,
                body: options.initial ?? CONFIG_PADRAO,
            };
            state.gets += 1;
        } else if (
            request.method() === 'PUT' &&
            url.pathname === '/api/configuracao-agendamento/horizonte'
        ) {
            state.puts.push(
                JSON.parse(request.postData() ?? '{}') as Record<
                    string,
                    unknown
                >,
            );
            response = options.putResponse ?? {
                status: 200,
                body: options.initial ?? CONFIG_PADRAO,
            };
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/horarios-funcionamento'
        ) {
            response = { status: 200, body: Array(7).fill(null) };
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/agendamentos'
        ) {
            response = { status: 200, body: [] };
        }

        await route.fulfill({ status: response.status, json: response.body });
    });

    return state;
}

async function abrirPagina(
    page: Page,
    options: MockOptions = {},
): Promise<MockApi> {
    await page.clock.install({ time: new Date('2026-10-30T15:00:00.000Z') });
    const api = await mockApi(page, options);
    await page.goto('/horizonte-agenda');
    await expect(
        page.getByRole('heading', { name: 'Horizonte da agenda' }),
    ).toBeVisible();
    return api;
}

async function escolherTeto(page: Page, mesesAFrente: number): Promise<void> {
    await page.getByRole('button', { name: 'Sem teto' }).click();
    for (let mes = 0; mes < mesesAFrente; mes += 1) {
        await page.getByRole('button', { name: 'Próximo mês' }).click();
    }
    await page.getByRole('button', { name: '15', exact: true }).click();
}

test('carrega configuração padrão e horizonte efetivo', async ({ page }) => {
    await abrirPagina(page);

    await expect(page.getByLabel('Janela (dias à frente)')).toHaveValue('');
    await expect(page.getByTestId('horizonte-preview')).toContainText(
        '19/11/2026',
    );
    await expect(
        page.getByText(/informado pelo servidor: 19\/11\/2026/),
    ).toBeVisible();
});

test('carrega janela e teto ativos com data efetiva', async ({ page }) => {
    await abrirPagina(page, { initial: CONFIG_ATIVA });

    await expect(page.getByLabel('Janela (dias à frente)')).toHaveValue('30');
    await expect(
        page.getByRole('button', { name: '20/11/2026' }),
    ).toBeVisible();
    await expect(page.getByTestId('horizonte-preview')).toContainText(
        '20/11/2026',
    );
});

test('falha de carga permite tentar novamente', async ({ page }) => {
    const api = await abrirPagina(page, {
        getResponses: [
            {
                status: 500,
                body: { message: 'Falha ao carregar configuração.' },
            },
            {
                status: 500,
                body: { message: 'Falha ao carregar configuração.' },
            },
        ],
    });

    await expect(page.getByRole('alert')).toContainText(
        'Falha ao carregar configuração.',
    );
    await page.getByRole('button', { name: 'Tentar novamente' }).click();

    await expect(page.getByLabel('Janela (dias à frente)')).toBeVisible();
    await expect(page.getByTestId('horizonte-preview')).toContainText(
        '19/11/2026',
    );
    expect(api.gets).toBe(3);
});

test('preview muda ao vivo e avisa quando teto não restringe janela', async ({
    page,
}) => {
    await abrirPagina(page);
    await page.getByLabel('Janela (dias à frente)').fill('40');

    await expect(page.getByTestId('horizonte-preview')).toContainText(
        '09/12/2026',
    );
    await escolherTeto(page, 2);

    await expect(page.getByTestId('horizonte-preview')).toContainText(
        '09/12/2026',
    );
    await expect(page.getByText(/o teto só encurta a janela/i)).toBeVisible();
});

test('validação do cliente bloqueia janela inválida', async ({ page }) => {
    const api = await abrirPagina(page);
    await page.getByLabel('Janela (dias à frente)').fill('181');

    await expect(
        page.getByText('A janela deve ter entre 1 e 180 dias.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(api.puts).toHaveLength(0);
});

test('salva body exato e mostra horizonte efetivo retornado', async ({
    page,
}) => {
    const configuracaoSalva: ConfiguracaoAgendamento = {
        ...CONFIG_PADRAO,
        horizonteDias: 30,
        limiteAte: '2026-12-15',
        horizonteEfetivo: '2026-11-29',
        limiteAtivo: true,
    };
    const api = await abrirPagina(page, {
        putResponse: { status: 200, body: configuracaoSalva },
    });
    await page.getByLabel('Janela (dias à frente)').fill('30');
    await escolherTeto(page, 2);
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect.poll(() => api.puts.length).toBe(1);
    expect(api.puts[0]).toEqual({
        horizonteDias: 30,
        limiteAte: '2026-12-15',
    });
    await expect(
        page.getByText(/informado pelo servidor: 29\/11\/2026/),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
        'Horizonte da agenda atualizado.',
    );
});

test('exibe mensagem do servidor em erro 400', async ({ page }) => {
    const api = await abrirPagina(page, {
        putResponse: {
            status: 400,
            body: { message: 'limiteAte não pode ultrapassar 2027-04-28.' },
        },
    });
    await page.getByLabel('Janela (dias à frente)').fill('30');
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('alert')).toContainText(
        'limiteAte não pode ultrapassar 2027-04-28.',
    );
    expect(api.puts).toEqual([{ horizonteDias: 30, limiteAte: null }]);
});

test('cancelar restauração não envia; confirmar envia null/null', async ({
    page,
}) => {
    const api = await abrirPagina(page, {
        initial: CONFIG_ATIVA,
        putResponse: { status: 200, body: CONFIG_PADRAO },
    });

    await page
        .getByRole('button', { name: 'Voltar ao padrão (20 dias)' })
        .click();
    const dialog = page.getByRole('dialog', { name: 'Voltar ao padrão?' });
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    expect(api.puts).toHaveLength(0);

    await page
        .getByRole('button', { name: 'Voltar ao padrão (20 dias)' })
        .click();
    await page
        .getByRole('dialog', { name: 'Voltar ao padrão?' })
        .getByRole('button', { name: 'Voltar ao padrão' })
        .click();

    await expect.poll(() => api.puts.length).toBe(1);
    expect(api.puts[0]).toEqual({ horizonteDias: null, limiteAte: null });
    await expect(page.getByLabel('Janela (dias à frente)')).toHaveValue('');
});

test('avisa quando teto salvo está vencido', async ({ page }) => {
    await abrirPagina(page, {
        initial: {
            ...CONFIG_PADRAO,
            limiteAte: '2026-10-29',
            limiteAtivo: false,
        },
    });

    await expect(page.getByRole('status')).toContainText(
        'O teto salvo de 29/10/2026 venceu e foi ignorado.',
    );
});

test('item do menu Mais abre tela do horizonte', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-30T15:00:00.000Z') });
    await mockApi(page);
    await page.goto('/horarios');
    await page.getByRole('button', { name: 'Mais' }).click();
    await page.getByRole('button', { name: 'Horizonte da agenda' }).click();

    await expect(
        page.getByRole('heading', { name: 'Horizonte da agenda' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/horizonte-agenda$/);
});
