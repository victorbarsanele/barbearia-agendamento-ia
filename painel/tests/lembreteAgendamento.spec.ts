import { expect, test } from '@playwright/test';

function criarAgendamento(ultimoLembrete: unknown = null) {
    return {
        id: 'agendamento-lembrete',
        origem: 'PAINEL',
        dataHoraInicio: '2026-11-05T16:30:00.000Z',
        dataHoraFim: '2026-11-05T17:00:00.000Z',
        status: 'AGENDADO',
        pacoteClienteId: null,
        numeroNoPacote: null,
        totalServicoNoPacote: null,
        loteId: null,
        concluido: false,
        ultimoLembrete,
        cliente: {
            id: 'cliente-lembrete',
            nome: 'Cliente do lembrete',
            telefone: '11999990000',
        },
        servico: {
            id: 'servico-corte',
            nome: 'Corte clássico',
            duracaoMinutos: 30,
            preco: '50.00',
        },
    };
}

test('confirms reminder details and shows accepted time on mobile', async ({
    page,
}) => {
    await page.clock.install({ time: new Date('2026-11-05T15:00:00.000Z') });
    await page.setViewportSize({ width: 390, height: 844 });

    let aceito = false;
    let chamadasEnvio = 0;
    await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/auth/me') {
            await route.fulfill({ status: 200, json: { role: 'admin' } });
            return;
        }
        if (
            route.request().method() === 'GET' &&
            url.pathname === '/api/agendamentos'
        ) {
            await route.fulfill({
                status: 200,
                json: [
                    criarAgendamento(
                        aceito
                            ? {
                                  status: 'ACEITO',
                                  criadoEm: '2026-11-05T15:01:00.000Z',
                                  aceitoEm: '2026-11-05T15:02:00.000Z',
                                  motivoFalha: null,
                              }
                            : null,
                    ),
                ],
            });
            return;
        }
        if (
            route.request().method() === 'POST' &&
            url.pathname === '/api/agendamentos/agendamento-lembrete/lembrete'
        ) {
            chamadasEnvio += 1;
            aceito = true;
            await route.fulfill({
                status: 202,
                json: {
                    status: 'ACEITO',
                    aceitoEm: '2026-11-05T15:02:00.000Z',
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
    const card = page.getByRole('listitem').filter({
        hasText: 'Cliente do lembrete',
    });
    await expect(
        card.getByRole('button', { name: 'Enviar lembrete' }),
    ).toBeVisible();
    await card.getByRole('button', { name: 'Enviar lembrete' }).click();

    const dialog = page.getByRole('dialog', { name: 'Enviar lembrete' });
    await expect(
        dialog.getByText('Cliente: Cliente do lembrete'),
    ).toBeVisible();
    await expect(dialog.getByText('Serviço: Corte clássico')).toBeVisible();
    await expect(
        dialog.getByText(
            'Data e horário: quinta-feira, 5 de novembro de 2026 às 13:30',
        ),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Enviar lembrete' }).click();

    await expect(card.getByText('Lembrete enviado às 12:02')).toBeVisible();
    await expect(
        card.getByRole('button', { name: 'Enviar lembrete' }),
    ).toHaveCount(0);
    expect(chamadasEnvio).toBe(1);
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
});

test('allows retry after a failed reminder attempt', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-05T15:00:00.000Z') });
    await page.setViewportSize({ width: 390, height: 844 });

    let falhou = false;
    let aceito = false;
    let chamadasEnvio = 0;
    await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/auth/me') {
            await route.fulfill({ status: 200, json: { role: 'admin' } });
            return;
        }
        if (
            route.request().method() === 'GET' &&
            url.pathname === '/api/agendamentos'
        ) {
            await route.fulfill({
                status: 200,
                json: [
                    criarAgendamento(
                        aceito
                            ? {
                                  status: 'ACEITO',
                                  criadoEm: '2026-11-05T15:01:00.000Z',
                                  aceitoEm: '2026-11-05T15:02:00.000Z',
                                  motivoFalha: null,
                              }
                            : falhou
                              ? {
                                    status: 'FALHOU',
                                    criadoEm: '2026-11-05T15:01:00.000Z',
                                    aceitoEm: null,
                                    motivoFalha: 'Falha temporária',
                                }
                              : null,
                    ),
                ],
            });
            return;
        }
        if (
            route.request().method() === 'POST' &&
            url.pathname === '/api/agendamentos/agendamento-lembrete/lembrete'
        ) {
            chamadasEnvio += 1;
            if (chamadasEnvio === 1) {
                falhou = true;
                await route.fulfill({
                    status: 502,
                    json: { message: 'Falha ao enviar lembrete.' },
                });
                return;
            }
            aceito = true;
            await route.fulfill({
                status: 202,
                json: {
                    status: 'ACEITO',
                    aceitoEm: '2026-11-05T15:02:00.000Z',
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
    const card = page.getByRole('listitem').filter({
        hasText: 'Cliente do lembrete',
    });
    await card.getByRole('button', { name: 'Enviar lembrete' }).click();
    await page
        .getByRole('dialog', { name: 'Enviar lembrete' })
        .getByRole('button', { name: 'Enviar lembrete' })
        .click();

    await expect(page.getByText('Falha ao enviar lembrete.')).toBeVisible();
    await expect(card.getByText('Última tentativa falhou')).toBeVisible();
    await card.getByRole('button', { name: 'Tentar novamente' }).click();
    await page
        .getByRole('dialog', { name: 'Enviar lembrete' })
        .getByRole('button', { name: 'Enviar lembrete' })
        .click();

    await expect(card.getByText('Lembrete enviado às 12:02')).toBeVisible();
    expect(chamadasEnvio).toBe(2);
});

test('does not offer reminder for past appointment', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-05T15:00:00.000Z') });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname === '/api/auth/me') {
            await route.fulfill({ status: 200, json: { role: 'admin' } });
            return;
        }
        if (
            request.method() === 'GET' &&
            url.pathname === '/api/agendamentos'
        ) {
            await route.fulfill({
                status: 200,
                json: [
                    {
                        ...criarAgendamento(),
                        dataHoraInicio: '2026-11-05T14:00:00.000Z',
                        dataHoraFim: '2026-11-05T14:30:00.000Z',
                    },
                ],
            });
            return;
        }
        await route.fulfill({
            status: 404,
            json: { message: 'Rota não prevista pelo teste.' },
        });
    });

    await page.goto('/');
    const card = page.getByRole('listitem').filter({
        hasText: 'Cliente do lembrete',
    });
    await expect(card).toBeVisible();
    await expect(
        card.getByRole('button', { name: 'Enviar lembrete' }),
    ).toHaveCount(0);
});
