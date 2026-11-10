import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import type {
    ItemSaldoPacote,
    RelatorioSaldoPacotes,
} from '../src/services/relatorios.service.js';

interface RespostaMock {
    status: number;
    body: unknown;
}

const textoAConcluir =
    'Atendimentos que já aconteceram e ainda não foram marcados como concluídos. Enquanto não concluir, o crédito não baixa.';

const itensPadrao: ItemSaldoPacote[] = [
    {
        pacoteClienteId: 'pc-ana',
        clienteId: 'c-ana',
        nome: 'Ana Silva',
        telefone: '+55 (11) 99999-9999',
        pacoteNome: 'Pacote premium',
        dataInicio: '2026-01-02',
        renovadoEm: null,
        ultimaVisita: '2026-02-01',
        semVisita: false,
        diasSemVir: 40,
        temHorarioMarcado: false,
        parado: true,
        totalRestante: 2,
        totalAgendados: 1,
        aConcluir: 0,
        servicos: [
            {
                servicoId: 'corte-barba',
                nome: 'Corte e Barba',
                total: 4,
                restante: 2,
                agendados: 1,
            },
        ],
    },
    {
        pacoteClienteId: 'pc-bruno',
        clienteId: 'c-bruno',
        nome: 'Bruno Lima',
        telefone: '11 3333-4444',
        pacoteNome: 'Pacote barba',
        dataInicio: '2026-02-10',
        renovadoEm: null,
        ultimaVisita: '2026-03-01',
        semVisita: false,
        diasSemVir: 12,
        temHorarioMarcado: true,
        parado: false,
        totalRestante: 1,
        totalAgendados: 1,
        aConcluir: 1,
        servicos: [
            {
                servicoId: 'barba',
                nome: 'Barba',
                total: 2,
                restante: 1,
                agendados: 1,
            },
        ],
    },
    {
        pacoteClienteId: 'pc-sem-nome',
        clienteId: 'c-sem-nome',
        nome: '  ',
        telefone: 'telefone inválido',
        pacoteNome: 'Pacote inicial',
        dataInicio: '2026-02-01',
        renovadoEm: null,
        ultimaVisita: null,
        semVisita: true,
        diasSemVir: 5,
        temHorarioMarcado: false,
        parado: false,
        totalRestante: 3,
        totalAgendados: 0,
        aConcluir: 1,
        servicos: [
            {
                servicoId: 'corte',
                nome: 'Corte',
                total: 4,
                restante: 3,
                agendados: 0,
            },
        ],
    },
];

function relatorioPadrao(
    ajustes: Partial<RelatorioSaldoPacotes> = {},
): RelatorioSaldoPacotes {
    return {
        geradoEm: '2026-03-16T02:00:00.000Z',
        filtro: { diasParado: 7, somenteParados: false },
        totalAtivos: 5,
        totalParados: 2,
        total: itensPadrao.length,
        truncado: false,
        itens: itensPadrao,
        ...ajustes,
    };
}

function relatorioComRenovacao(): RelatorioSaldoPacotes {
    return relatorioPadrao({
        itens: itensPadrao.map((item) =>
            item.pacoteClienteId === 'pc-ana'
                ? { ...item, renovadoEm: '2026-03-02' }
                : item,
        ),
    });
}

async function interceptarApi(
    page: Page,
    responder: (url: URL, chamada: number) => Promise<RespostaMock>,
): Promise<string[]> {
    const chamadas: string[] = [];

    await page.route('**/api/**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (request.method() === 'GET' && url.pathname === '/api/auth/me') {
            await route.fulfill({ status: 200, json: { username: 'e2e' } });
            return;
        }

        if (
            request.method() === 'GET' &&
            url.pathname === '/api/relatorios/saldo-pacotes'
        ) {
            chamadas.push(url.href);
            const resposta = await responder(url, chamadas.length);
            await route.fulfill({
                status: resposta.status,
                json: resposta.body,
            });
            return;
        }

        if (
            request.method() === 'GET' &&
            url.pathname === '/api/relatorios/atendimentos'
        ) {
            await route.fulfill({
                status: 200,
                json: {
                    periodo: { de: '2026-03-01', ate: '2026-03-01' },
                    geradoEm: '2026-03-16T02:00:00.000Z',
                    itens: [],
                    total: { quantidade: 0, valorEstimado: null, semPreco: 0 },
                },
            });
            return;
        }

        if (
            request.method() === 'GET' &&
            url.pathname === '/api/relatorios/clientes-inativos'
        ) {
            await route.fulfill({
                status: 200,
                json: {
                    geradoEm: '2026-03-16T02:00:00.000Z',
                    filtro: { diasMin: 30, diasMax: 180 },
                    total: 0,
                    truncado: false,
                    itens: [],
                },
            });
            return;
        }

        await route.fulfill({
            status: 404,
            json: { message: 'Não encontrado.' },
        });
    });

    return chamadas;
}

