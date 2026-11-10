import { expect, test, type Page, type Route } from '@playwright/test';
import type { PacoteCatalogo } from '../src/services/pacotes.service.js';

type FalhaExclusao = 'ciclo-ativo' | 'historico' | 'nao-encontrado';

interface MockPacotes {
    pacotes: PacoteCatalogo[];
    falhasExclusao: Map<string, FalhaExclusao>;
    consultas: string[];
}

function criarPacote(
    id: string,
    opcoes: {
        arquivadoEm?: string | null;
        ciclosAtivos?: number;
        liberadoParaGemini?: boolean;
        nome?: string;
    } = {},
): PacoteCatalogo {
    return {
        id,
        nome: opcoes.nome ?? id,
        duracaoDias: 30,
        preco: '120.00',
        liberadoParaGemini: opcoes.liberadoParaGemini ?? false,
        createdAt: '2026-01-01T12:00:00.000Z',
        arquivadoEm: opcoes.arquivadoEm ?? null,
        ciclosAtivos: opcoes.ciclosAtivos ?? 0,
        servicos: [
            {
                pacoteId: id,
                servicoId: 'servico-corte',
                quantidadeTotal: 4,
                servico: {
                    id: 'servico-corte',
                    nome: 'Corte',
                    duracaoMinutos: 30,
                    preco: '50.00',
                    permiteExtensaoFechamento: false,
                },
            },
        ],
    };
}

function copiarPacotes(pacotes: PacoteCatalogo[]): PacoteCatalogo[] {
    return JSON.parse(JSON.stringify(pacotes)) as PacoteCatalogo[];
}

async function mockApi(
    page: Page,
    pacotesIniciais: PacoteCatalogo[],
): Promise<MockPacotes> {
    const estado: MockPacotes = {
        pacotes: copiarPacotes(pacotesIniciais),
        falhasExclusao: new Map(),
        consultas: [],
    };

    await page.route('**/api/**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        let status = 200;
        let body: unknown = {};

        if (method === 'GET' && url.pathname === '/api/auth/me') {
            body = { username: 'e2e', role: 'admin' };
        } else if (method === 'GET' && url.pathname === '/api/pacotes') {
            estado.consultas.push(url.search);
            body = copiarPacotes(estado.pacotes);
        } else {
            const acaoPacote = url.pathname.match(
                /^\/api\/pacotes\/([^/]+)\/(arquivar|desarquivar)$/,
            );
            if (acaoPacote && method === 'POST') {
                const [, idCodificado, acao] = acaoPacote;
                const id = decodeURIComponent(idCodificado);
                const pacote = estado.pacotes.find((item) => item.id === id);
                if (!pacote) {
                    status = 404;
                    body = { message: 'Pacote não encontrado.' };
                } else {
                    pacote.arquivadoEm =
                        acao === 'arquivar'
                            ? (pacote.arquivadoEm ?? '2026-11-10T12:00:00.000Z')
                            : null;
                    body = copiarPacotes([pacote])[0];
                }
            } else if (
                method === 'DELETE' &&
                /^\/api\/pacotes\/[^/]+$/.test(url.pathname)
            ) {
                const id = decodeURIComponent(
                    url.pathname.split('/').at(-1) ?? '',
                );
                const falha = estado.falhasExclusao.get(id);
                if (falha === 'ciclo-ativo') {
                    status = 409;
                    body = {
                        message: 'Há clientes com ciclo ativo neste pacote.',
                        code: 'PACOTE_COM_CICLO_ATIVO',
                    };
                } else if (falha === 'historico') {
                    status = 409;
                    body = {
                        message: 'O pacote tem histórico de vendas.',
                        code: 'PACOTE_COM_HISTORICO',
                    };
                } else if (falha === 'nao-encontrado') {
                    estado.pacotes = estado.pacotes.filter(
                        (pacote) => pacote.id !== id,
                    );
                    status = 404;
                    body = { message: 'Pacote não encontrado.' };
                } else {
                    estado.pacotes = estado.pacotes.filter(
                        (pacote) => pacote.id !== id,
                    );
                    status = 204;
                }
            } else {
                status = 404;
                body = { message: 'Rota não prevista pelo teste.' };
            }
        }

        if (status === 204) {
            await route.fulfill({ status });
        } else {
            await route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(body),
            });
        }
    });

    return estado;
}

