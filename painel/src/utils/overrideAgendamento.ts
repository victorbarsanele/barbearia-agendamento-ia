import {
    ApiError,
    type AtualizarAgendamentoPayload,
    type CriarAgendamentoPayload,
} from '../services/agendamentos.service.js';
import { obterMotivosOverride } from './overrideExpediente.js';

export type TipoErroOverride =
    | 'FORA_DO_EXPEDIENTE'
    | 'CONFLITO_HORARIO'
    | 'LIMITE_ENCAIXE';

export type ErroOverrideAgendamento =
    | { tipo: 'FORA_DO_EXPEDIENTE'; motivos: string[] }
    | { tipo: 'CONFLITO_HORARIO' }
    | { tipo: 'LIMITE_ENCAIXE' };

export interface PermissoesOverrideAgendamento {
    permitirForaDoExpediente: boolean;
    permitirEncaixe: boolean;
}

export const PERMISSOES_OVERRIDE_VAZIAS: PermissoesOverrideAgendamento = {
    permitirForaDoExpediente: false,
    permitirEncaixe: false,
};

export const MENSAGEM_LIMITE_ENCAIXE =
    'Já existem dois agendamentos nesse horário. Escolha outro horário.';

export type PayloadOverrideAgendamento =
    | CriarAgendamentoPayload
    | AtualizarAgendamentoPayload;

export function classificarErroOverride(
    error: unknown,
): ErroOverrideAgendamento | null {
    if (!(error instanceof ApiError)) {
        return null;
    }

    switch (error.body?.code) {
        case 'FORA_DO_EXPEDIENTE':
            return {
                tipo: 'FORA_DO_EXPEDIENTE',
                motivos: obterMotivosOverride(error) ?? [error.message],
            };
        case 'CONFLITO_HORARIO':
            return { tipo: 'CONFLITO_HORARIO' };
        case 'LIMITE_ENCAIXE':
            return { tipo: 'LIMITE_ENCAIXE' };
        default:
            return null;
    }
}

export function acumularPermissaoOverride(
    permissoes: PermissoesOverrideAgendamento,
    tipo: Exclude<TipoErroOverride, 'LIMITE_ENCAIXE'>,
): PermissoesOverrideAgendamento {
    if (tipo === 'FORA_DO_EXPEDIENTE') {
        return { ...permissoes, permitirForaDoExpediente: true };
    }

    return { ...permissoes, permitirEncaixe: true };
}

export function permissaoOverrideJaConcedida(
    permissoes: PermissoesOverrideAgendamento,
    tipo: Exclude<TipoErroOverride, 'LIMITE_ENCAIXE'>,
): boolean {
    return tipo === 'FORA_DO_EXPEDIENTE'
        ? permissoes.permitirForaDoExpediente
        : permissoes.permitirEncaixe;
}

export function montarPayloadReenvio<T extends PayloadOverrideAgendamento>(
    payload: T,
    permissoes: PermissoesOverrideAgendamento,
): T {
    const reenvio = { ...payload };
    delete reenvio.permitirForaDoExpediente;
    delete reenvio.permitirEncaixe;

    if (permissoes.permitirForaDoExpediente) {
        reenvio.permitirForaDoExpediente = true;
    }
    if (permissoes.permitirEncaixe) {
        reenvio.permitirEncaixe = true;
    }

    return reenvio;
}
