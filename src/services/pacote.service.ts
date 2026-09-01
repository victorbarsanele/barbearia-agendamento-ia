import { Prisma, StatusPacoteCliente } from '@prisma/client';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { AppError } from '../lib/app-error';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import * as pacoteRepository from '../repositories/pacote.repository';
import * as pacoteClienteRepository from '../repositories/pacoteCliente.repository';
import * as servicoRepository from '../repositories/servico.repository';
import { TIME_ZONE } from './horario-funcionamento';

function inicioDoDiaAtual(): Date {
    const agoraEmBrasilia = toZonedTime(new Date(), TIME_ZONE);
    agoraEmBrasilia.setHours(0, 0, 0, 0);
    return fromZonedTime(agoraEmBrasilia, TIME_ZONE);
}

function isForeignKeyConflict(error: unknown): boolean {
    if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
    ) {
        return true;
    }

    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const maybeCode = (error as { code?: unknown }).code;
    const maybeMessage = (error as { message?: unknown }).message;

    if (typeof maybeCode === 'string' && maybeCode === '23503') {
        return true;
    }

    if (
        typeof maybeMessage === 'string' &&
        /foreign key|violates foreign key constraint|constraint/i.test(
            maybeMessage,
        )
    ) {
        return true;
    }

    return false;
}

async function validarServicoIds(servicoIds: string[]): Promise<void> {
    if (servicoIds.length === 0) {
        throw new AppError('Pacote deve conter ao menos um serviço.', 400);
    }

    for (const servicoId of servicoIds) {
        const servico = await servicoRepository.buscarPorId(servicoId);
        if (!servico) {
            throw new AppError(`Serviço não encontrado: ${servicoId}.`, 404);
        }
    }
}

function validarDadosPacote(data: {
    duracaoDias: number;
    quantidade: number;
}): void {
    if (data.duracaoDias <= 0) {
        throw new AppError('A duração do pacote deve ser maior que zero.', 400);
    }

    if (data.quantidade <= 0) {
        throw new AppError(
            'A quantidade do pacote deve ser maior que zero.',
            400,
        );
    }
}

export async function criar(data: {
    nome: string;
    duracaoDias: number;
    quantidade: number;
    servicoIds: string[];
}) {
    validarDadosPacote(data);
    await validarServicoIds(data.servicoIds);

    return pacoteRepository.criar(data);
}

export async function listarTodos() {
    return pacoteRepository.listarTodos();
}

export async function buscarPorId(id: string) {
    const pacote = await pacoteRepository.buscarPorId(id);
    if (!pacote) {
        throw new AppError('Pacote não encontrado.', 404);
    }

    return pacote;
}

export async function atualizar(
    id: string,
    data: {
        nome: string;
        duracaoDias: number;
        quantidade: number;
        servicoIds: string[];
    },
) {
    const existente = await pacoteRepository.buscarPorId(id);
    if (!existente) {
        throw new AppError('Pacote não encontrado.', 404);
    }

    validarDadosPacote(data);
    await validarServicoIds(data.servicoIds);

    return pacoteRepository.atualizar(id, data);
}

export async function excluirPorId(id: string): Promise<void> {
    const existente = await pacoteRepository.buscarPorId(id);
    if (!existente) {
        throw new AppError('Pacote não encontrado.', 404);
    }

    const clientesVinculados =
        await pacoteRepository.contarClientesVinculados(id);
    if (clientesVinculados > 0) {
        throw new AppError(
            'Não é possível excluir pacote com clientes vinculados.',
            409,
        );
    }

    try {
        await pacoteRepository.excluirPorId(id);
    } catch (error) {
        if (isForeignKeyConflict(error)) {
            // check acima já cobre o único vínculo de negócio real (PacoteCliente)
            throw new AppError('Não foi possível excluir o pacote.', 409);
        }

        throw error;
    }
}

export async function vincularCliente(data: {
    clienteId: string;
    pacoteId: string;
}) {
    const cliente = await clienteRepository.buscarPorId(data.clienteId);
    if (!cliente) {
        throw new AppError('Cliente não encontrado.', 404);
    }

    const pacote = await pacoteRepository.buscarPorId(data.pacoteId);
    if (!pacote) {
        throw new AppError('Pacote não encontrado.', 404);
    }

    const ativoExistente =
        await pacoteClienteRepository.buscarAtivoPorClienteId(data.clienteId);
    if (ativoExistente) {
        throw new AppError('Cliente já possui um pacote ativo.', 409);
    }

    return pacoteClienteRepository.criar({
        clienteId: data.clienteId,
        pacoteId: data.pacoteId,
        quantidadeTotal: pacote.quantidade,
        quantidadeRestante: pacote.quantidade,
        dataInicio: new Date(),
    });
}

export async function buscarAtivoPorCliente(clienteId: string) {
    const cliente = await clienteRepository.buscarPorId(clienteId);
    if (!cliente) {
        throw new AppError('Cliente não encontrado.', 404);
    }

    return pacoteClienteRepository.buscarAtivoPorClienteId(clienteId);
}

export async function desvincularCliente(pacoteClienteId: string) {
    const pacoteCliente =
        await pacoteClienteRepository.buscarPorId(pacoteClienteId);
    if (!pacoteCliente) {
        throw new AppError('Pacote do cliente não encontrado.', 404);
    }

    if (pacoteCliente.status !== StatusPacoteCliente.ATIVO) {
        throw new AppError('Pacote já não está ativo.', 409);
    }

    const pendentes =
        await agendamentoRepository.contarPendentesPorPacoteClienteId(
            pacoteClienteId,
            inicioDoDiaAtual(),
        );
    if (pendentes > 0) {
        throw new AppError(
            'Não é possível desvincular: há agendamento(s) pendente(s) vinculado(s) a este pacote. Cancele ou reagende antes de desvincular.',
            409,
        );
    }

    return pacoteClienteRepository.atualizarStatus(
        pacoteClienteId,
        StatusPacoteCliente.CANCELADO,
    );
}