async function abrirPaginaPacotes(page: Page): Promise<void> {
    await page.goto('/pacotes');
    await expect(
        page.getByRole('heading', { name: 'Pacotes', exact: true }),
    ).toBeVisible();
}

test('abas mostram contagens e separam ativos de arquivados', async ({
    page,
}) => {
    await mockApi(page, [
        criarPacote('Pacote ativo', { ciclosAtivos: 2 }),
        criarPacote('Pacote ativo sem ciclos'),
        criarPacote('Pacote arquivado', {
            arquivadoEm: '2026-11-01T12:00:00.000Z',
            liberadoParaGemini: true,
        }),
    ]);
    await abrirPaginaPacotes(page);

    const abaAtivos = page.getByRole('tab', { name: 'Ativos (2)' });
    const abaArquivados = page.getByRole('tab', { name: 'Arquivados (1)' });
    await expect(abaAtivos).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('2 ciclos ativos')).toBeVisible();
    await expect(page.getByText('Pacote arquivado')).toHaveCount(0);

    await abaAtivos.focus();
    await abaAtivos.press('ArrowRight');
    await expect(abaArquivados).toHaveAttribute('aria-selected', 'true');
    await expect(
        page.getByText('Não aparece para o Gemini enquanto arquivado.'),
    ).toBeVisible();
    await expect(page.getByText('Pacote ativo', { exact: true })).toHaveCount(
        0,
    );
});

