import { expect, test } from '@playwright/test';

const rotuloWhatsApp = 'Agendado pelo WhatsApp (IA)';
const rotuloPainel = 'Agendado pelo painel';
const nomeLongo =
    'Cliente com um nome extremamente longo para validar truncamento no card da agenda';

function criarAgendamento(
    id: string,
    origem: 'WHATSAPP_IA' | 'PAINEL' | null,
    nome: string,
    hora: string,
) {
    const dataHoraInicio = new Date(`2026-11-05T${hora}:00.000Z`);

    return {
        id,
        origem,
        dataHoraInicio: dataHoraInicio.toISOString(),
        dataHoraFim: new Date(
            dataHoraInicio.getTime() + 30 * 60 * 1000,
        ).toISOString(),
        status: 'AGENDADO',
        pacoteClienteId: null,
        numeroNoPacote: null,
        totalServicoNoPacote: null,
        loteId: null,
        concluido: false,
        cliente: { id: `cliente-${id}`, nome, telefone: '11999990000' },
        servico: {
            id: 'servico-corte',
            nome: 'Corte',
            duracaoMinutos: 30,
            preco: '50.00',
        },
    };
}

function retangulosSeSobrepoem(
    primeiro: { x: number; y: number; width: number; height: number },
    segundo: { x: number; y: number; width: number; height: number },
): boolean {
    return (
        primeiro.x < segundo.x + segundo.width &&
        primeiro.x + primeiro.width > segundo.x &&
        primeiro.y < segundo.y + segundo.height &&
        primeiro.y + primeiro.height > segundo.y
    );
}

test('posiciona selo sem colisão ou overflow em mobile e desktop', async ({
    page,
}, testInfo) => {
    await page.clock.install({ time: new Date('2026-11-05T15:00:00.000Z') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        let status = 404;
        let body: unknown = { message: 'Rota não prevista pelo teste.' };

        if (url.pathname === '/api/auth/me') {
            status = 200;
            body = { username: 'e2e', role: 'admin' };
        } else if (
            route.request().method() === 'GET' &&
            url.pathname === '/api/agendamentos'
        ) {
            status = 200;
            body = [
                criarAgendamento('whatsapp', 'WHATSAPP_IA', nomeLongo, '13:00'),
                criarAgendamento(
                    'painel',
                    'PAINEL',
                    'Cliente do painel',
                    '13:30',
                ),
                criarAgendamento(
                    'sem-origem',
                    null,
                    'Cliente sem origem',
                    '14:00',
                ),
            ];
        }

        await route.fulfill({ status, json: body });
    });

    await page.goto('/');

    const cards = page.getByRole('listitem');
    const cardWhatsApp = cards.filter({
        has: page.getByRole('img', { name: rotuloWhatsApp }),
    });
    const cardPainel = cards.filter({
        has: page.getByRole('img', { name: rotuloPainel }),
    });
    const cardSemOrigem = cards.filter({ hasText: 'Cliente sem origem' });

    await expect(cardWhatsApp).toHaveCount(1);
    await expect(cardPainel).toHaveCount(1);
    await expect(cardSemOrigem).toHaveCount(1);
    await expect(cardSemOrigem.getByRole('img')).toHaveCount(0);

    const nome = cardWhatsApp.locator('p').first();
    const selo = cardWhatsApp.getByRole('img', { name: rotuloWhatsApp });
    const horario = cardWhatsApp.getByText('10:00', { exact: true });

    for (const largura of [390, 1280]) {
        await page.setViewportSize({ width: largura, height: 844 });
        await expect(nome).toHaveCSS('text-overflow', 'ellipsis');
        expect(
            await nome.evaluate(
                (element) => element.scrollWidth > element.clientWidth,
            ),
        ).toBe(true);
        await expect(horario).toBeVisible();
        await expect(
            cardWhatsApp.getByRole('button', { name: 'Editar' }),
        ).toBeVisible();
        await expect(
            cardWhatsApp.getByRole('button', { name: 'Cancelar' }),
        ).toBeVisible();

        const caixaSelo = await selo.boundingBox();
        const caixaHorario = await horario.boundingBox();
        if (!caixaSelo || !caixaHorario) {
            throw new Error('Selo ou horário sem bounding box.');
        }

        expect(caixaSelo.x).toBeGreaterThanOrEqual(0);
        expect(caixaSelo.x + caixaSelo.width).toBeLessThanOrEqual(largura);
        expect(retangulosSeSobrepoem(caixaSelo, caixaHorario)).toBe(false);

        const overflowPais = await selo.evaluate((element) => {
            const excedentes: string[] = [];
            let ancestral = element.parentElement;
            while (ancestral) {
                if (ancestral.scrollWidth > ancestral.clientWidth) {
                    excedentes.push(ancestral.tagName.toLowerCase());
                }
                ancestral = ancestral.parentElement;
            }
            return excedentes;
        });
        expect(overflowPais).toEqual([]);

        if (largura === 390) {
            console.log(
                `[${testInfo.project.name} 390px] selo=${JSON.stringify(caixaSelo)} horario=${JSON.stringify(caixaHorario)}`,
            );
        }
    }
});

