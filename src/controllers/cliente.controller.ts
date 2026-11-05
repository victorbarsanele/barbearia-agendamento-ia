import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../lib/app-error';
import * as clienteService from '../services/cliente.service';
import * as reativacaoService from '../services/reativacao.service';

interface CriarClienteBody {
    nome: string;
    telefone: string;
}

interface AtualizarClienteBody {
    nome: string;
    telefone: string;
}

interface BuscarPorIdParams {
    id: string;
}

interface BuscarPorTelefoneParams {
    telefone: string;
}

interface ListarClientesQuery {
    search?: string;
    page?: number;
    limit?: number;
}

interface ExcluirClienteQuery {
    confirmarHistorico?: boolean;
}

interface ReativarWhatsAppParams {
    clienteId: string;
}

function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof AppError) {
        void reply.status(error.statusCode).send({ message: error.message });
    } else {
        void reply.status(500).send({ message: 'Erro interno do servidor.' });
    }
}

export async function criar(
    request: FastifyRequest<{ Body: CriarClienteBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const cliente = await clienteService.criar(request.body);
        void reply.status(201).send(cliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function listarTodos(
    request: FastifyRequest<{ Querystring: ListarClientesQuery }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const { search, page, limit } = request.query;

        if (search === undefined && page === undefined && limit === undefined) {
            const clientes = await clienteService.listarTodos();
            void reply.send(clientes);
            return;
        }

        const resultado = await clienteService.listarPaginado({
            search,
            page: page ?? 1,
            limit: limit ?? 10,
        });

        void reply.send({
            data: resultado.clientes,
            total: resultado.total,
            page: resultado.page,
            totalPages: resultado.totalPages,
        });
    } catch (error) {
        handleError(error, reply);
    }
}

export async function buscarPorId(
    request: FastifyRequest<{ Params: BuscarPorIdParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const cliente = await clienteService.buscarPorId(request.params.id);
        void reply.send(cliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function buscarPorTelefone(
    request: FastifyRequest<{ Params: BuscarPorTelefoneParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const cliente = await clienteService.buscarPorTelefone(
            request.params.telefone,
        );
        void reply.send(cliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function atualizar(
    request: FastifyRequest<{
        Params: BuscarPorIdParams;
        Body: AtualizarClienteBody;
    }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const cliente = await clienteService.atualizar(
            request.params.id,
            request.body,
        );
        void reply.send(cliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function obterResumoExclusao(
    request: FastifyRequest<{ Params: BuscarPorIdParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const resumo = await clienteService.obterResumoExclusao(
            request.params.id,
        );
        void reply.send(resumo);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function excluir(
    request: FastifyRequest<{
        Params: BuscarPorIdParams;
        Querystring: ExcluirClienteQuery;
    }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        await clienteService.excluirPorId(
            request.params.id,
            request.query.confirmarHistorico === true,
        );
        void reply.status(204).send();
    } catch (error) {
        handleError(error, reply);
    }
}

export async function reativarWhatsApp(
    request: FastifyRequest<{ Params: ReativarWhatsAppParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const resultado = await reativacaoService.reativarCliente(
            request.params.clienteId,
        );
        void reply.status(202).send(resultado);
    } catch (error) {
        if (error instanceof AppError) {
            void reply
                .status(error.statusCode)
                .send(
                    error.details?.motivo
                        ? error.details
                        : { message: error.message },
                );
            return;
        }
        void reply.status(500).send({ message: 'Erro interno do servidor.' });
    }
}
