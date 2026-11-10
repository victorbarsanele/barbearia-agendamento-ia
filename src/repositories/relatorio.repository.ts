import { Prisma, StatusAgendamento, StatusPacoteCliente } from '@prisma/client';
import prisma from '../lib/prisma';
import { TIME_ZONE } from '../services/horario-funcionamento';
import { obterRenovadoEm } from '../utils/renovado-em';

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

export async function agruparAgendamentosPorOrigem(
    inicio: Date,
    fimExclusivo: Date,
) {
    return prisma.agendamento.groupBy({
        by: ['origem', 'status'],
        where: {
            createdAt: { gte: inicio, lt: fimExclusivo },
        },
        _count: { _all: true },
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
    optOutMarketing: boolean;
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
    optOutMarketingEm: Date | null;
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
                c."optOutMarketingEm",
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
            "limitados"."pacoteAtivoComSaldo",
            "limitados"."optOutMarketingEm"
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
                optOutMarketing: row.optOutMarketingEm !== null,
            },
        ];
    });

    return { total, itens };
}

export interface ServicoSaldoPacote {
    servicoId: string;
    nome: string;
    total: number;
    restante: number;
    agendados: number;
}

export interface ItemSaldoPacote {
    pacoteClienteId: string;
    clienteId: string;
    nome: string;
    telefone: string;
    pacoteNome: string;
    dataInicio: string;
    renovadoEm: string | null;
    ultimaVisita: string | null;
    semVisita: boolean;
    diasSemVir: number;
    temHorarioMarcado: boolean;
    parado: boolean;
    totalRestante: number;
    totalAgendados: number;
    aConcluir: number;
    servicos: ServicoSaldoPacote[];
}

export interface ResultadoSaldoPacotes {
    totalAtivos: number;
    totalParados: number;
    total: number;
    itens: ItemSaldoPacote[];
}

interface ServicoSaldoPacoteRaw {
    servicoId: string;
    nome: string;
    total: number;
    restante: number;
    agendados: number | bigint;
}

interface SaldoPacoteRaw {
    totalAtivos: bigint;
    totalParados: bigint;
    total: bigint;
    pacoteClienteId: string | null;
    clienteId: string | null;
    nome: string | null;
    telefone: string | null;
    pacoteNome: string | null;
    dataInicio: string | null;
    renovadoDeId: string | null;
    ultimaVisita: string | null;
    semVisita: boolean | null;
    diasSemVir: number | null;
    temHorarioMarcado: boolean | null;
    parado: boolean | null;
    totalRestante: bigint | null;
    totalAgendados: bigint | null;
    aConcluir: bigint | null;
    servicos: ServicoSaldoPacoteRaw[] | null;
}

const LIMITE_SALDO_PACOTES = 500;

