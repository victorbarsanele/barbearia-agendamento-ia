import {
    Prisma,
    StatusReativacaoEnvio,
    type ReativacaoEnvio,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
    REATIVACAO_COOLDOWN_DIAS,
    REATIVACAO_PENDENTE_EXPIRA_MS,
} from '../config/reativacao';
import { estaEmCooldown } from '../utils/reativacao-cooldown';

export type UltimaReativacao = Pick<
    ReativacaoEnvio,
    | 'id'
    | 'clienteId'
    | 'ycloudMessageId'
    | 'status'
    | 'motivoFalha'
    | 'criadoEm'
>;

export interface ResumoReativacoesCliente {
    ultimaTentativa: {
        status: StatusReativacaoEnvio;
        criadoEm: Date;
    } | null;
    ultimaNaoFalhada: {
        status: Exclude<StatusReativacaoEnvio, 'FALHOU'>;
        criadoEm: Date;
    } | null;
}

export type ResultadoReservaReativacao =
    | { ok: true; envioId: string }
    | {
          ok: false;
          motivo: 'OPT_OUT' | 'COOLDOWN' | 'CLIENTE_NAO_ENCONTRADO';
          ate?: Date;
      };

export interface ReativacaoRepository {
    registrarOptOutMarketing(clienteId: string, quando: Date): Promise<void>;
    reservarEnvioReativacao(
        clienteId: string,
        agora: Date,
    ): Promise<ResultadoReservaReativacao>;
    marcarEnvioAceito(envioId: string, ycloudMessageId: string): Promise<void>;
    marcarEnvioFalhou(envioId: string, motivo: string): Promise<void>;
    atualizarStatusPorYCloudMessageId(
        ycloudMessageId: string,
        status: 'ENTREGUE' | 'FALHOU',
        motivoFalha: string | null,
    ): Promise<boolean>;
    buscarUltimasReativacoesPorClientes(
        clienteIds: string[],
    ): Promise<Map<string, UltimaReativacao>>;
    buscarResumoReativacoesPorClientes(
        clienteIds: string[],
        agora?: Date,
    ): Promise<Map<string, ResumoReativacoesCliente>>;
}

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export class PrismaReativacaoRepository implements ReativacaoRepository {
    private readonly injectedClient?: PrismaClient;
    private clientPromise?: Promise<PrismaClient>;

    constructor(client?: PrismaClient) {
        this.injectedClient = client;
    }

    private async getPrisma(): Promise<PrismaClient> {
        if (this.injectedClient) {
            return this.injectedClient;
        }
        this.clientPromise ??= import('../lib/prisma').then(
            (module) => module.default,
        );
        return this.clientPromise;
    }

    async registrarOptOutMarketing(
        clienteId: string,
        quando: Date,
    ): Promise<void> {
        const prisma = await this.getPrisma();
        await prisma.cliente.updateMany({
            where: { id: clienteId, optOutMarketingEm: null },
            data: { optOutMarketingEm: quando },
        });
    }

    async reservarEnvioReativacao(
        clienteId: string,
        agora: Date,
    ): Promise<ResultadoReservaReativacao> {
        const prisma = await this.getPrisma();
        return prisma.$transaction(async (tx) => {
            const clientes = await tx.$queryRaw<
                { id: string; optOutMarketingEm: Date | null }[]
            >(
                Prisma.sql`SELECT "id", "optOutMarketingEm" FROM "clientes" WHERE "id" = ${clienteId} FOR UPDATE`,
            );
            const cliente = clientes[0];

            if (!cliente) {
                return { ok: false, motivo: 'CLIENTE_NAO_ENCONTRADO' };
            }
            if (cliente.optOutMarketingEm !== null) {
                return { ok: false, motivo: 'OPT_OUT' };
            }

            await tx.reativacaoEnvio.updateMany({
                where: {
                    clienteId,
                    status: StatusReativacaoEnvio.PENDENTE,
                    criadoEm: {
                        lt: new Date(
                            agora.getTime() - REATIVACAO_PENDENTE_EXPIRA_MS,
                        ),
                    },
                },
                data: {
                    status: StatusReativacaoEnvio.FALHOU,
                    motivoFalha: 'PENDENTE_EXPIRADA',
                },
            });

            const inicioCooldown = new Date(
                agora.getTime() -
                    REATIVACAO_COOLDOWN_DIAS * MILISSEGUNDOS_POR_DIA,
            );
            const ultimaTentativa = await tx.reativacaoEnvio.findFirst({
                where: {
                    clienteId,
                    criadoEm: { gte: inicioCooldown },
                    status: { not: StatusReativacaoEnvio.FALHOU },
                },
                orderBy: { criadoEm: 'desc' },
                select: { criadoEm: true, status: true },
            });

            if (estaEmCooldown(ultimaTentativa, agora)) {
                const ate = new Date(
                    ultimaTentativa!.criadoEm.getTime() +
                        REATIVACAO_COOLDOWN_DIAS * MILISSEGUNDOS_POR_DIA,
                );
                return { ok: false, motivo: 'COOLDOWN', ate };
            }

            const envio = await tx.reativacaoEnvio.create({
                data: {
                    clienteId,
                    status: StatusReativacaoEnvio.PENDENTE,
                    criadoEm: agora,
                },
                select: { id: true },
            });

            return { ok: true, envioId: envio.id };
        });
    }

    async marcarEnvioAceito(
        envioId: string,
        ycloudMessageId: string,
    ): Promise<void> {
        const prisma = await this.getPrisma();
        await prisma.reativacaoEnvio.update({
            where: { id: envioId },
            data: {
                status: StatusReativacaoEnvio.ACEITA,
                ycloudMessageId,
                motivoFalha: null,
            },
        });
    }

    async marcarEnvioFalhou(envioId: string, motivo: string): Promise<void> {
        const prisma = await this.getPrisma();
        await prisma.reativacaoEnvio.update({
            where: { id: envioId },
            data: {
                status: StatusReativacaoEnvio.FALHOU,
                motivoFalha: motivo,
            },
        });
    }

    async atualizarStatusPorYCloudMessageId(
        ycloudMessageId: string,
        status: 'ENTREGUE' | 'FALHOU',
        motivoFalha: string | null,
    ): Promise<boolean> {
        const prisma = await this.getPrisma();
        return prisma.$transaction(async (tx) => {
            const statusPermitidos =
                status === StatusReativacaoEnvio.ENTREGUE
                    ? [
                          StatusReativacaoEnvio.PENDENTE,
                          StatusReativacaoEnvio.ACEITA,
                          StatusReativacaoEnvio.FALHOU,
                      ]
                    : [
                          StatusReativacaoEnvio.PENDENTE,
                          StatusReativacaoEnvio.ACEITA,
                      ];
            const resultado = await tx.reativacaoEnvio.updateMany({
                where: {
                    ycloudMessageId,
                    status: { in: statusPermitidos },
                },
                data: {
                    status,
                    motivoFalha:
                        status === StatusReativacaoEnvio.ENTREGUE
                            ? null
                            : motivoFalha,
                },
            });
            if (resultado.count > 0) {
                return true;
            }

            const existente = await tx.reativacaoEnvio.findFirst({
                where: { ycloudMessageId },
                select: { id: true },
            });
            return existente !== null;
        });
    }

    async buscarUltimasReativacoesPorClientes(
        clienteIds: string[],
    ): Promise<Map<string, UltimaReativacao>> {
        if (clienteIds.length === 0) {
            return new Map();
        }

        const prisma = await this.getPrisma();
        const rows = await prisma.$queryRaw<UltimaReativacao[]>(
            Prisma.sql`SELECT DISTINCT ON ("clienteId") "id", "clienteId", "ycloudMessageId", "status", "motivoFalha", "criadoEm" FROM "reativacoes_envios" WHERE "clienteId" IN (${Prisma.join(clienteIds)}) ORDER BY "clienteId", "criadoEm" DESC`,
        );

        return new Map(rows.map((row) => [row.clienteId, row]));
    }

    async buscarResumoReativacoesPorClientes(
        clienteIds: string[],
        agora = new Date(),
    ): Promise<Map<string, ResumoReativacoesCliente>> {
        if (clienteIds.length === 0) {
            return new Map();
        }

        type ResumoRaw = {
            clienteId: string;
            ultimaStatus: StatusReativacaoEnvio | null;
            ultimaCriadoEm: Date | null;
            ultimaNaoFalhadaStatus: Exclude<
                StatusReativacaoEnvio,
                'FALHOU'
            > | null;
            ultimaNaoFalhadaCriadoEm: Date | null;
        };

        const prisma = await this.getPrisma();
        const pendenteExpiraAntes = new Date(
            agora.getTime() - REATIVACAO_PENDENTE_EXPIRA_MS,
        );
        const rows = await prisma.$queryRaw<ResumoRaw[]>(Prisma.sql`
            WITH "clientesSolicitados" AS (
                SELECT UNNEST(ARRAY[${Prisma.join(clienteIds)}]::text[]) AS "clienteId"
            ),
            "ultimas" AS (
                SELECT DISTINCT ON ("clienteId")
                    "clienteId",
                    CASE
                        WHEN "status" = ${StatusReativacaoEnvio.PENDENTE}::"StatusReativacaoEnvio"
                          AND "criadoEm" < ${pendenteExpiraAntes}
                        THEN ${StatusReativacaoEnvio.FALHOU}::"StatusReativacaoEnvio"
                        ELSE "status"
                    END AS "status",
                    "criadoEm"
                FROM "reativacoes_envios"
                WHERE "clienteId" IN (${Prisma.join(clienteIds)})
                ORDER BY "clienteId", "criadoEm" DESC, "id" DESC
            ),
            "ultimasNaoFalhadas" AS (
                SELECT DISTINCT ON ("clienteId") "clienteId", "status", "criadoEm"
                FROM "reativacoes_envios"
                WHERE "clienteId" IN (${Prisma.join(clienteIds)})
                  AND "status" <> ${StatusReativacaoEnvio.FALHOU}::"StatusReativacaoEnvio"
                                    AND NOT (
                                            "status" = ${StatusReativacaoEnvio.PENDENTE}::"StatusReativacaoEnvio"
                                            AND "criadoEm" < ${pendenteExpiraAntes}
                                    )
                ORDER BY "clienteId", "criadoEm" DESC, "id" DESC
            )
            SELECT
                solicitados."clienteId",
                ultimas."status" AS "ultimaStatus",
                ultimas."criadoEm" AS "ultimaCriadoEm",
                naoFalhadas."status" AS "ultimaNaoFalhadaStatus",
                naoFalhadas."criadoEm" AS "ultimaNaoFalhadaCriadoEm"
            FROM "clientesSolicitados" AS solicitados
            LEFT JOIN "ultimas" AS ultimas
                ON ultimas."clienteId" = solicitados."clienteId"
            LEFT JOIN "ultimasNaoFalhadas" AS naoFalhadas
                ON naoFalhadas."clienteId" = solicitados."clienteId"
        `);

        return new Map(
            rows.map((row) => [
                row.clienteId,
                {
                    ultimaTentativa:
                        row.ultimaStatus !== null && row.ultimaCriadoEm !== null
                            ? {
                                  status: row.ultimaStatus,
                                  criadoEm: row.ultimaCriadoEm,
                              }
                            : null,
                    ultimaNaoFalhada:
                        row.ultimaNaoFalhadaStatus !== null &&
                        row.ultimaNaoFalhadaCriadoEm !== null
                            ? {
                                  status: row.ultimaNaoFalhadaStatus,
                                  criadoEm: row.ultimaNaoFalhadaCriadoEm,
                              }
                            : null,
                },
            ]),
        );
    }
}

let repository: ReativacaoRepository = new PrismaReativacaoRepository();

export function getReativacaoRepository(): ReativacaoRepository {
    return repository;
}

export function setReativacaoRepository(value: ReativacaoRepository): void {
    repository = value;
}
