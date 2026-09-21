export interface SlotLote {
    data: string;
    horario: string;
}

export interface ExpandirRecorrenciaParams {
    dataInicial: string;
    diasSelecionados: Set<number>;
    horarioPorDia: Record<number, string>;
    criterioParada: 'data' | 'ocorrencias';
    dataFinal: string;
    numeroOcorrencias: number;
    intervaloSemanas?: number;
}

export type RecorrenciaErroCodigo =
    | 'INTERVALO_INVALIDO'
    | 'DATA_FINAL_ANTERIOR';

export interface RecorrenciaErro {
    codigo: RecorrenciaErroCodigo;
    mensagem: string;
}

const MAX_DIAS_ABSOLUTO = 730;

function proximaData(dataKey: string, dias: number): string {
    const [year, month, day] = dataKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + dias));
    return date.toISOString().slice(0, 10);
}

function diaDaSemana(dataKey: string): number {
    const [year, month, day] = dataKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function inicioDaSemana(dataKey: string): string {
    const dia = diaDaSemana(dataKey);
    const diasDesdeSegunda = dia === 0 ? 6 : dia - 1;
    return proximaData(dataKey, -diasDesdeSegunda);
}

function diferencaEmDias(dataInicial: string, dataAtual: string): number {
    const inicio = new Date(`${dataInicial}T00:00:00Z`).getTime();
    const atual = new Date(`${dataAtual}T00:00:00Z`).getTime();
    return Math.round((atual - inicio) / (24 * 60 * 60 * 1000));
}

function indiceDaSemana(dataInicial: string, dataAtual: string): number {
    return Math.floor(
        diferencaEmDias(
            inicioDaSemana(dataInicial),
            inicioDaSemana(dataAtual),
        ) / 7,
    );
}

export function validarRecorrencia({
    criterioParada,
    dataInicial,
    dataFinal,
    intervaloSemanas = 1,
}: Pick<
    ExpandirRecorrenciaParams,
    'criterioParada' | 'dataInicial' | 'dataFinal' | 'intervaloSemanas'
>): RecorrenciaErro | null {
    if (
        !Number.isInteger(intervaloSemanas) ||
        intervaloSemanas < 1 ||
        intervaloSemanas > 52
    ) {
        return {
            codigo: 'INTERVALO_INVALIDO',
            mensagem:
                'O intervalo deve ser um número inteiro entre 1 e 52 semanas.',
        };
    }

    if (criterioParada === 'data' && dataFinal < dataInicial) {
        return {
            codigo: 'DATA_FINAL_ANTERIOR',
            mensagem: 'A data final não pode ser anterior à data inicial.',
        };
    }

    return null;
}

export interface ResultadoExpansaoRecorrencia {
    slots: SlotLote[];
    truncadoPorLimite: boolean;
    solicitadas?: number;
}

export function expandirRecorrencia({
    dataInicial,
    diasSelecionados,
    horarioPorDia,
    criterioParada,
    dataFinal,
    numeroOcorrencias,
    intervaloSemanas = 1,
}: ExpandirRecorrenciaParams): ResultadoExpansaoRecorrencia {
    const slots: SlotLote[] = [];
    const horizonteDinamico =
        criterioParada === 'ocorrencias'
            ? numeroOcorrencias * intervaloSemanas * 7 + 7
            : Math.max(0, diferencaEmDias(dataInicial, dataFinal));
    const limiteDias = Math.min(horizonteDinamico, MAX_DIAS_ABSOLUTO);
    const limiteAbsoluto = proximaData(dataInicial, MAX_DIAS_ABSOLUTO);
    let dataAtual = dataInicial;

    for (
        let diasPercorridos = 0;
        diasPercorridos <= limiteDias;
        diasPercorridos += 1
    ) {
        const dia = diaDaSemana(dataAtual);
        const semana = indiceDaSemana(dataInicial, dataAtual);
        const estaNaSemanaSelecionada = semana % intervaloSemanas === 0;

        if (
            estaNaSemanaSelecionada &&
            diasSelecionados.has(dia) &&
            horarioPorDia[dia]
        ) {
            slots.push({ data: dataAtual, horario: horarioPorDia[dia] });

            if (
                criterioParada === 'ocorrencias' &&
                slots.length >= numeroOcorrencias
            ) {
                return {
                    slots,
                    truncadoPorLimite: false,
                    solicitadas: numeroOcorrencias,
                };
            }
        }

        if (criterioParada === 'data' && dataAtual >= dataFinal) {
            return { slots, truncadoPorLimite: false };
        }

        dataAtual = proximaData(dataAtual, 1);
    }

    const truncadoPorLimite =
        limiteDias === MAX_DIAS_ABSOLUTO &&
        ((criterioParada === 'ocorrencias' &&
            slots.length < numeroOcorrencias) ||
            (criterioParada === 'data' && dataFinal > limiteAbsoluto));

    return {
        slots,
        truncadoPorLimite,
        ...(criterioParada === 'ocorrencias'
            ? { solicitadas: numeroOcorrencias }
            : {}),
    };
}
