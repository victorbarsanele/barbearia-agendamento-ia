import { AppError } from '../lib/app-error';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import {
    estaDentroDoHorarioDeFuncionamento,
    HORA_ABERTURA,
    HORA_FECHAMENTO,
} from './horario-funcionamento';

interface CriarBloqueioData {
    dataHoraInicio: string;
    dataHoraFim: string;
    motivo: string;
}

function converterParaData(valor: string, campo: string): Date {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(valor)) {
        throw new AppError(`${campo} deve incluir timezone explícito.`, 400);
    }

    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) {
        throw new AppError(`${campo} inválida.`, 400);
    }

    return data;
}

export async function criar(data: CriarBloqueioData) {
    const dataHoraInicio = converterParaData(
        data.dataHoraInicio,
        'Data/hora de início',
    );
    const dataHoraFim = converterParaData(data.dataHoraFim, 'Data/hora de fim');

    if (dataHoraFim <= dataHoraInicio) {
        throw new AppError(
            'Data/hora de fim deve ser posterior à data/hora de início.',
            400,
        );
    }

    if (
        !estaDentroDoHorarioDeFuncionamento(dataHoraInicio) ||
        !estaDentroDoHorarioDeFuncionamento(dataHoraFim)
    ) {
        throw new AppError(
            `Bloqueio deve estar dentro do horário de funcionamento (segunda a sábado, das ${HORA_ABERTURA}h às ${HORA_FECHAMENTO}h).`,
            422,
        );
    }

    const motivo = data.motivo.trim();
    if (!motivo) {
        throw new AppError('Motivo do bloqueio é obrigatório.', 400);
    }

    const conflito = await agendamentoRepository.buscarConflito({
        dataHoraInicio,
        dataHoraFim,
    });
    if (conflito) {
        throw new AppError(
            'Não é possível criar bloqueio: já existe agendamento não cancelado nesse intervalo.',
            409,
        );
    }

    return bloqueioRepository.criar({
        dataHoraInicio,
        dataHoraFim,
        motivo,
    });
}

export async function listarTodos(data?: string) {
    if (!data) {
        return bloqueioRepository.listarTodos();
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        throw new AppError('Filtro de data inválido.', 400);
    }

    const inicio = new Date(`${data}T00:00:00-03:00`);
    const fim = new Date(`${data}T00:00:00-03:00`);
    fim.setUTCDate(fim.getUTCDate() + 1);

    return bloqueioRepository.listarTodos({
        dataHoraInicio: inicio,
        dataHoraFim: fim,
    });
}

export async function excluirPorId(id: string): Promise<void> {
    try {
        await bloqueioRepository.excluirPorId(id);
    } catch (error) {
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'P2025'
        ) {
            throw new AppError('Bloqueio não encontrado.', 404);
        }

        throw error;
    }
}