test('arquiva pacote com ciclos ativos e informa que não haverá renovação', async ({
    page,
}) => {
    await mockApi(page, [
        criarPacote('Pacote com ciclos', { ciclosAtivos: 2 }),
    ]);
    await abrirPaginaPacotes(page);

    await page
        .getByRole('button', { name: 'Arquivar pacote Pacote com ciclos' })
        .click();
    const dialog = page.getByRole('dialog', { name: 'Arquivar pacote?' });
    await expect(
        dialog.getByText(
            'O pacote deixa de aparecer para novas vendas, vínculos e para o Gemini. O histórico é preservado.',
        ),
    ).toBeVisible();
    await expect(
        dialog.getByText('2 ciclos ativos seguirão até zerar, sem renovação.'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Arquivar' }).click();

    await expect(page.getByText('Pacote arquivado.')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Ativos (0)' })).toBeVisible();
    await page.getByRole('tab', { name: 'Arquivados (1)' }).click();
    await expect(page.getByText('Pacote com ciclos')).toBeVisible();
});

test('arquiva pacote sem ciclos sem mostrar aviso de ciclo', async ({
    page,
}) => {
    await mockApi(page, [criarPacote('Pacote simples')]);
    await abrirPaginaPacotes(page);

    await page
        .getByRole('button', { name: 'Arquivar pacote Pacote simples' })
        .click();
    const dialog = page.getByRole('dialog', { name: 'Arquivar pacote?' });
    await expect(dialog.getByText(/ciclo ativo seguirá/)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Arquivar' }).click();
    await expect(page.getByText('Pacote arquivado.')).toBeVisible();
});

test('desarquiva pacote sem diálogo', async ({ page }) => {
    await mockApi(page, [
        criarPacote('Pacote arquivado', {
            arquivadoEm: '2026-11-01T12:00:00.000Z',
        }),
    ]);
    await abrirPaginaPacotes(page);
    await page.getByRole('tab', { name: 'Arquivados (1)' }).click();
    await page
        .getByRole('button', { name: 'Desarquivar pacote Pacote arquivado' })
        .click();

    await expect(page.getByText('Pacote desarquivado.')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Ativos (1)' })).toBeVisible();
    await expect(
        page.getByRole('tab', { name: 'Arquivados (0)' }),
    ).toBeVisible();
});

test('não renderiza excluir quando pacote tem ciclos ativos', async ({
    page,
}) => {
    await mockApi(page, [criarPacote('Pacote em uso', { ciclosAtivos: 1 })]);
    await abrirPaginaPacotes(page);

    await expect(
        page.getByRole('button', { name: 'Excluir pacote Pacote em uso' }),
    ).toHaveCount(0);
    await expect(page.getByText('1 ciclo ativo')).toBeVisible();
});

test('histórico bloqueia exclusão e alerta oferece arquivamento', async ({
    page,
}) => {
    const estado = await mockApi(page, [criarPacote('Pacote com histórico')]);
    estado.falhasExclusao.set('Pacote com histórico', 'historico');
    await abrirPaginaPacotes(page);

    await page
        .getByRole('button', {
            name: 'Excluir pacote Pacote com histórico',
        })
        .click();
    await page
        .getByRole('dialog', { name: 'Confirmar exclusão' })
        .getByRole('button', { name: 'Excluir' })
        .click();

    const alerta = page.getByRole('alert');
    await expect(alerta).toContainText(
        'O pacote tem histórico de vendas. Arquive em vez de excluir.',
    );
    await alerta
        .getByRole('button', {
            name: 'Arquivar pacote Pacote com histórico',
        })
        .click();
    await page
        .getByRole('dialog', { name: 'Arquivar pacote?' })
        .getByRole('button', { name: 'Arquivar' })
        .click();

    await expect(page.getByText('Pacote arquivado.')).toBeVisible();
    await page.getByRole('tab', { name: 'Arquivados (1)' }).click();
    await expect(page.getByText('Pacote com histórico')).toBeVisible();
});

test('409 de ciclo ativo refaz listagem e mostra alerta específico', async ({
    page,
}) => {
    const estado = await mockApi(page, [criarPacote('Pacote com ciclo')]);
    estado.falhasExclusao.set('Pacote com ciclo', 'ciclo-ativo');
    await abrirPaginaPacotes(page);
    const botaoExcluir = page.getByRole('button', {
        name: 'Excluir pacote Pacote com ciclo',
    });
    await expect(botaoExcluir).toBeVisible();
    const consultasIniciais = estado.consultas.length;

    await botaoExcluir.click();
    await page
        .getByRole('dialog', { name: 'Confirmar exclusão' })
        .getByRole('button', { name: 'Excluir' })
        .click();

    await expect(page.getByRole('alert')).toContainText(
        'Há clientes com ciclo ativo neste pacote. Arquive em vez de excluir.',
    );
    await expect
        .poll(() => estado.consultas.length)
        .toBe(consultasIniciais + 1);
});

test('404 ao excluir refaz listagem e informa que pacote sumiu', async ({
    page,
}) => {
    const estado = await mockApi(page, [criarPacote('Pacote removido')]);
    estado.falhasExclusao.set('Pacote removido', 'nao-encontrado');
    await abrirPaginaPacotes(page);
    const botaoExcluir = page.getByRole('button', {
        name: 'Excluir pacote Pacote removido',
    });
    await expect(botaoExcluir).toBeVisible();
    const consultasIniciais = estado.consultas.length;

    await botaoExcluir.click();
    await page
        .getByRole('dialog', { name: 'Confirmar exclusão' })
        .getByRole('button', { name: 'Excluir' })
        .click();

    await expect(page.getByRole('alert')).toContainText(
        'O pacote não existe mais.',
    );
    await expect
        .poll(() => estado.consultas.length)
        .toBe(consultasIniciais + 1);
});

test('viewport 375px não cria overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockApi(page, [
        criarPacote(
            'Pacote de serviços com nome longo para testar quebra de linha',
        ),
        criarPacote('Pacote arquivado de nome longo', {
            arquivadoEm: '2026-11-01T12:00:00.000Z',
        }),
    ]);
    await abrirPaginaPacotes(page);

    const dimensoes = await page.evaluate(() => ({
        larguraDocumento: document.documentElement.scrollWidth,
        larguraViewport: document.documentElement.clientWidth,
    }));
    expect(dimensoes.larguraDocumento).toBeLessThanOrEqual(
        dimensoes.larguraViewport,
    );
});
