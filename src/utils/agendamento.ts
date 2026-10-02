import { StatusAgendamento } from '@prisma/client';

export function isAgendamentoConcluido(agendamento: {
    status: StatusAgendamento;
    concluido: boolean;
}): boolean {
    return (
        agendamento.concluido ||
        agendamento.status === StatusAgendamento.CONCLUIDO
    );
}