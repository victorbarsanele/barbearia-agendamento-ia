import { HorarioFuncionamento } from '@prisma/client';
import prisma from '../lib/prisma';

export async function listarTodos(): Promise<HorarioFuncionamento[]> {
    return prisma.horarioFuncionamento.findMany({
        orderBy: { diaSemana: 'asc' },
    });
}

export async function atualizarTodos(
    configuracoes: Array<{
        diaSemana: number;
        horaAberturaMinutos: number;
        horaFechamentoMinutos: number;
        almocoInicioMinutos: number | null;
        almocoFimMinutos: number | null;
        limiteExtensaoMinutos: number | null;
        ultimoInicioExtensaoMinutos: number | null;
    }>,
): Promise<HorarioFuncionamento[]> {
    return prisma.$transaction(async (transaction) => {
        await transaction.horarioFuncionamento.deleteMany();
        await transaction.horarioFuncionamento.createMany({
            data: configuracoes,
        });
        return transaction.horarioFuncionamento.findMany({
            orderBy: { diaSemana: 'asc' },
        });
    });
}
