type StatusAgendamento = 'AGENDADO' | 'CONFIRMADO' | 'CANCELADO' | 'CONCLUIDO';

export function podeCancelarAgendamento(
    status: StatusAgendamento,
    concluido: boolean,
    estornavel = false,
): boolean {
    if (status === 'CANCELADO') {
        return false;
    }

    return estornavel || (status !== 'CONCLUIDO' && !concluido);
}
