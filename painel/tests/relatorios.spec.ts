import { expect, test, type Page, type Route } from '@playwright/test';

interface RelatorioMock {
    periodo: { de: string; ate: string };
    geradoEm: string;
    itens: {
        servicoId: string;
        nome: string;
        quantidade: number;
        quantidadeAvulso: number;
        quantidadePacote: number;
        valorEstimado: string | null;
        semPreco: number;
    }[];
    total: {
        quantidade: number;
        valorEstimado: string | null;
        semPreco: number;
    };
}

interface RespostaMock {
    status: number;
    body: unknown;
}

const relatorioComDados: RelatorioMock = {
    periodo: { de: '2026-03-01', ate: '2026-03-15' },
    geradoEm: '2026-03-15T15:00:00.000Z',
    itens: [
        {
            servicoId: 'servico-corte',
            nome: 'Corte; "clássico"',
            quantidade: 3,
            quantidadeAvulso: 2,
            quantidadePacote: 1,
            valorEstimado: '135.00',
            semPreco: 1,
        },
    ],
    total: { quantidade: 3, valorEstimado: '135.00', semPreco: 1 },
};

async function interceptarApi(
    page: Page,
    resposta: (chamada: number, route: Route) => Promise<RespostaMock>,
): Promise<string[]> {
    const chamadas: string[] = [];

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

        if (
            request.method() === 'GET' &&
            url.pathname === '/api/relatorios/atendimentos'
        ) {
            chamadas.push(url.href);
            const resultado = await resposta(chamadas.length, route);
            await route.fulfill({
                status: resultado.status,
                json: resultado.body,
            });
            return;
        }

        await route.fulfill({
            status: 404,
            json: { message: 'Rota não prevista pelo teste.' },
        });
    });

    return chamadas;
}

function sucesso(relatorio: RelatorioMock = relatorioComDados): RespostaMock {
    return { status: 200, body: relatorio };
}

async function fixarData(page: Page): Promise<void> {
    await page.clock.install({ time: new Date('2026-03-15T15:00:00.000Z') });
}

test('carrega o mês atual em horário de São Paulo e mostra totais', async ({
    page,
}) => {
    await fixarData(page);
    const chamadas = await interceptarApi(page, async () => sucesso());

    await page.goto('/relatorios');

    await expect(page.getByLabel('Data inicial')).toHaveValue('2026-03-01');
    await expect(page.getByLabel('Data final')).toHaveValue('2026-03-15');
    await expect(
        page.getByRole('heading', { name: 'Resultado' }),
    ).toBeVisible();
    await expect(page.getByText('01/03/2026 a 15/03/2026')).toBeVisible();
    await expect(page.getByText('Corte; "clássico"').first()).toBeVisible();
    await expect(page.getByText('R$ 135,00').first()).toBeVisible();
    await expect(
        page.getByText(
            'Valor estimado a preço de tabela, não é faturamento. Atendimentos de pacote contam depois de marcados como concluídos.',
        ),
    ).toBeVisible();
    expect(new URL(chamadas[0]).searchParams.get('de')).toBe('2026-03-01');
    expect(new URL(chamadas[0]).searchParams.get('ate')).toBe('2026-03-15');
});

test('atalho atualiza o intervalo e datas invertidas não consultam a API', async ({
    page,
}) => {
    await fixarData(page);
    const chamadas = await interceptarApi(page, async () => sucesso());
    await page.goto('/relatorios');
    await expect(
        page.getByRole('heading', { name: 'Resultado' }),
    ).toBeVisible();
    const chamadasIniciais = chamadas.length;

    await page.getByRole('button', { name: 'Mês passado' }).click();
    await expect(page.getByLabel('Data inicial')).toHaveValue('2026-02-01');
    await expect(page.getByLabel('Data final')).toHaveValue('2026-02-28');

    await page.getByLabel('Data inicial').fill('2026-03-16');
    await page.getByLabel('Data final').fill('2026-03-15');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('alert')).toContainText(
        'A data inicial deve ser anterior ou igual à data final.',
    );
    expect(chamadas).toHaveLength(chamadasIniciais);

    await page.getByRole('button', { name: 'Mês passado' }).click();
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect.poll(() => chamadas.length).toBeGreaterThan(chamadasIniciais);
    const ultimaChamada = new URL(chamadas.at(-1) ?? 'http://localhost');
    expect(ultimaChamada.searchParams.get('de')).toBe('2026-02-01');
    expect(ultimaChamada.searchParams.get('ate')).toBe('2026-02-28');
});

