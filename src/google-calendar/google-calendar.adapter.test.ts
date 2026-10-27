import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    GoogleCalendarAdapter,
    GoogleCalendarApiError,
} from './google-calendar.adapter';
import { montarEvento } from './event';
import { StatusAgendamento } from '@prisma/client';

const config = {
    enabled: true,
    calendarId: 'calendar-id',
    serviceAccount: {
        client_email: 'calendar@example.test',
        private_key: '-----BEGIN PRIVATE KEY-----',
    },
};
const evento = montarEvento({
    id: 'agendamento-1',
    dataHoraInicio: new Date('2026-10-27T13:00:00.000Z'),
    dataHoraFim: new Date('2026-10-27T13:30:00.000Z'),
    status: StatusAgendamento.AGENDADO,
    concluido: false,
    cliente: { nome: 'Maria', telefone: '5511999999999' },
    servico: { nome: 'Corte' },
});

function criarFetch(status = 200, body: unknown = { id: 'event-1' }) {
    return vi.fn<typeof fetch>().mockResolvedValue(
        new Response(status === 204 ? null : JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

describe('GoogleCalendarAdapter', () => {
    let obterAccessToken: () => Promise<string>;

    beforeEach(() => {
        obterAccessToken = vi.fn(async () => 'access-token');
    });

    it('insere evento com autenticação service account', async () => {
        const fetchImpl = criarFetch();
        const adapter = new GoogleCalendarAdapter(config, {
            fetchImpl,
            obterAccessToken,
        });

        await adapter.inserir(evento);

        expect(fetchImpl).toHaveBeenCalledWith(
            expect.stringContaining('/calendars/calendar-id/events'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer access-token',
                }),
                signal: expect.any(AbortSignal),
            }),
        );
    });

    it('reativa evento deletado com update confirmed após 409', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response(null, { status: 409 }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ id: evento.id }), {
                    status: 200,
                }),
            );
        const adapter = new GoogleCalendarAdapter(config, {
            fetchImpl,
            obterAccessToken,
        });

        await adapter.inserirOuReativar(evento);

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const [url, init] = fetchImpl.mock.calls[1];
        expect(url).toContain(`/events/${evento.id}`);
        expect(JSON.parse(String(init?.body))).toMatchObject({
            status: 'confirmed',
        });
    });

    it.each([404, 410])('trata delete HTTP %s como sucesso', async (status) => {
        const adapter = new GoogleCalendarAdapter(config, {
            fetchImpl: criarFetch(status),
            obterAccessToken,
        });

        await expect(adapter.excluir(evento.id)).resolves.toBeUndefined();
    });

    it.each([
        [429, true],
        [500, true],
        [400, false],
    ])(
        'classifica HTTP %s como transitório=%s',
        async (status, transitório) => {
            const adapter = new GoogleCalendarAdapter(config, {
                fetchImpl: criarFetch(status),
                obterAccessToken,
            });

            await expect(adapter.inserir(evento)).rejects.toMatchObject({
                statusCode: status,
                transitório,
            } satisfies Partial<GoogleCalendarApiError>);
        },
    );

    it('classifica falha de rede como transitória', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockRejectedValue(new TypeError('network failure'));
        const adapter = new GoogleCalendarAdapter(config, {
            fetchImpl,
            obterAccessToken,
        });

        await expect(adapter.inserir(evento)).rejects.toMatchObject({
            statusCode: 503,
            transitório: true,
        });
    });

    it('classifica resposta 401 ao obter token como permanente', async () => {
        const erro = Object.assign(new Error('credentials rejected'), {
            response: { status: 401 },
        });
        const adapter = new GoogleCalendarAdapter(config, {
            fetchImpl: criarFetch(),
            obterAccessToken: vi.fn().mockRejectedValue(erro),
        });

        await expect(adapter.inserir(evento)).rejects.toMatchObject({
            statusCode: 401,
            transitório: false,
        });
    });

    it('lista eventos por todas as páginas e filtra pela origem privada', async () => {
        const lápide = {
            id: 'deleted-event',
            status: 'cancelled',
            extendedProperties: {
                private: {
                    agendamentoId: 'agendamento-deleted',
                    origem: 'painel-barbearia',
                },
            },
        };
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        items: [{ id: 'event-1' }, lápide],
                        nextPageToken: 'next-page',
                    }),
                    { status: 200 },
                ),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ items: [{ id: 'event-2' }] }), {
                    status: 200,
                }),
            );
        const adapter = new GoogleCalendarAdapter(config, {
            fetchImpl,
            obterAccessToken,
        });

        const timeMin = new Date('2026-10-25T03:00:00.000Z');
        const eventos = await adapter.listarEventos(timeMin);

        expect(eventos).toHaveLength(3);
        expect(eventos).toContainEqual(lápide);

        const primeiraUrl = new URL(String(fetchImpl.mock.calls[0][0]));
        expect(primeiraUrl.searchParams.get('showDeleted')).toBe('false');
        expect(primeiraUrl.searchParams.get('singleEvents')).toBe('true');
        expect(primeiraUrl.searchParams.get('maxResults')).toBe('2500');
        expect(primeiraUrl.searchParams.get('timeMin')).toBe(
            timeMin.toISOString(),
        );
        expect(primeiraUrl.searchParams.get('privateExtendedProperty')).toBe(
            'origem=painel-barbearia',
        );

        const segundaUrl = new URL(String(fetchImpl.mock.calls[1][0]));
        expect(segundaUrl.searchParams.get('pageToken')).toBe('next-page');
        expect(segundaUrl.searchParams.get('showDeleted')).toBe('false');
    });
});
