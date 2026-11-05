import { readFile } from 'node:fs/promises';
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

interface OpcoesInterceptacaoInativos {
    chamadasPost?: string[];
    responderPost?: (
        chamada: number,
        route: Route,
    ) => Promise<RespostaMock | null>;
}

interface RelatorioInativosMock {
    geradoEm: string;
    filtro: { diasMin: number; diasMax: number };
    total: number;
    truncado: boolean;
    itens: {
        clienteId: string;
        nome: string;
        telefone: string;
        ultimaVisita: string;
        diasSemVir: number;
        ultimoServico: string | null;
        totalVisitas: number;
        pacoteAtivoComSaldo: boolean;
        ultimaTentativa: {
            status: 'PENDENTE' | 'ACEITA' | 'ENTREGUE' | 'FALHOU';
            criadoEm: string;
        } | null;
        podeReativar: boolean;
        reativacaoBloqueio: 'OPT_OUT' | 'COOLDOWN' | null;
        reativacaoBloqueadaAte: string | null;
    }[];
}

const relatorioInativosComDados: RelatorioInativosMock = {
    geradoEm: '2026-03-16T02:00:00.000Z',
    filtro: { diasMin: 30, diasMax: 180 },
    total: 2,
    truncado: false,
    itens: [
        {
            clienteId: 'cliente-ana',
            nome: 'Ana Silva',
            telefone: '+55 (11) 99999-9999',
            ultimaVisita: '2026-01-29',
            diasSemVir: 45,
            ultimoServico: 'Corte clássico',
            totalVisitas: 8,
            pacoteAtivoComSaldo: true,
            ultimaTentativa: null,
            podeReativar: true,
            reativacaoBloqueio: null,
            reativacaoBloqueadaAte: null,
        },
        {
            clienteId: 'cliente-sem-telefone',
            nome: '  ',
            telefone: 'telefone inválido',
            ultimaVisita: '2026-01-15',
            diasSemVir: 59,
            ultimoServico: null,
            totalVisitas: 1,
            pacoteAtivoComSaldo: false,
            ultimaTentativa: null,
            podeReativar: true,
            reativacaoBloqueio: null,
            reativacaoBloqueadaAte: null,
        },
    ],
};

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

