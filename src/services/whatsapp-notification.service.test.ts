import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enviarNotificacaoWhatsApp } from './whatsapp-notification.service';

const API_KEY = 'ycloud-api-key-test';

beforeEach(() => {
    vi.stubEnv('YCLOUD_API_KEY', API_KEY);
    vi.stubEnv('YCLOUD_FROM_NUMBER', '+5511888888888');
    vi.stubEnv('SIMULACAO_WEBHOOK', '');
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({}),
        }),
    );
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('enviarNotificacaoWhatsApp', () => {
    it('renders the legacy rescheduling text exactly in Evolution mode', async () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'evolution');
        vi.stubEnv('EVOLUTION_API_KEY', 'evolution-test-key');
        vi.stubEnv('EVOLUTION_API_URL', 'https://evolution.example.test');
        vi.stubEnv('BARBER_PHONE', '5511222333444');

        const text = await enviarNotificacaoWhatsApp(
            'reagendamento',
            '5511999999999',
            {
                nomeCliente: 'Ana',
                novaData: '10/10/2026',
                novoHorario: '15:00',
                novoHorarioCompleto: 'sexta-feira, 10/10 às 15:00',
                servico: 'Corte',
                contatoBarbeiro: '5511222333444',
            },
        );

        expect(text).toBe(
            [
                'Olá Ana! Seu agendamento foi remarcado pelo barbeiro.',
                'Nova data: 10/10/2026',
                'Novo horário: 15:00 (horário de Brasília)',
                'Serviço: Corte',
                'Dúvidas? Entre em contato com o barbeiro: 5511222333444',
            ].join('\n'),
        );
        expect(fetch).toHaveBeenCalledWith(
            'https://evolution.example.test/message/sendText/barbearia',
            expect.objectContaining({
                body: JSON.stringify({
                    number: '5511999999999',
                    text,
                }),
            }),
        );
    });

    it('sends YCloud notification template with sanitized ordered parameters', async () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');

        await enviarNotificacaoWhatsApp(
            'reagendamento',
            '5511999999999',
            {
                nomeCliente: '  Ana\t Silva\n',
                novaData: '10/10/2026',
                novoHorario: '15:00',
                novoHorarioCompleto: 'sexta-feira, 10/10 às 15:00',
                servico: 'Corte',
                contatoBarbeiro: '5511222333444',
            },
        );

        const [, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(JSON.parse(String(init?.body))).toMatchObject({
            type: 'template',
            template: {
                name: 'aviso_reagendamento',
                language: { code: 'pt_BR' },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: 'Ana Silva' },
                            {
                                type: 'text',
                                text: 'sexta-feira, 10/10 às 15:00',
                            },
                            { type: 'text', text: 'Corte' },
                            { type: 'text', text: '5511222333444' },
                        ],
                    },
                ],
            },
        });
    });

    it('uses cancellation template with name, date/time, service and barber contact', async () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');

        await enviarNotificacaoWhatsApp('cancelamento', '5511999999999', {
            nomeCliente: 'Ana',
            data: '10/10/2026',
            horario: '15:00',
            dataHoraCompleta: '10/10 às 15:00',
            servico: 'Corte',
            contatoBarbeiro: '5511222333444',
        });

        const [, init] = vi.mocked(fetch).mock.calls[0]!;
        const body = JSON.parse(String(init?.body));
        expect(body.template.name).toBe('aviso_cancelamento');
        expect(body.template.components[0].parameters).toEqual([
            { type: 'text', text: 'Ana' },
            { type: 'text', text: '10/10 às 15:00' },
            { type: 'text', text: 'Corte' },
            { type: 'text', text: '5511222333444' },
        ]);
    });

    it('does not call YCloud for template notification in simulation mode', async () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');
        vi.stubEnv('SIMULACAO_WEBHOOK', 'true');
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});

        await enviarNotificacaoWhatsApp(
            'atendimento_humano',
            '5511222333444',
            {
                telefoneCliente: '5511999999999',
                motivo: 'PRIVATE MESSAGE',
            },
        );

        expect(fetch).not.toHaveBeenCalled();
        expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE MESSAGE');
        expect(JSON.stringify(log.mock.calls)).not.toContain('5511999999999');
        log.mockRestore();
    });

    it('substitutes empty values and limits sanitized template parameters to 200 chars', async () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');
        await enviarNotificacaoWhatsApp('atendimento_humano', '5511222333444', {
            telefoneCliente: '',
            motivo: `  ${'x'.repeat(220)}  `,
        });

        const [, init] = vi.mocked(fetch).mock.calls[0]!;
        const body = JSON.parse(String(init?.body));
        expect(body.template.name).toBe('aviso_atendimento_humano');
        expect(body.template.components[0].parameters).toEqual([
            { type: 'text', text: 'não informado' },
            { type: 'text', text: 'x'.repeat(200) },
        ]);
    });

    it('does not block a notification caller when YCloud fails', async () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            status: 503,
            json: vi.fn().mockResolvedValue({ message: 'unavailable' }),
        } as unknown as Response);

        await expect(
            enviarNotificacaoWhatsApp('cancelamento', '5511999999999', {
                nomeCliente: 'Ana',
                data: '10/10/2026',
                horario: '15:00',
                dataHoraCompleta: '10/10 às 15:00',
                servico: 'Corte',
                contatoBarbeiro: 'barbeiro',
            }),
        ).rejects.toThrow('HTTP 503');
    });
});
