import { ApiError } from '../services/agendamentos.service.js';

const ROTULOS_MOTIVOS: Record<string, string> = {
    fora_funcionamento: 'Fora do horário de funcionamento',
    dia_fechado: 'Dia fechado',
    almoco: 'Horário de almoço',
    bloqueio_total: 'Horário bloqueado na agenda',
};

export function obterMotivosOverride(error: unknown): string[] | null {
    if (
        !(error instanceof ApiError) ||
        error.body?.code !== 'FORA_DO_EXPEDIENTE'
    ) {
        return null;
    }

    const motivos = error.body.motivos;
    if (
        !Array.isArray(motivos) ||
        motivos.length === 0 ||
        !motivos.every((motivo) => typeof motivo === 'string')
    ) {
        return [error.message];
    }

    const rotulos = motivos.map((motivo) => ROTULOS_MOTIVOS[motivo]);
    return rotulos.some((rotulo) => !rotulo) ? [error.message] : rotulos;
}