async function abrirPacotes(page: Page): Promise<void> {
    await page.goto('/relatorios?relatorio=pacotes');
    await expect(
        page.getByRole('tab', { name: 'Pacotes', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
}

test('duas ArrowRight focam Pacotes e persistem aba na URL', async ({
    page,
}) => {
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await page.goto('/relatorios');

    const atendimentos = page.getByRole('tab', {
        name: 'Atendimentos por serviço',
    });
    await atendimentos.focus();
    await page.keyboard.press('ArrowRight');
    await expect(
        page.getByRole('tab', { name: 'Clientes inativos' }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    const pacotes = page.getByRole('tab', { name: 'Pacotes' });
    await expect(pacotes).toHaveAttribute('aria-selected', 'true');
    await expect(pacotes).toBeFocused();
    await expect(page).toHaveURL(/relatorio=pacotes/);
});

test('ArrowLeft de Pacotes foca Clientes inativos e atualiza URL', async ({
    page,
}) => {
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    const pacotes = page.getByRole('tab', { name: 'Pacotes' });
    await pacotes.focus();
    await page.keyboard.press('ArrowLeft');

    const inativos = page.getByRole('tab', { name: 'Clientes inativos' });
    await expect(inativos).toHaveAttribute('aria-selected', 'true');
    await expect(inativos).toBeFocused();
    await expect(page).toHaveURL(/relatorio=inativos/);
});

test('Home foca Atendimentos e atualiza URL', async ({ page }) => {
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await page.getByRole('tab', { name: 'Pacotes' }).focus();
    await page.keyboard.press('Home');

    const atendimentos = page.getByRole('tab', {
        name: 'Atendimentos por serviço',
    });
    await expect(atendimentos).toHaveAttribute('aria-selected', 'true');
    await expect(atendimentos).toBeFocused();
    await expect(page).toHaveURL(/relatorio=servicos/);
});

test('End foca Origem e atualiza URL', async ({ page }) => {
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await page.goto('/relatorios');
    await page.getByRole('tab', { name: 'Atendimentos por serviço' }).focus();
    await page.keyboard.press('End');

    const origem = page.getByRole('tab', { name: 'Origem dos agendamentos' });
    await expect(origem).toHaveAttribute('aria-selected', 'true');
    await expect(origem).toBeFocused();
    await expect(page).toHaveURL(/relatorio=origem/);
});

test('mostra quatro rótulos curtos no celular sem overflow horizontal da página', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);

    await expect(
        page.getByRole('tab', { name: 'Atendimentos por serviço' }),
    ).toContainText('Atendimentos');
    await expect(
        page.getByRole('tab', { name: 'Clientes inativos' }),
    ).toContainText('Inativos');
    await expect(page.getByRole('tab', { name: 'Pacotes' })).toContainText(
        'Pacotes',
    );
    await expect(
        page.getByRole('tab', { name: 'Origem dos agendamentos' }),
    ).toContainText('Origem');
    const larguras = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documento: document.documentElement.scrollWidth,
    }));
    expect(larguras.documento).toBeLessThanOrEqual(larguras.viewport);
});

test('consulta parâmetros padrão ao abrir a aba', async ({ page }) => {
    const chamadas = await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await expect.poll(() => chamadas.length).toBeGreaterThan(0);
    await expect(page.getByText('5 pacotes ativos · 2 parados')).toBeVisible();
    expect(
        chamadas.every((chamada) => {
            const parametros = new URL(chamada).searchParams;
            return (
                parametros.get('diasParado') === '7' &&
                parametros.get('somenteParados') === 'false'
            );
        }),
    ).toBe(true);
});

