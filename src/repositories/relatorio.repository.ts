import { Prisma, StatusAgendamento } from '@prisma/client';
import prisma from '../lib/prisma';

interface AgregadoRaw {
    servicoId: string;
    nome: string;
    quantidade: bigint;
    quantidadeAvulso: bigint;
    quantidadePacote: bigint;
    quantidadeComPreco: bigint;
    somaPreco: Prisma.Decimal | null;
    semPreco: bigint;
}

export interface AgregadoAtendimentos {
    servicoId: string;
    nome: string;
    quantidade: number;
    quantidadeAvulso: number;
    quantidadePacote: number;
    valorEstimado: string | null;
    semPreco: number;
}

export async function agregarAtendimentos(
    inicio: Date,
    fimExclusivo: Date,
    agora: Date,
): Promise<AgregadoAtendimentos[]> {
    const rows = await prisma.$queryRaw<AgregadoRaw[]>`
        SELECT
            s."id" AS "servicoId",
            s."nome" AS "nome",
            COUNT(*) AS "quantidade",
            COUNT(*) FILTER (
                WHERE a."pacoteClienteId" IS NULL
            ) AS "quantidadeAvulso",
            COUNT(*) FILTER (
                WHERE a."pacoteClienteId" IS NOT NULL
            ) AS "quantidadePacote",
            COUNT(a."precoUnitario") AS "quantidadeComPreco",
            SUM(a."precoUnitario") AS "somaPreco",
            COUNT(*) FILTER (
                WHERE a."precoUnitario" IS NULL
            ) AS "semPreco"
        FROM "agendamentos" AS a
        INNER JOIN "servicos" AS s ON s."id" = a."servicoId"
        WHERE a."status" <> ${StatusAgendamento.CANCELADO}::"StatusAgendamento"
          AND a."dataHoraInicio" >= ${inicio}
          AND a."dataHoraInicio" < ${fimExclusivo}
          AND (
              (a."pacoteClienteId" IS NULL AND a."dataHoraFim" <= ${agora})
              OR (a."pacoteClienteId" IS NOT NULL AND a."concluido" = TRUE)
          )
        GROUP BY s."id", s."nome"
        ORDER BY COUNT(*) DESC, s."nome" ASC
    `;

    return rows.map((row) => {
        const quantidadeComPreco = Number(row.quantidadeComPreco);
        return {
            servicoId: row.servicoId,
            nome: row.nome,
            quantidade: Number(row.quantidade),
            quantidadeAvulso: Number(row.quantidadeAvulso),
            quantidadePacote: Number(row.quantidadePacote),
            valorEstimado:
                quantidadeComPreco === 0
                    ? null
                    : (row.somaPreco ?? new Prisma.Decimal(0)).toFixed(2),
            semPreco: Number(row.semPreco),
        };
    });
}
