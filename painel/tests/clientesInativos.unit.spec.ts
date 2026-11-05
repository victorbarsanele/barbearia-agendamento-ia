import { expect, test } from '@playwright/test';
import type { ItemClienteInativo } from '../src/services/relatorios.service.js';
import { derivarEstadoReativacao } from '../src/utils/clientesInativos.js';

const clienteBase: ItemClienteInativo = {
    clienteId: 'cliente-1',
    nome: 'Ana Silva',
    telefone: '5511999999999',
    ultimaVisita: '2026-01-01',
    diasSemVir: 60,
    ultimoServico: 'Corte',
    totalVisitas: 4,
    pacoteAtivoComSaldo: false,
    ultimaTentativa: null,
    podeReativar: true,
    reativacaoBloqueio: null,
    reativacaoBloqueadaAte: null,
};

test.describe('derivarEstadoReativacao', () => {
    test('prioriza OPT_OUT mesmo com data de cooldown', () => {
        expect(
            derivarEstadoReativacao({
                ...clienteBase,
                reativacaoBloqueio: 'OPT_OUT',
                reativacaoBloqueadaAte: '2026-04-10T02:00:00.000Z',
            }),
        ).toEqual({
            tipo: 'OPT_OUT',
            mensagem: 'Pediu para não receber',
            botaoTexto: null,
            envioDesabilitado: true,
            whatsappDesabilitado: true,
            statusSecundario: null,
        });
    });

    test('prioriza cooldown sobre última falha e mantém WhatsApp manual', () => {
        expect(
            derivarEstadoReativacao({
                ...clienteBase,
                ultimaTentativa: {
                    status: 'FALHOU',
                    criadoEm: '2026-03-01T14:00:00.000Z',
                },
                reativacaoBloqueio: 'COOLDOWN',
                reativacaoBloqueadaAte: '2026-03-17T02:00:00.000Z',
                podeReativar: false,
            }),
        ).toMatchObject({
            tipo: 'COOLDOWN',
            mensagem: 'Reativação em espera até 16/03',
            envioDesabilitado: true,
            whatsappDesabilitado: false,
        });
    });

    test('permite reenviar falha fora do cooldown com data local brasileira', () => {
        expect(
            derivarEstadoReativacao({
                ...clienteBase,
                ultimaTentativa: {
                    status: 'FALHOU',
                    criadoEm: '2026-03-17T02:00:00.000Z',
                },
            }),
        ).toMatchObject({
            tipo: 'FALHOU',
            mensagem: 'Último envio falhou em 16/03',
            botaoTexto: 'Reenviar',
            envioDesabilitado: false,
        });
    });

    test('sem tentativa mostra envio inicial', () => {
        expect(derivarEstadoReativacao(clienteBase)).toMatchObject({
            tipo: 'DISPONIVEL',
            botaoTexto: 'Enviar reativação',
            envioDesabilitado: false,
        });
    });

    test('mostra status de tentativa não falha durante cooldown', () => {
        for (const [status, label] of [
            ['PENDENTE', 'Enviando'],
            ['ACEITA', 'Enviada'],
            ['ENTREGUE', 'Entregue'],
        ] as const) {
            expect(
                derivarEstadoReativacao({
                    ...clienteBase,
                    ultimaTentativa: {
                        status,
                        criadoEm: '2026-03-01T14:00:00.000Z',
                    },
                    reativacaoBloqueio: 'COOLDOWN',
                    reativacaoBloqueadaAte: '2026-03-17T02:00:00.000Z',
                    podeReativar: false,
                }).statusSecundario,
            ).toBe(label);
        }
    });
});
