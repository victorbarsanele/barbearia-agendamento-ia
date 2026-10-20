import { expect, test, type Page } from '@playwright/test';

const AGENDAMENTO = {
    id: 'agendamento-edicao',
    dataHoraInicio: '2026-11-15T13:00:00.000-03:00',
    dataHoraFim: '2026-11-15T13:30:00.000-03:00',
    status: 'AGENDADO',
    pacoteClienteId: null,
    numeroNoPacote: null,
    totalServicoNoPacote: null,
    loteId: null,
    concluido: false,
    cliente: {
        id: 'cliente-ana',
        nome: 'Ana Souza',
        telefone: '11999990001',
    },
    servico: {
        id: 'servico-corte',
        nome: 'Corte',
        duracaoMinutos: 30,
        preco: '50.00',
    },
};
const SERVICO_NOVO = {
    id: 'servico-barba',
    nome: 'Barba',
    duracaoMinutos: 45,
    preco: '65.00',
};

async function mockEdicao(
    page: Page,
    dataHoraInicio = AGENDAMENTO.dataHoraInicio,
    exigirOverride = true,
): Promise<Record<string, unknown>[]> {
    const atualizacoes: Record<string, unknown>[] = [];
    const agendamento = { ...AGENDAMENTO, dataHoraInicio };

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        let response: { status: number; body: unknown } = {
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
            url.pathname === '/api/agendamentos/agendamento-edicao'
        ) {
            response = { status: 200, body: agendamento };
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/servicos'
        ) {
            response = {
                status: 200,
                body: [AGENDAMENTO.servico, SERVICO_NOVO],
            };
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/pacotes/cliente/cliente-ana'
        ) {
            response = { status: 200, body: null };
        } else if (
            request.method() === 'PUT' &&
            url.pathname === '/api/agendamentos/agendamento-edicao'
        ) {
            atualizacoes.push(
                JSON.parse(request.postData() ?? '{}') as Record<
                    string,
                    unknown
                >,
            );
            response =
                exigirOverride && atualizacoes.length === 1
                    ? {
                          status: 422,
                          body: {
                              message: 'Horário fora do expediente.',
                              code: 'FORA_DO_EXPEDIENTE',
                              motivos: ['dia_fechado'],
                          },
                      }
                    : { status: 200, body: agendamento };
        }

        await route.fulfill({ status: response.status, json: response.body });
    });

    return atualizacoes;
}

async function medirPreSelecao(page: Page, hora: string, minuto: string) {
    return page.evaluate(
        ({ horaEsperada, minutoEsperado }) => {
            const columns = Array.from(
                document.querySelectorAll<HTMLElement>(
                    '.date-time-picker-scrollbar-hidden',
                ),
            );
            const measure = (columnIndex: number, expected: string) => {
                const column = columns[columnIndex];
                const button = Array.from(
                    column?.querySelectorAll<HTMLButtonElement>('button') ?? [],
                ).find((item) => item.textContent?.trim() === expected);

                if (!column || !button) {
                    return null;
                }

                const columnRect = column.getBoundingClientRect();
                const buttonRect = button.getBoundingClientRect();
                const columnCenter = columnRect.top + columnRect.height / 2;
                const buttonCenter = buttonRect.top + buttonRect.height / 2;

                return {
                    selected: button.className.includes('font-semibold'),
                    fullyVisible:
                        buttonRect.top >= columnRect.top &&
                        buttonRect.bottom <= columnRect.bottom,
                    centerDelta: Math.abs(buttonCenter - columnCenter),
                    itemHeight: buttonRect.height,
                    offsetTop: button.offsetTop,
                    offsetParent:
                        button.offsetParent instanceof HTMLElement
                            ? `${button.offsetParent.tagName}.${button.offsetParent.className}`
                            : null,
                    scrollTop: column.scrollTop,
                    clientHeight: column.clientHeight,
                    columnTop: columnRect.top,
                    itemTop: buttonRect.top,
                };
            };

            return {
                hour: measure(0, horaEsperada),
                minute: measure(1, minutoEsperado),
            };
        },
        { horaEsperada: hora, minutoEsperado: minuto },
    );
}

async function abrirEdicao(
    page: Page,
    dataHoraInicio: string,
    exigirOverride = false,
): Promise<Record<string, unknown>[]> {
    const atualizacoes = await mockEdicao(page, dataHoraInicio, exigirOverride);
    await page.goto('/editar/agendamento-edicao');
    await expect(page.getByText('SELECIONE UM NOVO HORÁRIO')).toBeVisible();
    await page.waitForTimeout(200);
    return atualizacoes;
}