async function interceptarApiClientesInativos(
    page: Page,
    resposta: (chamada: number, route: Route) => Promise<RespostaMock>,
    opcoes: OpcoesInterceptacaoInativos = {},
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
            request.method() === 'POST' &&
            /^\/api\/clientes\/[^/]+\/reativacao-whatsapp$/.test(url.pathname)
        ) {
            opcoes.chamadasPost?.push(url.href);
            const resultado = opcoes.responderPost
                ? await opcoes.responderPost(
                      opcoes.chamadasPost?.length ?? 1,
                      route,
                  )
                : {
                      status: 202,
                      body: { envioId: 'envio-1', status: 'ACEITA' },
                  };
            if (resultado === null) {
                await route.abort();
                return;
            }
            await route.fulfill({
                status: resultado.status,
                json: resultado.body,
            });
            return;
        }

        if (
            request.method() === 'GET' &&
            url.pathname === '/api/relatorios/clientes-inativos'
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

function sucessoInativos(
    relatorio: RelatorioInativosMock = relatorioInativosComDados,
): RespostaMock {
    return { status: 200, body: relatorio };
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

test('ArrowRight foca Clientes inativos e persiste URL', async ({ page }) => {
    await fixarData(page);
    await interceptarApiClientesInativos(page, async () => sucessoInativos());
    await page.goto('/relatorios');

    const servicos = page.getByRole('tab', {
        name: 'Atendimentos por serviço',
    });
    const inativos = page.getByRole('tab', { name: 'Clientes inativos' });
    await expect(servicos).toHaveAttribute('aria-selected', 'true');
    await servicos.focus();
    await page.keyboard.press('ArrowRight');
    await expect(inativos).toHaveAttribute('aria-selected', 'true');
    await expect(inativos).toBeFocused();
    await expect(page).toHaveURL(/relatorio=inativos/);
    await expect(
        page.getByRole('heading', { name: 'Clientes encontrados: 2' }),
    ).toBeVisible();
});

test('carrega filtros padrão, espera Buscar e atalhos consultam imediatamente', async ({
    page,
}) => {
    await fixarData(page);
    const chamadas = await interceptarApiClientesInativos(page, async () =>
        sucessoInativos(),
    );
    await page.goto('/relatorios?relatorio=inativos');

    await expect.poll(() => chamadas.length).toBeGreaterThan(0);
    await expect(
        page.getByRole('heading', { name: 'Clientes encontrados: 2' }),
    ).toBeVisible();
    const padrao = new URL(chamadas.at(-1) ?? 'http://localhost');
    expect(padrao.searchParams.get('diasMin')).toBe('30');
    expect(padrao.searchParams.get('diasMax')).toBe('180');
    await expect(page.getByLabel('Mínimo de dias sem vir')).toHaveValue('30');
    await expect(page.getByLabel('Máximo de dias sem vir')).toHaveValue('180');

    const chamadasAntesDaEdicao = chamadas.length;
    await page.getByLabel('Mínimo de dias sem vir').fill('45');
    await expect.poll(() => chamadas.length).toBe(chamadasAntesDaEdicao);
    await page.getByLabel('Máximo de dias sem vir').fill('60');
    await expect.poll(() => chamadas.length).toBe(chamadasAntesDaEdicao);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect
        .poll(() =>
            chamadas.some((url) => {
                const parametros = new URL(url).searchParams;
                return (
                    parametros.get('diasMin') === '45' &&
                    parametros.get('diasMax') === '60'
                );
            }),
        )
        .toBe(true);
    const manual = new URL(
        chamadas.find(
            (url) => new URL(url).searchParams.get('diasMin') === '45',
        ) ?? 'http://localhost',
    );
    expect(manual.searchParams.get('diasMin')).toBe('45');
    expect(manual.searchParams.get('diasMax')).toBe('60');

    const chamadasAntesDoAtalho45 = chamadas.length;
    await page.getByRole('button', { name: 'A partir de 45 dias' }).click();
    await expect
        .poll(() => chamadas.length)
        .toBeGreaterThan(chamadasAntesDoAtalho45);
    expect(
        new URL(chamadas.at(-1) ?? 'http://localhost').searchParams.get(
            'diasMin',
        ),
    ).toBe('45');

    await page.getByRole('button', { name: 'A partir de 60 dias' }).click();
    await expect
        .poll(() =>
            chamadas.some(
                (url) => new URL(url).searchParams.get('diasMin') === '60',
            ),
        )
        .toBe(true);
});

test('valida intervalo e apresenta resultados, pacote e ação WhatsApp somente válida', async ({
    page,
}) => {
    await fixarData(page);
    const chamadas = await interceptarApiClientesInativos(page, async () =>
        sucessoInativos(),
    );
    await page.goto('/relatorios?relatorio=inativos');
    await expect(
        page.getByRole('heading', { name: 'Clientes encontrados: 2' }),
    ).toBeVisible();
    await expect(
        page.getByText(
            'Lista para reativação. Considera visita qualquer agendamento já encerrado e não cancelado. Clientes com horário marcado ou em aberto, sem nenhuma visita e números ignorados não aparecem. Pacotes com saldo permanecem marcados.',
        ),
    ).toBeVisible();
    await expect(page.getByTestId('nota-criterio-visita')).toHaveText(
        'Considera visita qualquer agendamento já encerrado e não cancelado. Não aparecem clientes com horário marcado, sem nenhuma visita ou na lista de números ignorados.',
    );
    const tabela = page.getByRole('table');
    await expect(tabela).toBeVisible();
    await expect(
        tabela.getByRole('link', { name: 'Abrir WhatsApp para Ana Silva' }),
    ).toHaveAttribute('target', '_blank');
    await page.setViewportSize({ width: 320, height: 800 });

    const chamadasAntesDaValidacao = chamadas.length;
    await page.getByLabel('Mínimo de dias sem vir').fill('366');
    await expect(page.getByRole('button', { name: 'Buscar' })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('entre 1 e 365');
    expect(chamadas.length).toBe(chamadasAntesDaValidacao);
    await page.getByLabel('Mínimo de dias sem vir').fill('');
    await expect(page.getByRole('alert')).toContainText('entre 1 e 365');
    await expect(page.getByRole('button', { name: 'Buscar' })).toBeDisabled();
    expect(chamadas.length).toBe(chamadasAntesDaValidacao);
    await page.getByLabel('Mínimo de dias sem vir').fill('30');

    const cardAna = page.getByTestId('cliente-inativo-card').first();
    await expect(cardAna.getByText('Ana Silva')).toBeVisible();
    await expect(cardAna.getByText('Pacote ativo com saldo')).toBeVisible();
    await expect(
        cardAna.getByRole('link', { name: 'Abrir WhatsApp para Ana Silva' }),
    ).toHaveAttribute('href', 'https://wa.me/5511999999999');
    await expect(
        cardAna.getByRole('link', { name: 'Abrir WhatsApp para Ana Silva' }),
    ).toHaveAttribute('rel', 'noopener noreferrer');
    const cardSemTelefone = page.getByTestId('cliente-inativo-card').nth(1);
    await expect(cardSemTelefone.getByText('Nome não informado')).toBeVisible();
    await expect(
        cardSemTelefone.getByText('Não informado', { exact: true }),
    ).toHaveCount(1);
    await expect(cardSemTelefone.getByText('telefone inválido')).toBeVisible();
    await expect(cardSemTelefone.getByRole('link')).toHaveCount(0);

    const larguras = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documento: document.documentElement.scrollWidth,
    }));
    expect(larguras.documento).toBeLessThanOrEqual(larguras.viewport);
});

