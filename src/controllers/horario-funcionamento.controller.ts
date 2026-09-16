import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/app-error';
import * as horarioFuncionamentoService from '../services/horario-funcionamento.service';

type Configuracao = horarioFuncionamentoService.HorarioFuncionamentoConfig;

function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof AppError) {
        void reply.status(error.statusCode).send({ message: error.message });
        return;
    }

    void reply.status(500).send({ message: 'Erro interno do servidor.' });
}

export async function listar(
    _request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    try {
        void reply.send(await horarioFuncionamentoService.listarConfiguracao());
    } catch (error) {
        handleError(error, reply);
    }
}

export async function atualizar(
    request: FastifyRequest<{ Body: Array<Configuracao | null> }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        void reply.send(
            await horarioFuncionamentoService.atualizarConfiguracao(
                request.body,
            ),
        );
    } catch (error) {
        handleError(error, reply);
    }
}