for (const viewport of [
    { name: 'estreito', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 900 },
]) {
    test(`pré-seleção 09:00 fica visível e centralizada em ${viewport.name}`, async ({
        page,
    }) => {
        await page.setViewportSize(viewport);
        await mockEdicao(page, '2026-11-15T09:00:00.000-03:00');
        await page.goto('/editar/agendamento-edicao');
        await expect(page.getByText('SELECIONE UM NOVO HORÁRIO')).toBeVisible();
        await page.waitForTimeout(200);

        const metrics = await medirPreSelecao(page, '09', '00');
        console.log(
            `preselection metrics ${viewport.name}: ${JSON.stringify(metrics)}`,
        );

        expect(metrics.hour).not.toBeNull();
        expect(metrics.minute).not.toBeNull();
        expect(metrics.hour?.selected).toBe(true);
        expect(metrics.minute?.selected).toBe(true);
        expect(metrics.hour?.fullyVisible).toBe(true);
        expect(metrics.minute?.fullyVisible).toBe(true);
        expect(metrics.hour?.centerDelta).toBeLessThanOrEqual(
            metrics.hour?.itemHeight ?? 0,
        );
        expect(metrics.minute?.centerDelta).toBeLessThanOrEqual(
            metrics.minute?.itemHeight ?? 0,
        );
    });
}

for (const horario of [
    { hora: '06', minuto: '00', iso: '2026-11-15T06:00:00.000-03:00' },
    { hora: '22', minuto: '45', iso: '2026-11-15T22:45:00.000-03:00' },
]) {
    test(`pré-seleção de borda ${horario.hora}:${horario.minuto} fica centralizada`, async ({
        page,
    }) => {
        await abrirEdicao(page, horario.iso);
        const metrics = await medirPreSelecao(
            page,
            horario.hora,
            horario.minuto,
        );

        expect(metrics.hour?.selected).toBe(true);
        expect(metrics.minute?.selected).toBe(true);
        expect(metrics.hour?.fullyVisible).toBe(true);
        expect(metrics.minute?.fullyVisible).toBe(true);
        expect(metrics.hour?.centerDelta).toBeLessThanOrEqual(
            metrics.hour?.itemHeight ?? 0,
        );
        expect(metrics.minute?.centerDelta).toBeLessThanOrEqual(
            metrics.minute?.itemHeight ?? 0,
        );
    });
}

test('trocar só serviço mantém ISO original no PUT', async ({ page }) => {
    const dataHoraInicioOriginal = '2026-11-15T09:00:37.123-03:00';
    const atualizacoes = await abrirEdicao(page, dataHoraInicioOriginal);

    await expect(page.getByText('Atual: 15/11 às 09:00')).toBeVisible();
    await expect(page.getByText(/^Novo:/)).toHaveCount(0);
    await page.getByLabel('Serviço').selectOption('servico-barba');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect.poll(() => atualizacoes.length).toBe(1);
    expect(atualizacoes[0].dataHoraInicio).toBe(dataHoraInicioOriginal);
});

test('scroll manual muda horário; voltar ao original limpa Novo e preserva ISO', async ({
    page,
}) => {
    const dataHoraInicioOriginal = '2026-11-15T09:00:37.123-03:00';
    const atualizacoes = await abrirEdicao(page, dataHoraInicioOriginal);
    const colunas = page.locator('.date-time-picker-scrollbar-hidden');
    const colunaHora = colunas.nth(0);
    const colunaMinuto = colunas.nth(1);

    await colunaHora.hover();
    await page.mouse.wheel(0, 44);
    const novoHorario = page.getByText('Novo: 15/11 às 10:00');
    await expect(novoHorario).toBeVisible();
    await expect(novoHorario).toHaveAttribute('aria-live', 'polite');

    await colunaMinuto.hover();
    await page.mouse.wheel(0, 44);
    await expect(page.getByText('Novo: 15/11 às 10:15')).toBeVisible();

    await colunaMinuto.hover();
    await page.mouse.wheel(0, -44);
    await expect(page.getByText('Novo: 15/11 às 10:00')).toBeVisible();
    await colunaHora.hover();
    await page.mouse.wheel(0, -44);
    await expect(page.getByText(/^Novo:/)).toHaveCount(0);

    await page.getByLabel('Serviço').selectOption('servico-barba');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect.poll(() => atualizacoes.length).toBe(1);
    expect(atualizacoes[0].dataHoraInicio).toBe(dataHoraInicioOriginal);
});