export async function listarSaldoPacotes(
    agora: Date,
    hojeLocal: string,
    diasParado: number,
    somenteParados: boolean,
    limite = LIMITE_SALDO_PACOTES,
): Promise<ResultadoSaldoPacotes> {
    // Critério de visita espelha listarClientesInativos, sem alterar sua consulta.
    const rows = await prisma.$queryRaw<SaldoPacoteRaw[]>`
        WITH "visitas" AS (
            SELECT a."clienteId", a."dataHoraInicio"
            FROM "agendamentos" AS a
            INNER JOIN "servicos" AS s ON s."id" = a."servicoId"
            WHERE a."status" <> ${StatusAgendamento.CANCELADO}::"StatusAgendamento"
              AND a."dataHoraFim" <= ${agora}
        ),
        "ultima_visita" AS (
            SELECT "clienteId", MAX("dataHoraInicio") AS "ultimaVisita"
            FROM "visitas"
            GROUP BY "clienteId"
        ),
        "horarios_cliente" AS (
            SELECT a."clienteId", TRUE AS "temHorarioMarcado"
            FROM "agendamentos" AS a
            WHERE a."status" <> ${StatusAgendamento.CANCELADO}::"StatusAgendamento"
              AND a."dataHoraFim" > ${agora}
            GROUP BY a."clienteId"
        ),
        "agendamentos_pacote" AS (
            SELECT
                a."pacoteClienteId",
                COUNT(*) FILTER (
                    WHERE a."status" <> ${StatusAgendamento.CANCELADO}::"StatusAgendamento"
                      AND a."concluido" = FALSE
                      AND a."dataHoraFim" <= ${agora}
                ) AS "aConcluir"
            FROM "agendamentos" AS a
            WHERE a."pacoteClienteId" IS NOT NULL
            GROUP BY a."pacoteClienteId"
        ),
        "servicos_saldo" AS (
            SELECT
                pcs."pacoteClienteId",
                pcs."servicoId",
                s."nome",
                pcs."quantidadeTotal" AS "total",
                pcs."quantidadeRestante" AS "restante",
                COUNT(a."id") AS "agendados"
            FROM "pacotes_clientes_servicos" AS pcs
            INNER JOIN "servicos" AS s ON s."id" = pcs."servicoId"
            LEFT JOIN "agendamentos" AS a
                ON a."pacoteClienteId" = pcs."pacoteClienteId"
               AND a."servicoId" = pcs."servicoId"
               AND a."status" <> ${StatusAgendamento.CANCELADO}::"StatusAgendamento"
               AND a."concluido" = FALSE
               AND a."dataHoraFim" > ${agora}
            GROUP BY
                pcs."pacoteClienteId",
                pcs."servicoId",
                s."nome",
                pcs."quantidadeTotal",
                pcs."quantidadeRestante"
        ),
        "pacotes_agregados" AS (
            SELECT
                pc."id" AS "pacoteClienteId",
                c."id" AS "clienteId",
                c."nome",
                c."telefone",
                p."nome" AS "pacoteNome",
                pc."dataInicio",
                pc."renovadoDeId",
                uv."ultimaVisita",
                COALESCE(hc."temHorarioMarcado", FALSE) AS "temHorarioMarcado",
                COALESCE(ap."aConcluir", 0) AS "aConcluir",
                SUM(ss."restante") AS "totalRestante",
                SUM(ss."agendados") AS "totalAgendados",
                JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'servicoId', ss."servicoId",
                        'nome', ss."nome",
                        'total', ss."total",
                        'restante', ss."restante",
                        'agendados', ss."agendados"
                    ) ORDER BY ss."nome", ss."servicoId"
                ) AS "servicos"
            FROM "pacotes_clientes" AS pc
            INNER JOIN "clientes" AS c ON c."id" = pc."clienteId"
            INNER JOIN "pacotes" AS p ON p."id" = pc."pacoteId"
            INNER JOIN "servicos_saldo" AS ss
                ON ss."pacoteClienteId" = pc."id"
            LEFT JOIN "ultima_visita" AS uv ON uv."clienteId" = c."id"
            LEFT JOIN "horarios_cliente" AS hc ON hc."clienteId" = c."id"
            LEFT JOIN "agendamentos_pacote" AS ap
                ON ap."pacoteClienteId" = pc."id"
            WHERE pc."status" = ${StatusPacoteCliente.ATIVO}::"StatusPacoteCliente"
            GROUP BY
                pc."id",
                c."id",
                c."nome",
                c."telefone",
                p."nome",
                pc."dataInicio",
                pc."renovadoDeId",
                uv."ultimaVisita",
                hc."temHorarioMarcado",
                ap."aConcluir"
            HAVING SUM(ss."restante") > 0
        ),
        "calculados" AS (
            SELECT
                "pacoteClienteId",
                "clienteId",
                "nome",
                "telefone",
                "pacoteNome",
                TO_CHAR("dataInicio" AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM-DD') AS "dataInicio",
                "renovadoDeId",
                CASE
                    WHEN "ultimaVisita" IS NULL THEN NULL
                    ELSE TO_CHAR("ultimaVisita" AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM-DD')
                END AS "ultimaVisita",
                "ultimaVisita" IS NULL AS "semVisita",
                (
                    ${hojeLocal}::date
                    - (COALESCE("ultimaVisita", "dataInicio") AT TIME ZONE ${TIME_ZONE})::date
                )::int AS "diasSemVir",
                "temHorarioMarcado",
                NOT "temHorarioMarcado"
                    AND (
                        ${hojeLocal}::date
                        - (COALESCE("ultimaVisita", "dataInicio") AT TIME ZONE ${TIME_ZONE})::date
                    ) >= ${diasParado} AS "parado",
                "totalRestante",
                "totalAgendados",
                "aConcluir",
                "servicos"
            FROM "pacotes_agregados"
        ),
        "filtrados" AS (
            SELECT *
            FROM "calculados"
            WHERE NOT ${somenteParados} OR "parado"
        ),
        "resumo" AS (
            SELECT
                COUNT(*) AS "totalAtivos",
                COUNT(*) FILTER (WHERE "parado") AS "totalParados",
                (SELECT COUNT(*) FROM "filtrados") AS "total"
            FROM "calculados"
        ),
        "limitados" AS (
            SELECT *
            FROM "filtrados"
            ORDER BY
                "parado" DESC,
                "diasSemVir" DESC,
                "nome" ASC,
                "pacoteClienteId" ASC
            LIMIT ${limite}
        )
        SELECT
            "resumo"."totalAtivos",
            "resumo"."totalParados",
            "resumo"."total",
            "limitados"."pacoteClienteId",
            "limitados"."clienteId",
            "limitados"."nome",
            "limitados"."telefone",
            "limitados"."pacoteNome",
            "limitados"."dataInicio",
            "limitados"."renovadoDeId",
            "limitados"."ultimaVisita",
            "limitados"."semVisita",
            "limitados"."diasSemVir",
            "limitados"."temHorarioMarcado",
            "limitados"."parado",
            "limitados"."totalRestante",
            "limitados"."totalAgendados",
            "limitados"."aConcluir",
            "limitados"."servicos"
        FROM "resumo"
        LEFT JOIN "limitados" ON TRUE
        ORDER BY
            "limitados"."parado" DESC NULLS LAST,
            "limitados"."diasSemVir" DESC NULLS LAST,
            "limitados"."nome" ASC NULLS LAST,
            "limitados"."pacoteClienteId" ASC NULLS LAST
    `;

    const resumo = rows[0];
    const itens = rows.flatMap((row): ItemSaldoPacote[] => {
        if (
            row.pacoteClienteId === null ||
            row.clienteId === null ||
            row.nome === null ||
            row.telefone === null ||
            row.pacoteNome === null ||
            row.dataInicio === null ||
            row.semVisita === null ||
            row.diasSemVir === null ||
            row.temHorarioMarcado === null ||
            row.parado === null ||
            row.totalRestante === null ||
            row.totalAgendados === null ||
            row.aConcluir === null
        ) {
            return [];
        }

        return [
            {
                pacoteClienteId: row.pacoteClienteId,
                clienteId: row.clienteId,
                nome: row.nome,
                telefone: row.telefone,
                pacoteNome: row.pacoteNome,
                dataInicio: row.dataInicio,
                renovadoEm: obterRenovadoEm(row.renovadoDeId, row.dataInicio),
                ultimaVisita: row.ultimaVisita,
                semVisita: row.semVisita,
                diasSemVir: Number(row.diasSemVir),
                temHorarioMarcado: row.temHorarioMarcado,
                parado: row.parado,
                totalRestante: Number(row.totalRestante),
                totalAgendados: Number(row.totalAgendados),
                aConcluir: Number(row.aConcluir),
                servicos: (row.servicos ?? []).map((servico) => ({
                    servicoId: servico.servicoId,
                    nome: servico.nome,
                    total: Number(servico.total),
                    restante: Number(servico.restante),
                    agendados: Number(servico.agendados),
                })),
            },
        ];
    });

    return {
        totalAtivos: Number(resumo?.totalAtivos ?? 0),
        totalParados: Number(resumo?.totalParados ?? 0),
        total: Number(resumo?.total ?? 0),
        itens,
    };
}
