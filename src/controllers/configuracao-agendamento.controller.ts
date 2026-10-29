import { FastifyReply, FastifyRequest } from 'fastify';
import { getAgendamentoConfig } from '../config/agendamento';
import { AppError } from '../lib/app-error';
import * as configuracaoAgendaRepository from '../repositories/configuracaoAgenda.repository';
import { chaveDataEmBrasilia, somarDiasAChaveData } from '../utils/dia-semana';
import {
    calcularHorizonteAgenda,
    HORIZONTE_MAX_DIAS,
    HORIZONTE_PADRAO_DIAS,
    type ConfiguracaoHorizonteAgenda,
} from '../utils/horizonte-agenda';

interface ConfiguracaoHorizonteBody {
    horizonteDias: unknown;
    limiteAte: unknown;
}

async function montarRespostaConfiguracao() {
    const hoje = chaveDataEmBrasilia(new Date());
    const configuracao = await configuracaoAgendaRepository.obter();
    return {
        minAntecedenciaMinutos: getAgendamentoConfig().minAntecedenciaMinutos,
        ...configuracao,
        horizontePadraoDias: HORIZONTE_PADRAO_DIAS,
        horizonteEfetivo: calcularHorizonteAgenda(hoje, configuracao),
        limiteAtivo:
            configuracao.limiteAte !== null && configuracao.limiteAte >= hoje,
    };
}

function validarConfiguracaoHorizonte(
    configuracao: ConfiguracaoHorizonteBody,
    hoje: string,
): ConfiguracaoHorizonteAgenda {
    if (
        configuracao.horizonteDias !== null &&
        (typeof configuracao.horizonteDias !== 'number' ||
            !Number.isInteger(configuracao.horizonteDias) ||
            configuracao.horizonteDias < 1 ||
            configuracao.horizonteDias > HORIZONTE_MAX_DIAS)
    ) {
        throw new AppError(
            `horizonteDias deve ser um inteiro entre 1 e ${HORIZONTE_MAX_DIAS}, ou null.`,
            400,
        );
    }

    if (configuracao.limiteAte === null) {
        return {
            horizonteDias: configuracao.horizonteDias as number | null,
            limiteAte: null,
        };
    }
    if (typeof configuracao.limiteAte !== 'string') {
        throw new AppError(
            'limiteAte deve ser uma data válida no formato YYYY-MM-DD.',
            400,
        );
    }

    try {
        somarDiasAChaveData(configuracao.limiteAte, 0);
    } catch {
        throw new AppError(
            'limiteAte deve ser uma data válida no formato YYYY-MM-DD.',
            400,
        );
    }

    const limiteMaximo = somarDiasAChaveData(hoje, HORIZONTE_MAX_DIAS);
    if (configuracao.limiteAte < hoje) {
        throw new AppError('limiteAte não pode ser anterior a hoje.', 400);
    }
    if (configuracao.limiteAte > limiteMaximo) {
        throw new AppError(
            `limiteAte não pode ultrapassar ${limiteMaximo}.`,
            400,
        );
    }

    return {
        horizonteDias: configuracao.horizonteDias as number | null,
        limiteAte: configuracao.limiteAte,
    };
}

export async function obter(
    _request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    void reply.send(await montarRespostaConfiguracao());
}

export async function definirHorizonte(
    request: FastifyRequest<{ Body: ConfiguracaoHorizonteBody }>,
    reply: FastifyReply,
): Promise<void> {
    const hoje = chaveDataEmBrasilia(new Date());
    const configuracao = validarConfiguracaoHorizonte(request.body, hoje);
    await configuracaoAgendaRepository.definir(configuracao);
    void reply.send(await montarRespostaConfiguracao());
}
