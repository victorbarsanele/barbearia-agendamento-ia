export const ESCALATION_MOTIVOS = [
    'palavra_chave',
    'confusao_explicita',
    'sem_progresso',
    'limite_de_cota',
    'agendamento_recorrente',
    'interesse_pacote',
] as const;

export type EscalationMotivo = (typeof ESCALATION_MOTIVOS)[number];

const DESCRICOES_MOTIVO_ESCALONAMENTO: Record<EscalationMotivo, string> = {
    palavra_chave: 'pedido de atendimento humano',
    confusao_explicita: 'cliente demonstrou confusão',
    sem_progresso: 'conversa sem progresso',
    limite_de_cota: 'sistema atingiu limite de uso da API',
    agendamento_recorrente: 'cliente quer pacote de cortes recorrentes',
    interesse_pacote: 'cliente interessado em pacote de serviços',
};

export function descreverMotivoEscalonamento(motivo: EscalationMotivo): string {
    return DESCRICOES_MOTIVO_ESCALONAMENTO[motivo];
}