test('confirma reativação elegível, cancela sem POST e refaz relatório no mobile', async ({
    page,
}) => {
    await fixarData(page);
    await page.setViewportSize({ width: 320, height: 800 });
    const chamadasPost: string[] = [];
    const chamadasGet = await interceptarApiClientesInativos(
        page,
        async () => {
            if (chamadasPost.length === 0) return sucessoInativos();
            return sucessoInativos({
                ...relatorioInativosComDados,
                itens: [
                    {
                        ...relatorioInativosComDados.itens[0],
                        ultimaTentativa: {
                            status: 'ACEITA',
                            criadoEm: '2026-03-15T14:00:00.000Z',
                        },
                        podeReativar: false,
                        reativacaoBloqueio: 'COOLDOWN',
                        reativacaoBloqueadaAte: '2026-04-02T02:00:00.000Z',
                    },
                    relatorioInativosComDados.itens[1],
                ],
            });
        },
        { chamadasPost },
    );

    await page.goto('/relatorios?relatorio=inativos');
    const card = page.getByTestId('cliente-inativo-card').first();
    const acao = card.getByRole('button', {
        name: 'Enviar reativação para Ana Silva',
    });
    await expect(acao).toBeVisible();
    await acao.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Ana Silva');
    await expect(dialog).toContainText('+55 11 99999-9999');
    await expect(dialog).toContainText('modelo aprovado do WhatsApp');
    await expect(dialog).toContainText('Quero agendar');
    await expect(dialog).toContainText('Não receber mais');
    await expect(dialog).toContainText(
        'cerca de R$ 0,32 por envio (mensagem de marketing da Meta)',
    );
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    expect(chamadasPost).toHaveLength(0);

    await acao.click();
    await page.evaluate(() => window.scrollTo(0, 220));
    const scrollAntes = await page.evaluate(() => window.scrollY);
    await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Enviar' })
        .click();
    await expect.poll(() => chamadasPost.length).toBe(1);
    await expect(page.getByRole('status')).toContainText(
        'Reativação enviada para Ana Silva.',
    );
    await expect(card).toContainText('Reativação em espera até 01/04');
    await expect(card.getByText('Enviada')).toBeVisible();
    await expect(
        card.getByRole('button', { name: 'Enviar reativação para Ana Silva' }),
    ).toBeDisabled();
    await expect(
        card.getByRole('link', { name: 'Abrir WhatsApp para Ana Silva' }),
    ).toHaveAttribute('href', 'https://wa.me/5511999999999');
    expect(new URL(chamadasGet[1]).searchParams.get('diasMin')).toBe('30');
    expect(new URL(chamadasGet[1]).searchParams.get('diasMax')).toBe('180');
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollAntes);
});

