export interface SlotLote {
    data: string;
    horario: string;
}

interface ExpandirRecorrenciaParams {
    dataInicial: string;
    diasSelecionados: Set<number>;
    horarioPorDia: Record<number, string>;
    criterioParada: 'data' | 'ocorrencias';
    dataFinal: string;
    numeroOcorrencias: number;
}

const MAX_DIAS_VARREDURA = 365;

function proximaData(dataKey: string, dias: number): string {
    const [year, month, day] = dataKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + dias));
    return date.toISOString().slice(0, 10);
}

function diaDaSemana(dataKey: string): number {
    const [year, month, day] = dataKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function expandirRecorrencia({
    dataInicial,
    diasSelecionados,
    horarioPorDia,
    criterioParada,
    dataFinal,
    numeroOcorrencias,
}: ExpandirRecorrenciaParams): SlotLote[] {
    const slots: SlotLote[] = [];
    let dataAtual = dataInicial;

    for (let i = 0; i < MAX_DIAS_VARREDURA; i += 1) {
        const dia = diaDaSemana(dataAtual);

        if (diasSelecionados.has(dia) && horarioPorDia[dia]) {
            slots.push({ data: dataAtual, horario: horarioPorDia[dia] });

            if (
                criterioParada === 'ocorrencias' &&
                slots.length >= numeroOcorrencias
            ) {
                break;
            }
        }

        dataAtual = proximaData(dataAtual, 1);

        if (criterioParada === 'data' && dataAtual > dataFinal) {
            break;
        }
    }

    return slots;
}