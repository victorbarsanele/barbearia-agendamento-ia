type StatusAgendamento =
    | 'AGENDADO'
    | 'CONFIRMADO'
    | 'CANCELADO'
    | 'CONCLUIDO';

export function podeCancelarAgendamento(
    status: StatusAgendamento,
    concluido: boolean,
): boolean {
    return status !== 'CANCELADO' && status !== 'CONCLUIDO' && !concluido;
}