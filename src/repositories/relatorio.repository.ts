import { Prisma, StatusAgendamento, StatusPacoteCliente } from '@prisma/client';
import prisma from '../lib/prisma';
import { TIME_ZONE } from '../services/horario-funcionamento';

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

export interface ItemClienteInativo {
    clienteId: string;
    nome: string;
    telefone: string;
    ultimaVisita: string;
    diasSemVir: number;
    ultimoServico: string | null;
    totalVisitas: number;
    pacoteAtivoComSaldo: boolean;
}

export interface ResultadoClientesInativos {
    total: number;
    itens: ItemClienteInativo[];
}

interface ClienteInativoRaw {
    total: bigint;
    clienteId: string | null;
    nome: string | null;
    telefone: string | null;
    ultimaVisita: string | null;
    diasSemVir: number | null;
    ultimoServico: string | null;
    totalVisitas: bigint | null;
    pacoteAtivoComSaldo: boolean | null;
}

const LIMITE_CLIENTES_INATIVOS = 500;

export async function listarClientesInativos(
    agora: Date,
    hojeLocal: string,
    diasMin: number,
    diasMax: number,
    variantesIgnoradas: string[],
): Promise<ResultadoClientesInativos> {
    const filtroIgnorados = variantesIgnoradas.length
        ? Prisma.sql`AND NOT (c."telefone" = ANY(ARRAY[${Prisma.join(variantesIgnoradas)}]::text[]))`
        : Prisma.empty;

    const rows = await prisma.$queryRaw<ClienteInativoRaw[]>`
        WITH "visitas" AS (
            SELECT
                a."clienteId",
                a."dataHoraInicio",
                a."id" AS "agendamentoId",
                s."nome" AS "ultimoServico",
                COUNT(*) OVER (PARTITION BY a."clienteId") AS "totalVisitas",
                ROW_NUMBER() OVER (
                    PARTITION BY a."clienteId"
                    ORDER BY a."dataHoraInicio" DESC, a."id" DESC
                ) AS "ordem"
            FROM "agendamentos" AS a
            INNER JOIN "servicos" AS s ON s."id" = a."servicoId"
            WHERE a."status" <> ${StatusAgendamento.CANCELADO}::"StatusAgendamento"
              AND a."dataHoraFim" <= ${agora}
        ),
        "calculados" AS (
            SELECT
                c."id" AS "clienteId",
                c."nome",
                c."telefone",
                TO_CHAR(
                    v."dataHoraInicio" AT TIME ZONE ${TIME_ZONE},
                    'YYYY-MM-DD'
                ) AS "ultimaVisita",
                (${hojeLocal}::date - (v."dataHoraInicio" AT TIME ZONE ${TIME_ZONE})::date)::int AS "diasSemVir",
                v."ultimoServico",
                v."totalVisitas",
                EXISTS (
                    SELECT 1
                    FROM "pacotes_clientes" AS pc
                    INNER JOIN "pacotes_clientes_servicos" AS pcs
                        ON pcs."pacoteClienteId" = pc."id"
                    WHERE pc."clienteId" = c."id"
                      AND pc."status" = ${StatusPacoteCliente.ATIVO}::"StatusPacoteCliente"
                      AND pcs."quantidadeRestante" > 0
                ) AS "pacoteAtivoComSaldo"
            FROM "clientes" AS c
            INNER JOIN "visitas" AS v
                ON v."clienteId" = c."id"
               AND v."ordem" = 1
            WHERE NOT EXISTS (
                SELECT 1
                FROM "agendamentos" AS futuro
                WHERE futuro."clienteId" = c."id"
                  AND futuro."status" <> ${StatusAgendamento.CANCELADO}::"StatusAgendamento"
                  AND futuro."dataHoraFim" > ${agora}
            )
            ${filtroIgnorados}
        ),
        "elegiveis" AS (
            SELECT *
            FROM "calculados"
            WHERE "diasSemVir" BETWEEN ${diasMin} AND ${diasMax}
        ),
        "totalizado" AS (
            SELECT COUNT(*) AS "total"
            FROM "elegiveis"
        ),
        "limitados" AS (
            SELECT *
            FROM "elegiveis"
            ORDER BY "diasSemVir" ASC, "nome" ASC, "clienteId" ASC
            LIMIT ${LIMITE_CLIENTES_INATIVOS}
        )
        SELECT
            "totalizado"."total",
            "limitados"."clienteId",
            "limitados"."nome",
            "limitados"."telefone",
            "limitados"."ultimaVisita",
            "limitados"."diasSemVir",
            "limitados"."ultimoServico",
            "limitados"."totalVisitas",
            "limitados"."pacoteAtivoComSaldo"
        FROM "totalizado"
        LEFT JOIN "limitados" ON TRUE
        ORDER BY
            "limitados"."diasSemVir" ASC NULLS LAST,
            "limitados"."nome" ASC NULLS LAST,
            "limitados"."clienteId" ASC NULLS LAST
    `;

    const total = rows[0] ? Number(rows[0].total) : 0;
    const itens = rows.flatMap((row): ItemClienteInativo[] => {
        if (
            row.clienteId === null ||
            row.nome === null ||
            row.telefone === null ||
            row.ultimaVisita === null ||
            row.diasSemVir === null ||
            row.totalVisitas === null ||
            row.pacoteAtivoComSaldo === null
        ) {
            return [];
        }

        return [
            {
                clienteId: row.clienteId,
                nome: row.nome,
                telefone: row.telefone,
                ultimaVisita: row.ultimaVisita,
                diasSemVir: Number(row.diasSemVir),
                ultimoServico: row.ultimoServico,
                totalVisitas: Number(row.totalVisitas),
                pacoteAtivoComSaldo: row.pacoteAtivoComSaldo,
            },
        ];
    });

    return { total, itens };
}