test('mostra estado vazio e exporta CSV com nome do período', async ({
    page,
}) => {
    await fixarData(page);
    const vazio: RelatorioMock = {
        ...relatorioComDados,
        itens: [],
        total: { quantidade: 0, valorEstimado: null, semPreco: 0 },
    };
    await interceptarApi(page, async () => sucesso(vazio));
    await page.goto('/relatorios');

    await expect(
        page.getByText('Nenhum atendimento encontrado neste período.'),
    ).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
        'atendimentos_2026-03-01_a_2026-03-15.csv',
    );
});

test('oculta card e linhas de sem preço quando contagens são zero', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await fixarData(page);
    const semPrecoZero: RelatorioMock = {
        ...relatorioComDados,
        itens: relatorioComDados.itens.map((item) => ({
            ...item,
            semPreco: 0,
        })),
        total: { ...relatorioComDados.total, semPreco: 0 },
    };
    await interceptarApi(page, async () => sucesso(semPrecoZero));
    await page.goto('/relatorios');

    await expect(page.getByTestId('relatorio-servico-card')).toBeVisible();
    await expect(
        page.getByText('Sem preço registrado', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('Sem preço', { exact: true })).toHaveCount(0);
});

test('mostra card total e linha por serviço quando sem preço é positivo', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await fixarData(page);
    await interceptarApi(page, async () => sucesso());
    await page.goto('/relatorios');

    await expect(
        page.getByText('Sem preço registrado', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByTestId('relatorio-servico-card').getByText('Sem preço', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(page.getByText('01/03/2026 a 15/03/2026')).toBeVisible();
});

test('exibe loading, erro e permite tentar novamente', async ({ page }) => {
    await fixarData(page);
    let liberarPrimeiraResposta: (() => void) | undefined;
    let falharPrimeiraBusca = true;
    const primeiraRespostaPendente = new Promise<void>((resolve) => {
        liberarPrimeiraResposta = resolve;
    });
    const chamadas = await interceptarApi(page, async () => {
        if (falharPrimeiraBusca) {
            await primeiraRespostaPendente;
            return {
                status: 500,
                body: { message: 'Relatório indisponível.' },
            };
        }
        return sucesso();
    });

    await page.goto('/relatorios');
    await expect.poll(() => chamadas.length).toBeGreaterThan(0);
    await expect(
        page.locator('[aria-label="Carregando relatório"]'),
    ).toBeVisible();
    liberarPrimeiraResposta?.();
    await expect(page.getByRole('alert')).toContainText(
        'Relatório indisponível.',
    );
    falharPrimeiraBusca = false;
    const chamadasAntesDoRetry = chamadas.length;
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect
        .poll(() => chamadas.length)
        .toBeGreaterThan(chamadasAntesDoRetry);
    await expect(
        page.getByRole('heading', { name: 'Resultado' }),
    ).toBeVisible();
});

test('cards de serviço não causam overflow em viewport estreita', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await fixarData(page);
    const nomeLongo = 'Serviço extraordinário '.repeat(5);
    const estreito: RelatorioMock = {
        ...relatorioComDados,
        itens: [{ ...relatorioComDados.itens[0], nome: nomeLongo }],
    };
    await interceptarApi(page, async () => sucesso(estreito));
    await page.goto('/relatorios');

    await expect(page.getByTestId('relatorio-servico-card')).toBeVisible();
    const larguras = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documento: document.documentElement.scrollWidth,
    }));
    expect(larguras.documento).toBeLessThanOrEqual(larguras.viewport);
});
