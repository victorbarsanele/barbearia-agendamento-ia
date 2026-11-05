import {
    Prisma,
    StatusReativacaoEnvio,
    type ReativacaoEnvio,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { REATIVACAO_COOLDOWN_DIAS } from '../config/reativacao';
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
    buscarUltimasReativacoesPorClientes(
        clienteIds: string[],
    ): Promise<Map<string, UltimaReativacao>>;
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
}

let repository: ReativacaoRepository = new PrismaReativacaoRepository();

export function getReativacaoRepository(): ReativacaoRepository {
    return repository;
}

export function setReativacaoRepository(value: ReativacaoRepository): void {
    repository = value;
}
