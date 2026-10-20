import { expect, test } from '@playwright/test';

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

test('edição confirma expediente e repete PUT com override temporário', async ({
    page,
}) => {
    const atualizacoes: Record<string, unknown>[] = [];
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
            response = { status: 200, body: AGENDAMENTO };
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/servicos'
        ) {
            response = {
                status: 200,
                body: [AGENDAMENTO.servico],
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
                atualizacoes.length === 1
                    ? {
                          status: 422,
                          body: {
                              message: 'Horário fora do expediente.',
                              code: 'FORA_DO_EXPEDIENTE',
                              motivos: ['dia_fechado'],
                          },
                      }
                    : { status: 200, body: AGENDAMENTO };
        }

        await route.fulfill({ status: response.status, json: response.body });
    });

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