for (const horario of [
    {
        label: '05:30',
        iso: '2026-11-15T05:30:00.000-03:00',
        horaSelecionada: null,
    },
    {
        label: '09:20',
        iso: '2026-11-15T09:20:00.000-03:00',
        horaSelecionada: '09',
    },
]) {
    test(`horário atual ${horario.label} não selecionável mantém aviso e ISO`, async ({
        page,
    }) => {
        const atualizacoes = await abrirEdicao(page, horario.iso);
        await expect(
            page.getByText(
                'Horário atual fora das opções do seletor; será mantido se você não escolher outro.',
            ),
        ).toBeVisible();
        await expect(
            page.getByText(`Atual: 15/11 às ${horario.label}`),
        ).toBeVisible();
        await expect(page.getByText(/^Novo:/)).toHaveCount(0);

        const selecoes = await page.evaluate(() => {
            const columns = Array.from(
                document.querySelectorAll('.date-time-picker-scrollbar-hidden'),
            );
            return columns.map((column) =>
                Array.from(column.querySelectorAll('button'))
                    .filter((button) =>
                        button.className.includes('font-semibold'),
                    )
                    .map((button) => button.textContent?.trim()),
            );
        });
        expect(selecoes[0]).toEqual([]);
        expect(selecoes[1]).toEqual([]);

        await page.getByLabel('Serviço').selectOption('servico-barba');
        await page.getByRole('button', { name: 'Salvar alterações' }).click();
        await expect.poll(() => atualizacoes.length).toBe(1);
        expect(atualizacoes[0].dataHoraInicio).toBe(horario.iso);
    });
}

test('Bloqueios ainda seleciona início e fim manualmente', async ({ page }) => {
    const bloqueiosCriados: Record<string, unknown>[] = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        let response: { status: number; body: unknown } = {
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
            url.pathname === '/api/bloqueios'
        ) {
            response = { status: 200, body: [] };
        } else if (
            request.method() === 'POST' &&
            url.pathname === '/api/bloqueios'
        ) {
            const payload = JSON.parse(request.postData() ?? '{}') as Record<
                string,
                unknown
            >;
            bloqueiosCriados.push(payload);
            response = {
                status: 201,
                body: {
                    id: 'bloqueio-mock',
                    ...payload,
                    diaSemana: null,
                    horaInicioMinutos: null,
                    horaFimMinutos: null,
                    createdAt: '2026-10-20T12:00:00.000Z',
                },
            };
        }

        await route.fulfill({ status: response.status, json: response.body });
    });

    await page.goto('/bloqueios');
    const calendario = page
        .getByText('SELECIONE A DATA')
        .locator('..')
        .locator('..')
        .locator('..');
    await calendario.getByRole('button', { name: 'Próximo mês' }).click();
    await calendario.getByRole('button', { name: '15', exact: true }).click();

    const inicio = page
        .getByText('SELECIONE O INÍCIO')
        .last()
        .locator('..')
        .locator('..')
        .locator('..');
    const colunasInicio = inicio.locator('.date-time-picker-scrollbar-hidden');
    await colunasInicio
        .nth(0)
        .getByRole('button', { name: '10', exact: true })
        .click();
    await colunasInicio
        .nth(1)
        .getByRole('button', { name: '30', exact: true })
        .click();

    const fim = page
        .getByText('SELECIONE O FIM')
        .last()
        .locator('..')
        .locator('..')
        .locator('..');
    const colunasFim = fim.locator('.date-time-picker-scrollbar-hidden');
    await colunasFim
        .nth(0)
        .getByRole('button', { name: '11', exact: true })
        .click();
    await colunasFim
        .nth(1)
        .getByRole('button', { name: '00', exact: true })
        .click();
    await page.getByLabel('Motivo').fill('Teste seletor compartilhado');
    await page.getByRole('button', { name: 'Criar bloqueio' }).click();

    await expect.poll(() => bloqueiosCriados.length).toBe(1);
    expect(bloqueiosCriados[0]).toMatchObject({
        dataHoraInicio: '2026-11-15T13:30:00.000Z',
        dataHoraFim: '2026-11-15T14:00:00.000Z',
        motivo: 'Teste seletor compartilhado',
    });
});

test('edição confirma expediente e repete PUT com override temporário', async ({
    page,
}) => {
    const atualizacoes = await mockEdicao(page);

    await page.goto('/editar/agendamento-edicao');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Dia fechado');
    expect(atualizacoes).toHaveLength(1);
    expect(atualizacoes[0]).not.toHaveProperty('permitirForaDoExpediente');

    await dialog.getByRole('button', { name: 'Encaixar mesmo assim' }).click();
    await expect.poll(() => atualizacoes.length).toBe(2);
    expect(atualizacoes[1]).toEqual({
        ...atualizacoes[0],
        permitirForaDoExpediente: true,
    });
});