test('exibe conclusão automática e confirma estorno autorizado pelo DTO', async ({
    page,
}) => {
    await page.clock.install({ time: new Date('2026-11-05T15:00:00.000Z') });
    const agendamentoAutomatico = {
        ...criarAgendamento(
            'automatico',
            'PAINEL',
            'Cliente com pacote',
            '13:00',
        ),
        pacoteClienteId: 'pacote-cliente-1',
        concluido: true,
        concluidoEm: '2026-11-05T13:30:00.000Z',
        concluidoPor: 'AUTOMATICO',
        estornavel: true,
        autoConclusaoPendente: false,
    };
    const agendamentoPendente = {
        ...criarAgendamento(
            'pendente',
            null,
            'Cliente com pacote pendente',
            '13:30',
        ),
        pacoteClienteId: 'pacote-cliente-2',
        concluido: false,
        concluidoEm: null,
        concluidoPor: null,
        estornavel: false,
        autoConclusaoPendente: true,
    };
    let cancelado = false;
    let requisicoesDelete = 0;

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.pathname === '/api/auth/me') {
            await route.fulfill({
                status: 200,
                json: { username: 'e2e', role: 'admin' },
            });
            return;
        }

        if (
            request.method() === 'GET' &&
            url.pathname === '/api/agendamentos'
        ) {
            await route.fulfill({
                status: 200,
                json: [
                    cancelado
                        ? {
                              ...agendamentoAutomatico,
                              status: 'CANCELADO',
                              concluido: false,
                              concluidoEm: null,
                              concluidoPor: null,
                              estornavel: false,
                          }
                        : agendamentoAutomatico,
                    agendamentoPendente,
                ],
            });
            return;
        }

        if (
            request.method() === 'DELETE' &&
            url.pathname === '/api/agendamentos/automatico'
        ) {
            requisicoesDelete += 1;
            cancelado = true;
            await route.fulfill({
                status: 200,
                json: {
                    ...agendamentoAutomatico,
                    status: 'CANCELADO',
                    concluido: false,
                    concluidoEm: null,
                    concluidoPor: null,
                    estornavel: false,
                },
            });
            return;
        }

        await route.fulfill({
            status: 404,
            json: { message: 'Rota não prevista pelo teste.' },
        });
    });

    await page.goto('/');

    const card = page
        .getByRole('listitem')
        .filter({ has: page.getByText('Cliente com pacote', { exact: true }) });
    await expect(card.getByText('Concluído automaticamente')).toBeVisible();
    await expect(
        page
            .getByRole('listitem')
            .filter({ hasText: 'Cliente com pacote pendente' })
            .getByText('Pendente de conclusão automática'),
    ).toBeVisible();
    await card.getByRole('button', { name: 'Cancelar' }).click();
    await expect(
        page.getByText('1 crédito será devolvido ao pacote'),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Sim, cancelar e estornar crédito' })
        .click();

    await expect.poll(() => requisicoesDelete).toBe(1);
    await expect(card.getByText('CANCELADO')).toBeVisible();
});
