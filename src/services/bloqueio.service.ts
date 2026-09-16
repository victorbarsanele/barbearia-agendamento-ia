import { AppError } from '../lib/app-error';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import * as horarioFuncionamentoService from './horario-funcionamento.service';
import { EscopoBloqueio, RecorrenciaBloqueio } from '@prisma/client';

interface CriarBloqueioData {
    dataHoraInicio?: string;
    dataHoraFim?: string;
    motivo: string;
    escopo?: EscopoBloqueio;
    recorrencia?: RecorrenciaBloqueio;
    diaSemana?: number;
    horaInicioMinutos?: number;
    horaFimMinutos?: number;
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
    const recorrencia = data.recorrencia ?? RecorrenciaBloqueio.PONTUAL;
    const escopo = data.escopo ?? EscopoBloqueio.TODOS;
    let dataHoraInicio: Date | undefined;
    let dataHoraFim: Date | undefined;

    if (recorrencia === RecorrenciaBloqueio.PONTUAL) {
        if (!data.dataHoraInicio || !data.dataHoraFim) {
            throw new AppError(
                'Data/hora é obrigatória para bloqueio pontual.',
                400,
            );
        }
        dataHoraInicio = converterParaData(
            data.dataHoraInicio,
            'Data/hora de início',
        );
        dataHoraFim = converterParaData(data.dataHoraFim, 'Data/hora de fim');
    } else {
        if (
            data.diaSemana === undefined ||
            data.diaSemana < 1 ||
            data.diaSemana > 6 ||
            data.horaInicioMinutos === undefined ||
            data.horaFimMinutos === undefined
        ) {
            throw new AppError(
                'Dia e horário são obrigatórios para bloqueio semanal.',
                400,
            );
        }
        if (data.horaFimMinutos <= data.horaInicioMinutos) {
            throw new AppError(
                'Horário de fim deve ser posterior ao início.',
                400,
            );
        }
        const configuracao =
            await horarioFuncionamentoService.carregarConfiguracao();
        const horario = configuracao.find(
            (item) => item.diaSemana === data.diaSemana,
        );
        if (
            !horario ||
            data.horaInicioMinutos < horario.horaAberturaMinutos ||
            data.horaFimMinutos > horario.horaFechamentoMinutos
        ) {
            throw new AppError(
                'Bloqueio deve estar dentro do horário de funcionamento.',
                422,
            );
        }
    }

    if (dataHoraInicio && dataHoraFim && dataHoraFim <= dataHoraInicio) {
        throw new AppError(
            'Data/hora de fim deve ser posterior à data/hora de início.',
            400,
        );
    }

    const configuracao =
        await horarioFuncionamentoService.carregarConfiguracao();
    if (
        dataHoraInicio &&
        dataHoraFim &&
        (!horarioFuncionamentoService.estaDentroDoHorarioDeFuncionamentoComConfiguracao(
            configuracao,
            dataHoraInicio,
        ) ||
            !horarioFuncionamentoService.estaDentroDoHorarioDeFuncionamentoComConfiguracao(
                configuracao,
                dataHoraFim,
            ))
    ) {
        throw new AppError(
            'Bloqueio deve estar dentro do horário de funcionamento (segunda a sexta, das 9h às 20h, e sábado, das 8h às 17h).',
            422,
        );
    }

    const motivo = data.motivo.trim();
    if (!motivo) {
        throw new AppError('Motivo do bloqueio é obrigatório.', 400);
    }

    const conflito =
        dataHoraInicio && dataHoraFim
            ? await agendamentoRepository.buscarConflito({
                  dataHoraInicio,
                  dataHoraFim,
              })
            : null;
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
        escopo,
        recorrencia,
        diaSemana: data.diaSemana,
        horaInicioMinutos: data.horaInicioMinutos,
        horaFimMinutos: data.horaFimMinutos,
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
