import { chaveDataEmBrasilia, somarDiasAChaveData } from './dia-semana';

export function obterRenovadoEm(
    renovadoDeId: string | null,
    dataInicio: Date | string,
): string | null {
    if (renovadoDeId === null) return null;

    if (typeof dataInicio === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) {
            return somarDiasAChaveData(dataInicio, 0);
        }

        const instante = new Date(dataInicio);
        if (Number.isNaN(instante.getTime())) {
            throw new RangeError('Data de início inválida.');
        }
        return chaveDataEmBrasilia(instante);
    }

    if (Number.isNaN(dataInicio.getTime())) {
        throw new RangeError('Data de início inválida.');
    }
    return chaveDataEmBrasilia(dataInicio);
}
