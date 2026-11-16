import { expect, test } from '@playwright/test';
import {
    ApiError,
    type CriarAgendamentoPayload,
} from '../src/services/agendamentos.service.js';
import {
    acumularPermissaoOverride,
    classificarErroOverride,
    montarPayloadReenvio,
    permissaoOverrideJaConcedida,
    type PermissoesOverrideAgendamento,
} from '../src/utils/overrideAgendamento.js';

const SEM_PERMISSOES: PermissoesOverrideAgendamento = {
    permitirForaDoExpediente: false,
    permitirEncaixe: false,
};

test('classifica expediente pelo código em 409 e 422', () => {
    for (const status of [409, 422]) {
        expect(
            classificarErroOverride(
                new ApiError('Fora do expediente.', status, {
                    code: 'FORA_DO_EXPEDIENTE',
                    motivos: ['dia_fechado'],
                }),
            ),
        ).toEqual({
            tipo: 'FORA_DO_EXPEDIENTE',
            motivos: ['Dia fechado'],
        });
    }
});

test('classifica conflito e limite independentemente do texto', () => {
    expect(
        classificarErroOverride(
            new ApiError('Mensagem do servidor.', 409, {
                code: 'CONFLITO_HORARIO',
            }),
        ),
    ).toEqual({ tipo: 'CONFLITO_HORARIO' });
    expect(
        classificarErroOverride(
            new ApiError('Mensagem do servidor.', 409, {
                code: 'LIMITE_ENCAIXE',
            }),
        ),
    ).toEqual({ tipo: 'LIMITE_ENCAIXE' });
});

test('não classifica códigos de pacote nem erros sem ApiError', () => {
    expect(
        classificarErroOverride(
            new ApiError('Pacote arquivado.', 409, {
                code: 'PACOTE_ARQUIVADO',
            }),
        ),
    ).toBeNull();
    expect(classificarErroOverride(new Error('Erro genérico.'))).toBeNull();
});

test('acumula permissões em ambas as ordens sem mutar o estado anterior', () => {
    const expedienteDepoisEncaixe = acumularPermissaoOverride(
        acumularPermissaoOverride(SEM_PERMISSOES, 'FORA_DO_EXPEDIENTE'),
        'CONFLITO_HORARIO',
    );
    const encaixeDepoisExpediente = acumularPermissaoOverride(
        acumularPermissaoOverride(SEM_PERMISSOES, 'CONFLITO_HORARIO'),
        'FORA_DO_EXPEDIENTE',
    );

    expect(expedienteDepoisEncaixe).toEqual({
        permitirForaDoExpediente: true,
        permitirEncaixe: true,
    });
    expect(encaixeDepoisExpediente).toEqual(expedienteDepoisEncaixe);
    expect(SEM_PERMISSOES).toEqual({
        permitirForaDoExpediente: false,
        permitirEncaixe: false,
    });
    expect(
        permissaoOverrideJaConcedida(
            expedienteDepoisEncaixe,
            'FORA_DO_EXPEDIENTE',
        ),
    ).toBe(true);
    expect(
        permissaoOverrideJaConcedida(
            expedienteDepoisEncaixe,
            'CONFLITO_HORARIO',
        ),
    ).toBe(true);
});

test('payload mantém pacote e retroativo e omite permissões não concedidas', () => {
    const payload: CriarAgendamentoPayload = {
        clienteId: 'cliente-1',
        servicoId: 'servico-1',
        dataHoraInicio: '2026-11-20T10:00:00-03:00',
        registroRetroativo: true,
        pacoteId: 'pacote-1',
        permitirEncaixe: false,
        permitirForaDoExpediente: false,
    };

    expect(
        montarPayloadReenvio(payload, {
            permitirForaDoExpediente: true,
            permitirEncaixe: false,
        }),
    ).toEqual({
        clienteId: 'cliente-1',
        servicoId: 'servico-1',
        dataHoraInicio: '2026-11-20T10:00:00-03:00',
        registroRetroativo: true,
        pacoteId: 'pacote-1',
        permitirForaDoExpediente: true,
    });
});