test('clique duplo na confirmação gera um POST', async ({ page }) => {
    await fixarData(page);
    await page.setViewportSize({ width: 320, height: 800 });
    const chamadasPost: string[] = [];
    let liberarPost: (() => void) | undefined;
    const postPendente = new Promise<void>((resolve) => {
        liberarPost = resolve;
    });
    await interceptarApiClientesInativos(page, async () => sucessoInativos(), {
        chamadasPost,
        responderPost: async () => {
            await postPendente;
            return {
                status: 202,
                body: { envioId: 'envio-1', status: 'ACEITA' },
            };
        },
    });

    await page.goto('/relatorios?relatorio=inativos');
    await page
        .getByTestId('cliente-inativo-card')
        .first()
        .getByRole('button', { name: 'Enviar reativação para Ana Silva' })
        .click();
    const enviar = page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Enviar' });
    await enviar.evaluate((button) => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect.poll(() => chamadasPost.length).toBe(1);
    liberarPost?.();
    await expect(page.getByRole('status')).toContainText('Reativação enviada');
});

test('prioriza opt-out, respeita cooldown e permite reenviar falha', async ({
    page,
}) => {
    await fixarData(page);
    await page.setViewportSize({ width: 320, height: 800 });
    const itens = [
        {
            ...relatorioInativosComDados.itens[0],
            reativacaoBloqueio: 'OPT_OUT' as const,
            reativacaoBloqueadaAte: '2026-04-02T02:00:00.000Z',
            podeReativar: false,
        },
        {
            ...relatorioInativosComDados.itens[0],
            clienteId: 'cliente-cooldown',
            nome: 'Bruno Silva',
            reativacaoBloqueio: 'COOLDOWN' as const,
            reativacaoBloqueadaAte: '2026-03-17T02:00:00.000Z',
            ultimaTentativa: {
                status: 'ACEITA' as const,
                criadoEm: '2026-03-15T14:00:00.000Z',
            },
            podeReativar: false,
        },
        {
            ...relatorioInativosComDados.itens[0],
            clienteId: 'cliente-falha',
            nome: 'Carlos Silva',
            ultimaTentativa: {
                status: 'FALHOU' as const,
                criadoEm: '2026-03-16T02:00:00.000Z',
            },
        },
    ];
    await interceptarApiClientesInativos(page, async () =>
        sucessoInativos({
            ...relatorioInativosComDados,
            total: itens.length,
            itens,
        }),
    );

    await page.goto('/relatorios?relatorio=inativos');
    const cards = page.getByTestId('cliente-inativo-card');
    const optOut = cards.nth(0);
    await expect(optOut).toContainText('Pediu para não receber');
    await expect(
        optOut.getByRole('button', { name: /Enviar reativação/ }),
    ).toHaveCount(0);
    await expect(optOut.getByRole('link')).toHaveCount(0);

    const cooldown = cards.nth(1);
    await expect(cooldown).toContainText('Reativação em espera até 16/03');
    await expect(cooldown.getByText('Enviada')).toBeVisible();
    await expect(
        cooldown.getByRole('button', { name: /Enviar reativação/ }),
    ).toBeDisabled();
    await expect(
        cooldown.getByRole('link', { name: /Abrir WhatsApp/ }),
    ).toBeVisible();

    const falha = cards.nth(2);
    await expect(falha).toContainText('Último envio falhou em 15/03');
    await expect(
        falha.getByRole('button', { name: 'Reenviar para Carlos Silva' }),
    ).toBeEnabled();
});

test('mapeia erros COOLDOWN, 422, 502 e falha de rede', async ({ page }) => {
    await fixarData(page);
    await page.setViewportSize({ width: 320, height: 800 });
    const respostas: (RespostaMock | null)[] = [
        {
            status: 409,
            body: {
                motivo: 'COOLDOWN',
                bloqueadoAte: '2026-03-17T02:00:00.000Z',
            },
        },
        { status: 422, body: { motivo: 'NUMERO_IGNORADO' } },
        { status: 502, body: { motivo: 'FALHA_ENVIO' } },
        null,
    ];
    let indiceResposta = 0;
    const chamadasPost: string[] = [];
    await interceptarApiClientesInativos(page, async () => sucessoInativos(), {
        chamadasPost,
        responderPost: async () => respostas[indiceResposta++] ?? null,
    });

    for (const [indice, mensagem] of [
        'Já houve um envio recente. Novo envio liberado em 16/03.',
        'Este número está na lista de números ignorados.',
        'Não foi possível enviar agora. Tente novamente em instantes.',
        'Não foi possível enviar a reativação. Tente novamente.',
    ].entries()) {
        await page.goto('/relatorios?relatorio=inativos');
        await page
            .getByTestId('cliente-inativo-card')
            .first()
            .getByRole('button', { name: 'Enviar reativação para Ana Silva' })
            .click();
        await page
            .getByRole('alertdialog')
            .getByRole('button', { name: 'Enviar' })
            .click();
        await expect(page.getByRole('alert')).toHaveText(mensagem);
        expect(chamadasPost).toHaveLength(indice + 1);
    }
});

test('ignora respostas antigas quando uma busca mais recente termina primeiro', async ({
    page,
}) => {
    await fixarData(page);
    let liberarRespostasAntigas: (() => void) | undefined;
    const respostasAntigasPendentes = new Promise<void>((resolve) => {
        liberarRespostasAntigas = resolve;
    });
    const chamadas = await interceptarApiClientesInativos(
        page,
        async (_chamada, route) => {
            const url = new URL(route.request().url());
            if (url.searchParams.get('diasMin') === '30') {
                await respostasAntigasPendentes;
                return sucessoInativos({
                    ...relatorioInativosComDados,
                    itens: relatorioInativosComDados.itens.map((item) => ({
                        ...item,
                        nome: 'Resposta antiga',
                    })),
                });
            }
            return sucessoInativos({
                ...relatorioInativosComDados,
                filtro: { diasMin: 45, diasMax: 180 },
                itens: relatorioInativosComDados.itens.map((item) => ({
                    ...item,
                    nome: 'Resposta mais recente',
                })),
            });
        },
    );
    await page.goto('/relatorios?relatorio=inativos');
    await expect.poll(() => chamadas.length).toBeGreaterThan(0);
    await page.getByLabel('Mínimo de dias sem vir').fill('45');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(
        page.getByRole('heading', { name: 'Clientes encontrados: 2' }),
    ).toBeVisible();
    await expect(page.getByText('Resposta mais recente').first()).toBeVisible();

    liberarRespostasAntigas?.();
    await expect(page.getByText('Resposta mais recente').first()).toBeVisible();
    await expect(page.getByText('Resposta antiga')).toHaveCount(0);
});

test('informa truncamento e exporta somente o resultado com nome/data locais', async ({
    page,
}) => {
    await fixarData(page);
    const truncado: RelatorioInativosMock = {
        ...relatorioInativosComDados,
        total: 520,
        truncado: true,
    };
    await interceptarApiClientesInativos(page, async () =>
        sucessoInativos(truncado),
    );
    await page.goto('/relatorios?relatorio=inativos');
    await expect(page.getByRole('status')).toContainText(
        'Exibindo os primeiros 2 de 520 clientes.',
    );

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
        'clientes_inativos_2026-03-15.csv',
    );
    const caminho = await download.path();
    if (!caminho) throw new Error('Arquivo CSV não foi disponibilizado.');
    const conteudo = await readFile(caminho, 'utf8');
    expect(conteudo.charCodeAt(0)).toBe(0xfeff);
    expect(conteudo).toContain('Ana Silva;(11) 99999-9999;29/01/2026;45');
    expect(conteudo).toContain('(sem nome);telefone inválido;15/01/2026;59');
    expect(conteudo).toContain('Pacote ativo com saldo');
});

test('mostra estado vazio e permite tentar novamente após erro', async ({
    page,
}) => {
    await fixarData(page);
    let chamadas = 0;
    let falhar = true;
    await interceptarApiClientesInativos(page, async () => {
        chamadas += 1;
        if (falhar) {
            return {
                status: 500,
                body: { message: 'Relatório indisponível.' },
            };
        }
        return sucessoInativos({
            ...relatorioInativosComDados,
            total: 0,
            itens: [],
        });
    });
    await page.goto('/relatorios?relatorio=inativos');
    await expect(page.getByRole('alert')).toContainText(
        'Relatório indisponível.',
    );
    const chamadasAntesDoRetry = chamadas;
    falhar = false;
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(
        page.getByText('Nenhum cliente encontrado neste intervalo.'),
    ).toBeVisible();
    expect(chamadas).toBeGreaterThan(chamadasAntesDoRetry);
});