async function aguardarConsultasIniciais(
    page: Page,
    chamadas: string[],
): Promise<void> {
    await expect(page.getByText('5 pacotes ativos · 2 parados')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(chamadas).toHaveLength(2);
}

async function aguardarUmaConsultaNova(
    page: Page,
    chamadas: string[],
    chamadasIniciais: number,
    parametrosEsperados: Record<string, string>,
): Promise<void> {
    await expect(page.getByText('5 pacotes ativos · 2 parados')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(chamadas).toHaveLength(chamadasIniciais + 1);
    const novaChamada = new URL(chamadas[chamadasIniciais]);
    for (const [chave, valor] of Object.entries(parametrosEsperados)) {
        expect(novaChamada.searchParams.get(chave)).toBe(valor);
    }
}

test('atalho de 15 dias dispara exatamente uma consulta nova', async ({
    page,
}) => {
    const chamadas = await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await aguardarConsultasIniciais(page, chamadas);
    const chamadasIniciais = chamadas.length;
    await page.getByRole('button', { name: '15 dias' }).click();
    await aguardarUmaConsultaNova(page, chamadas, chamadasIniciais, {
        diasParado: '15',
        somenteParados: 'false',
    });
});

test('checkbox só parados dispara exatamente uma consulta nova', async ({
    page,
}) => {
    const chamadas = await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await aguardarConsultasIniciais(page, chamadas);
    const chamadasIniciais = chamadas.length;
    await page.getByLabel('Mostrar só pacotes parados').check();
    await aguardarUmaConsultaNova(page, chamadas, chamadasIniciais, {
        diasParado: '7',
        somenteParados: 'true',
    });
});

test('mostra carregamento até resposta chegar e então exibe resultado', async ({
    page,
}) => {
    let liberarResposta: (() => void) | undefined;
    const respostaPendente = new Promise<void>((resolve) => {
        liberarResposta = resolve;
    });
    const chamadas = await interceptarApi(page, async () => {
        await respostaPendente;
        return { status: 200, body: relatorioPadrao() };
    });

    await abrirPacotes(page);
    const indicador = page.locator(
        '[aria-label="Carregando saldo de pacotes"]',
    );
    await expect(indicador).toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => chamadas.length).toBeGreaterThan(0);

    liberarResposta?.();
    await expect(indicador).toHaveCount(0);
    await expect(page.getByText('5 pacotes ativos · 2 parados')).toBeVisible();
});

test('editar dias não consulta até Buscar', async ({ page }) => {
    const chamadas = await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await expect(page.getByText('5 pacotes ativos · 2 parados')).toBeVisible();
    const chamadasIniciais = chamadas.length;
    await page.getByLabel('Dias sem vir').fill('30');
    expect(chamadas).toHaveLength(chamadasIniciais);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect.poll(() => chamadas.length).toBeGreaterThan(chamadasIniciais);
    expect(
        new URL(chamadas.at(-1) ?? 'http://localhost').searchParams.get(
            'diasParado',
        ),
    ).toBe('30');
});

test('filtro inválido desabilita busca e não consulta novamente', async ({
    page,
}) => {
    const chamadas = await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await expect(page.getByText('5 pacotes ativos · 2 parados')).toBeVisible();
    const chamadasIniciais = chamadas.length;
    await page.getByLabel('Dias sem vir').fill('366');
    await expect(page.getByRole('button', { name: 'Buscar' })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('1 e 365');
    expect(chamadas).toHaveLength(chamadasIniciais);
});

test('resumo usa totais de ativos e parados anteriores ao filtro', async ({
    page,
}) => {
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await expect(page.getByText('5 pacotes ativos · 2 parados')).toBeVisible();
});

test('avisa truncamento com teto de 500 e total completo', async ({ page }) => {
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao({ total: 520, truncado: true }),
    }));
    await abrirPacotes(page);
    await expect(page.getByRole('status')).toHaveText(
        'Mostrando os 500 primeiros de 520.',
    );
});

test('card mostra saldo de serviço e quantidade marcada', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    const card = page.getByTestId('saldo-pacote-card').first();
    await expect(
        card.getByText('Corte e Barba: 2 de 4 (1 marcado)'),
    ).toBeVisible();
    await expect(card.getByText('Restam 2 no total')).toBeVisible();
});

