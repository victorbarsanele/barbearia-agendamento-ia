import type { StatusAgendamento, StatusPacoteCliente } from '@prisma/client';

export interface SnapshotAutoConclusao {
    id: string;
    pacoteClienteId: string | null;
    servicoId: string;
    status: StatusAgendamento;
    concluido: boolean;
    dataHoraInicio: Date;
    dataHoraFim: Date;
    statusPacoteCliente?: StatusPacoteCliente | null;
}

export type AlteracaoAutoConclusao =
    | { tipo: 'agendamento'; agendamento: SnapshotAutoConclusao }
    | { tipo: 'agendamento-removido'; agendamentoId: string }
    | {
          tipo: 'pacote-cliente';
          pacoteClienteId: string;
          status: StatusPacoteCliente;
      };

const observadores = new Set<(alteracao: AlteracaoAutoConclusao) => void>();

export function observarAutoConclusao(
    observador: (alteracao: AlteracaoAutoConclusao) => void,
): () => void {
    observadores.add(observador);
    return () => observadores.delete(observador);
}

export function notificarAutoConclusao(
    alteracao: AlteracaoAutoConclusao,
): void {
    for (const observador of observadores) observador(alteracao);
}
