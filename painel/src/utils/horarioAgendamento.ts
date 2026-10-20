export interface PartesHorarioAgendamento {
    data: string;
    hora: string;
    minuto: string;
}

export function horarioAgendamentoAlterado(
    original: PartesHorarioAgendamento,
    selecionado: PartesHorarioAgendamento,
): boolean {
    return (
        original.data !== selecionado.data ||
        original.hora !== selecionado.hora ||
        original.minuto !== selecionado.minuto
    );
}

export function montarDataHoraInicioParaSalvar(
    dataHoraInicioOriginal: string,
    partesOriginais: PartesHorarioAgendamento,
    partesSelecionadas: PartesHorarioAgendamento,
): string {
    if (!horarioAgendamentoAlterado(partesOriginais, partesSelecionadas)) {
        return dataHoraInicioOriginal;
    }

    return `${partesSelecionadas.data}T${partesSelecionadas.hora}:${partesSelecionadas.minuto}:00-03:00`;
}