test('mostra selo de cliente parado com dias sem vir', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await expect(
        page
            .getByTestId('saldo-pacote-card')
            .first()
            .getByText('Parado há 40 dias'),
    ).toBeVisible();
});

test('mostra selo de horário marcado', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await expect(
        page
            .getByTestId('saldo-pacote-card')
            .nth(1)
            .getByText('Horário marcado'),
    ).toBeVisible();
});

test('explica selo a concluir com crédito pendente', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    const selo = page
        .getByTestId('saldo-pacote-card')
        .nth(1)
        .getByText('1 a concluir');
    await expect(selo).toHaveAttribute(
        'aria-label',
        `1 a concluir. ${textoAConcluir}`,
    );
});

test('mostra cliente sem visita com data de início e dias', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await expect(
        page
            .getByTestId('saldo-pacote-card')
            .nth(2)
            .getByText('Nunca veio · pacote desde 01/02/2026 (há 5 dias)'),
    ).toBeVisible();
});

test('usa fallback Nome não informado para nome em branco', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await expect(
        page
            .getByTestId('saldo-pacote-card')
            .nth(2)
            .getByText('Nome não informado'),
    ).toBeVisible();
});

test('WhatsApp usa wa.me, target blank e aria-label do cliente', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    const link = page.getByRole('link', {
        name: 'Chamar Ana Silva no WhatsApp',
    });
    await expect(link).toHaveAttribute('href', 'https://wa.me/5511999999999');
    await expect(link).toHaveAttribute('target', '_blank');
});

test('telefone inválido fica visível sem ação WhatsApp', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    const card = page.getByTestId('saldo-pacote-card').nth(2);
    await expect(card.getByText('telefone inválido')).toBeVisible();
    await expect(card.getByRole('link')).toHaveCount(0);
});

test('estado vazio mostra texto padrão sem pacote ativo com saldo', async ({
    page,
}) => {
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao({
            totalAtivos: 0,
            totalParados: 0,
            total: 0,
            itens: [],
        }),
    }));
    await abrirPacotes(page);
    await expect(
        page.getByText('Nenhum pacote ativo com saldo.'),
    ).toBeVisible();
});

test('estado vazio filtrado mostra nenhum pacote parado na faixa', async ({
    page,
}) => {
    const chamadas = await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao({ total: 0, itens: [] }),
    }));
    await abrirPacotes(page);
    await expect(
        page.getByText('Nenhum pacote ativo com saldo.'),
    ).toBeVisible();
    const chamadasIniciais = chamadas.length;
    await page.getByLabel('Mostrar só pacotes parados').check();
    await expect.poll(() => chamadas.length).toBeGreaterThan(chamadasIniciais);
    await expect(
        page.getByText('Nenhum pacote parado nesta faixa.'),
    ).toBeVisible();
});

test('mostra erro 400 e permite tentar de novo', async ({ page }) => {
    let chamadas = 0;
    let permitirSucesso = false;
    await interceptarApi(page, async () => {
        chamadas += 1;
        return permitirSucesso
            ? { status: 200, body: relatorioPadrao() }
            : { status: 400, body: { message: 'Filtro diasParado inválido.' } };
    });
    await abrirPacotes(page);
    await expect(page.getByRole('alert')).toContainText(
        'Filtro diasParado inválido.',
    );
    const chamadasAntesDoRetry = chamadas;
    permitirSucesso = true;
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.getByText('5 pacotes ativos · 2 parados')).toBeVisible();
    expect(chamadas).toBeGreaterThan(chamadasAntesDoRetry);
});

