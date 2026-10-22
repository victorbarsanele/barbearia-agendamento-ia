import { FastifyReply, FastifyRequest } from 'fastify';
import { getAgendamentoConfig } from '../config/agendamento';

export async function obter(
    _request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const { minAntecedenciaMinutos } = getAgendamentoConfig();
    void reply.send({ minAntecedenciaMinutos });
}
