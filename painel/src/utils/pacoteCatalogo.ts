import type {
    CriarAgendamentoBasePayload,
    CriarAgendamentoPayload,
    SimularLoteBasePayload,
    SimularLotePayload,
} from '../services/agendamentos.service.js';
import type { Pacote } from '../services/pacotes.service.js';
import type { Servico } from '../services/servicos.service.js';

export type VinculoPacoteAgendamento =
    | { tipo: 'catalogo'; pacoteId: string }
    | { tipo: 'ativo'; pacoteClienteId: string }
    | { tipo: 'nenhum' };

export type VinculoPacoteLote =
    | { tipo: 'catalogo'; pacoteId: string }
    | { tipo: 'ativo'; pacoteClienteId: string }
    | { tipo: 'nenhum' };

export function filtrarServicosPorPacoteCatalogo(
    servicos: Servico[],
    pacote: Pacote | null,
): Servico[] {
    if (!pacote) {
        return servicos;
    }

    const servicoIds = new Set(pacote.servicos.map((item) => item.servicoId));
    return servicos.filter((servico) => servicoIds.has(servico.id));
}

export function resolverServicoAposTrocaPacote(
    servicoId: string,
    servicosDisponiveis: Servico[],
): string {
    return servicosDisponiveis.some((servico) => servico.id === servicoId)
        ? servicoId
        : '';
}

export function resolverServicoAposTrocaCliente(): string {
    return '';
}

export function montarPayloadAgendamento(
    base: CriarAgendamentoBasePayload,
    vinculo: VinculoPacoteAgendamento,
): CriarAgendamentoPayload {
    switch (vinculo.tipo) {
        case 'catalogo':
            return { ...base, pacoteId: vinculo.pacoteId };
        case 'ativo':
            return { ...base, pacoteClienteId: vinculo.pacoteClienteId };
        default:
            return { ...base };
    }
}

export function formatarPreco(valor: string | number | null): string {
    if (valor === null) {
        return 'Consultar';
    }

    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
        return 'Consultar';
    }

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(numero);
}

export function formatarLinhaPrecoPacote(preco: string | number): string {
    return `${formatarPreco(preco)} · cobrado à parte`;
}

export function calcularLimiteSlotsPacoteCatalogo(
    quantidadeTotal: number | null | undefined,
): number {
    if (
        typeof quantidadeTotal !== 'number' ||
        !Number.isFinite(quantidadeTotal)
    ) {
        return 0;
    }

    return Math.min(20, Math.max(0, Math.floor(quantidadeTotal)));
}

export function montarPayloadLote(
    base: SimularLoteBasePayload,
    vinculo: VinculoPacoteLote,
): SimularLotePayload {
    switch (vinculo.tipo) {
        case 'catalogo':
            return { ...base, pacoteId: vinculo.pacoteId };
        case 'ativo':
            return { ...base, pacoteClienteId: vinculo.pacoteClienteId };
        default:
            return { ...base };
    }
}

export function traduzirMotivoConflitoLote(motivo: string): string {
    switch (motivo) {
        case 'conflito_horario':
            return 'Este horário já está ocupado.';
        case 'fora_funcionamento':
            return 'Este horário está fora do funcionamento da barbearia.';
        case 'bloqueio':
            return 'Este horário está bloqueado pelo barbeiro.';
        case 'capacidade_pacote':
            return 'O pacote não tem capacidade restante para este horário.';
        default:
            return 'Não foi possível reservar este horário.';
    }
}