test('descarta resposta antiga após busca mais recente', async ({ page }) => {
    let liberarAntiga: (() => void) | undefined;
    const antigaPendente = new Promise<void>((resolve) => {
        liberarAntiga = resolve;
    });
    const chamadas = await interceptarApi(page, async (url) => {
        if (url.searchParams.get('diasParado') === '7') {
            await antigaPendente;
            return {
                status: 200,
                body: relatorioPadrao({
                    itens: itensPadrao.map((item) => ({
                        ...item,
                        nome: 'Resposta antiga',
                    })),
                }),
            };
        }
        return {
            status: 200,
            body: relatorioPadrao({
                filtro: { diasParado: 15, somenteParados: false },
                itens: itensPadrao.map((item) => ({
                    ...item,
                    nome: 'Resposta recente',
                })),
            }),
        };
    });
    await abrirPacotes(page);
    await expect.poll(() => chamadas.length).toBeGreaterThan(0);
    const chamadasAntigas = chamadas.length;
    await page.getByRole('button', { name: '15 dias' }).click();
    await expect.poll(() => chamadas.length).toBeGreaterThan(chamadasAntigas);
    await expect(page.getByText('Resposta recente').first()).toBeVisible();
    liberarAntiga?.();
    await expect(page.getByText('Resposta antiga')).toHaveCount(0);
});

test('não exibe campos de vencimento ou data de validade', async ({ page }) => {
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    await expect(page.getByText('Vencimento', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Válido até', { exact: false })).toHaveCount(0);
    await expect(
        page.getByText('Pacotes não têm prazo de validade.', { exact: false }),
    ).toBeVisible();
});

test('desktop usa tabela semântica com colunas de saldo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    const tabela = page.getByRole('table');
    await expect(tabela).toBeVisible();
    await expect(
        tabela.getByRole('columnheader', { name: 'Cliente' }),
    ).toBeVisible();
    await expect(
        tabela.getByRole('columnheader', { name: 'Saldo por serviço' }),
    ).toBeVisible();
});

test('desktop mostra selo apenas em ciclo renovado', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioComRenovacao(),
    }));
    await abrirPacotes(page);

    const tabela = page.getByRole('table');
    const ana = tabela.getByRole('row').filter({ hasText: 'Ana Silva' });
    const bruno = tabela.getByRole('row').filter({ hasText: 'Bruno Lima' });

    await expect(
        ana.getByText('Renovado automaticamente', { exact: true }),
    ).toBeVisible();
    await expect(
        bruno.getByText('Renovado automaticamente', { exact: true }),
    ).toHaveCount(0);
});

test('mobile 375px mostra selo só para renovado sem overflow horizontal', async ({
    page,
}) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioComRenovacao(),
    }));
    await abrirPacotes(page);

    const cards = page.getByTestId('saldo-pacote-card');
    const ana = cards.filter({ hasText: 'Ana Silva' });
    const bruno = cards.filter({ hasText: 'Bruno Lima' });
    const selo = ana.getByText('Renovado automaticamente', { exact: true });

    await expect(selo).toBeVisible();
    await expect(
        bruno.getByText('Renovado automaticamente', { exact: true }),
    ).toHaveCount(0);

    const caixaSelo = await selo.boundingBox();
    expect(caixaSelo).not.toBeNull();
    if (caixaSelo) {
        expect(caixaSelo.x + caixaSelo.width).toBeLessThanOrEqual(375);
    }

    const larguras = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documento: document.documentElement.scrollWidth,
    }));
    expect(larguras.documento).toBeLessThanOrEqual(larguras.viewport);
});

test('CSV baixa com nome local, BOM, cabeçalho, telefone e saldos', async ({
    page,
}) => {
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar planilha' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
        'saldo-pacotes_2026-03-15_parado7d.csv',
    );
    const caminho = await download.path();
    if (!caminho) throw new Error('Arquivo CSV não foi disponibilizado.');
    const conteudo = await readFile(caminho, 'utf8');
    expect(conteudo.charCodeAt(0)).toBe(0xfeff);
    expect(conteudo).toContain('Cliente;Telefone;Pacote;Início;Última visita;');
    expect(conteudo).toContain(
        '(11) 99999-9999;Pacote premium;02/01/2026;01/02/2026;40;Parado',
    );
    expect(conteudo).toContain('Corte e Barba: 2 de 4 (1 marcado)');
    expect(conteudo).toContain('Barba: 1 de 2 (1 marcado)');
    expect(conteudo.split('\r\n')).toHaveLength(itensPadrao.length + 1);
});

test('mobile não cria rolagem horizontal na aba Pacotes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await interceptarApi(page, async () => ({
        status: 200,
        body: relatorioPadrao(),
    }));
    await abrirPacotes(page);
    const larguras = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documento: document.documentElement.scrollWidth,
    }));
    expect(larguras.documento).toBeLessThanOrEqual(larguras.viewport);
});
