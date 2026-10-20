import { expect, test } from '@playwright/test';
import {
    ApiError,
    criarAgendamento,
    type CriarAgendamentoBasePayload,
} from '../src/services/agendamentos.service.js';
import type { Pacote } from '../src/services/pacotes.service.js';
import type { Servico } from '../src/services/servicos.service.js';
import {
    filtrarServicosPorPacoteCatalogo,
    calcularLimiteSlotsPacoteCatalogo,
    formatarLinhaPrecoPacote,
    montarPayloadAgendamento,
    montarPayloadLote,
    resolverServicoAposTrocaCliente,
    resolverServicoAposTrocaPacote,
    traduzirMotivoConflitoLote,
} from '../src/utils/pacoteCatalogo.js';
import { obterMotivosOverride } from '../src/utils/overrideExpediente.js';

const servicos: Servico[] = [
    {
        id: 'corte',
        nome: 'Corte',
        duracaoMinutos: 30,
        preco: '50.00',
        permiteExtensaoFechamento: false,
    },
    {
        id: 'barba',
        nome: 'Barba',
        duracaoMinutos: 20,
        preco: '35.00',
        permiteExtensaoFechamento: false,
    },
];

const pacote: Pacote = {
    id: 'pacote-1',
    nome: 'Pacote mensal',
    duracaoDias: 30,
    preco: '120.00',
    liberadoParaGemini: false,
    createdAt: '2026-10-01T12:00:00.000Z',
    servicos: [
        {
            pacoteId: 'pacote-1',
            servicoId: 'corte',
            quantidadeTotal: 4,
            servico: servicos[0],
        },
    ],
};

const base: CriarAgendamentoBasePayload = {
    clienteId: 'cliente-1',
    servicoId: 'corte',
    dataHoraInicio: '2026-10-20T10:00:00-03:00',
};

test('filtra serviços pelo pacote e mantém lista completa sem pacote', () => {
    expect(filtrarServicosPorPacoteCatalogo(servicos, pacote)).toEqual([
        servicos[0],
    ]);
    expect(filtrarServicosPorPacoteCatalogo(servicos, null)).toEqual(servicos);
});

test('preserva serviço compatível e limpa serviço incompatível ou cliente trocado', () => {
    expect(resolverServicoAposTrocaPacote('corte', [servicos[0]])).toBe(
        'corte',
    );
    expect(resolverServicoAposTrocaPacote('barba', [servicos[0]])).toBe('');
    expect(resolverServicoAposTrocaCliente()).toBe('');
});

test('monta payload sem misturar pacote de catálogo e pacote ativo', () => {
    const catalogo = montarPayloadAgendamento(base, {
        tipo: 'catalogo',
        pacoteId: 'pacote-1',
    });
    const ativo = montarPayloadAgendamento(base, {
        tipo: 'ativo',
        pacoteClienteId: 'pacote-cliente-1',
    });
    const nenhum = montarPayloadAgendamento(base, { tipo: 'nenhum' });

    expect(catalogo).toMatchObject({ pacoteId: 'pacote-1' });
    expect(catalogo).not.toHaveProperty('pacoteClienteId');
    expect(ativo).toMatchObject({ pacoteClienteId: 'pacote-cliente-1' });
    expect(ativo).not.toHaveProperty('pacoteId');
    expect(nenhum).not.toHaveProperty('pacoteId');
    expect(nenhum).not.toHaveProperty('pacoteClienteId');
});

test('formata preço do pacote como valor cobrado à parte', () => {
    expect(formatarLinhaPrecoPacote(pacote.preco)).toBe(
        'R$\u00a0120,00 · cobrado à parte',
    );
});

test('monta payload de lote sem misturar vínculos de pacote', () => {
    const loteBase = {
        clienteId: 'cliente-1',
        servicoId: 'corte',
        slots: [{ data: '2026-10-20', horario: '10:00' }],
    };
    const catalogo = montarPayloadLote(loteBase, {
        tipo: 'catalogo',
        pacoteId: 'pacote-1',
    });
    const ativo = montarPayloadLote(loteBase, {
        tipo: 'ativo',
        pacoteClienteId: 'pacote-cliente-1',
    });
    const nenhum = montarPayloadLote(loteBase, { tipo: 'nenhum' });

    expect(catalogo).toHaveProperty('pacoteId', 'pacote-1');
    expect(catalogo).not.toHaveProperty('pacoteClienteId');
    expect(ativo).toHaveProperty('pacoteClienteId', 'pacote-cliente-1');
    expect(ativo).not.toHaveProperty('pacoteId');
    expect(nenhum).not.toHaveProperty('pacoteId');
    expect(nenhum).not.toHaveProperty('pacoteClienteId');
});

test('limita slots a 20 ou quantidade do serviço', () => {
    expect(calcularLimiteSlotsPacoteCatalogo(4)).toBe(4);
    expect(calcularLimiteSlotsPacoteCatalogo(30)).toBe(20);
    expect(calcularLimiteSlotsPacoteCatalogo(undefined)).toBe(0);
});

test('traduz motivos do lote atômico', () => {
    expect(traduzirMotivoConflitoLote('capacidade_pacote')).toContain(
        'capacidade restante',
    );
    expect(traduzirMotivoConflitoLote('bloqueio')).toContain('bloqueado');
});

test('criarAgendamento lança ApiError com status e mensagem HTTP intacta', async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () =>
        new Response(
            JSON.stringify({
                message: 'Conflito de pacote ativo.',
                slot: { data: '2026-10-20', horario: '10:00' },
                motivo: 'capacidade_pacote',
            }),
            {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            },
        );

    try {
        await expect(criarAgendamento(base)).rejects.toMatchObject({
            name: 'ApiError',
            message: 'Conflito de pacote ativo.',
            status: 409,
            body: {
                slot: { data: '2026-10-20', horario: '10:00' },
                motivo: 'capacidade_pacote',
            },
        });
        expect(new ApiError('Mensagem existente', 404).message).toBe(
            'Mensagem existente',
        );
    } finally {
        globalThis.fetch = fetchOriginal;
    }
});

test('lê erro estruturado da raiz e traduz motivos de expediente', async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () =>
        new Response(
            JSON.stringify({
                message: 'Horário fora do expediente.',
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['fora_funcionamento', 'almoco'],
            }),
            {
                status: 422,
                headers: { 'Content-Type': 'application/json' },
            },
        );

    try {
        let erro: unknown;
        try {
            await criarAgendamento(base);
        } catch (error) {
            erro = error;
        }

        expect(erro).toBeInstanceOf(ApiError);
        expect(obterMotivosOverride(erro)).toEqual([
            'Fora do horário de funcionamento',
            'Horário de almoço',
        ]);
    } finally {
        globalThis.fetch = fetchOriginal;
    }
});

test('motivo desconhecido usa mensagem legada; erro duro não abre override', () => {
    expect(
        obterMotivosOverride(
            new ApiError('Mensagem legada', 422, {
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['futuro_motivo'],
            }),
        ),
    ).toEqual(['Mensagem legada']);
    expect(
        obterMotivosOverride(
            new ApiError('Já existe um agendamento nesse horário.', 409, {
                code: 'CONFLITO_HORARIO',
            }),
        ),
    ).toBeNull();
});
