import {
    Prisma,
    StatusAgendamento,
    StatusLembreteAgendamentoEnvio,
    type PrismaClient,
} from '@prisma/client';
import { canonicalizeYCloudPhone } from '../whatsapp/ycloud-inbound.adapter';

export interface AgendamentoParaLembrete {
    id: string;
    status: StatusAgendamento;
    dataHoraInicio: Date;
    cliente: { nome: string; telefone: string };
    servico: { nome: string };
}

export interface UltimoLembreteAgendamento {
    id: string;
    status: StatusLembreteAgendamentoEnvio;
    criadoEm: Date;
    aceitoEm: Date | null;
    motivoFalha: string | null;
}

export interface ContextoRemarcacaoConsumido {
    agendamentoId: string;
    servico: string;
    dataHoraInicio: Date;
}

export type ResultadoReservaLembrete =
    | { ok: true; envioId: string; agendamento: AgendamentoParaLembrete }
    | {
          ok: false;
          motivo:
              | 'AGENDAMENTO_NAO_ENCONTRADO'
              | 'AGENDAMENTO_NAO_ATIVO'
              | 'LEMBRETE_PENDENTE'
              | 'LEMBRETE_JA_ENVIADO';
      };

export interface LembreteAgendamentoRepository {
    obterAgendamento(id: string): Promise<AgendamentoParaLembrete | null>;
    obterUltimo(id: string): Promise<UltimoLembreteAgendamento | null>;
    reservar(id: string, agora: Date): Promise<ResultadoReservaLembrete>;
    marcarAceito(
        id: string,
        providerMessageId: string,
        aceitoEm: Date,
    ): Promise<void>;
    marcarFalhou(id: string, motivo: string): Promise<void>;
    confirmarPorCliente(
        id: string,
        telefone: string,
        agora: Date,
    ): Promise<boolean>;
    registrarContextoRemarcacao(
        telefone: string,
        agendamentoId: string,
        expiraEm: Date,
        agora: Date,
    ): Promise<boolean>;
    consumirContextoRemarcacao(
        telefone: string,
        agora: Date,
    ): Promise<ContextoRemarcacaoConsumido | null>;
}

const selectAgendamento = {
    id: true,
    status: true,
    dataHoraInicio: true,
    cliente: { select: { nome: true, telefone: true } },
    servico: { select: { nome: true } },
} satisfies Prisma.AgendamentoSelect;

const STATUS_ATIVO: StatusAgendamento[] = [
    StatusAgendamento.AGENDADO,
    StatusAgendamento.CONFIRMADO,
];

export class PrismaLembreteAgendamentoRepository implements LembreteAgendamentoRepository {
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

    async obterAgendamento(
        id: string,
    ): Promise<AgendamentoParaLembrete | null> {
        const prisma = await this.getPrisma();
        return prisma.agendamento.findUnique({
            where: { id },
            select: selectAgendamento,
        });
    }

    async obterUltimo(id: string): Promise<UltimoLembreteAgendamento | null> {
        const prisma = await this.getPrisma();
        return prisma.lembreteAgendamentoEnvio.findFirst({
            where: { agendamentoId: id },
            orderBy: { criadoEm: 'desc' },
            select: {
                id: true,
                status: true,
                criadoEm: true,
                aceitoEm: true,
                motivoFalha: true,
            },
        });
    }

    async reservar(id: string, agora: Date): Promise<ResultadoReservaLembrete> {
        const prisma = await this.getPrisma();
        return prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
                SELECT "id" FROM "agendamentos" WHERE "id" = ${id} FOR UPDATE
            `);
            if (!locked[0]) {
                return { ok: false, motivo: 'AGENDAMENTO_NAO_ENCONTRADO' };
            }

            const agendamento = await tx.agendamento.findUnique({
                where: { id },
                select: selectAgendamento,
            });
            if (!agendamento) {
                return { ok: false, motivo: 'AGENDAMENTO_NAO_ENCONTRADO' };
            }
            if (
                !STATUS_ATIVO.includes(agendamento.status) ||
                agendamento.dataHoraInicio <= agora
            ) {
                return { ok: false, motivo: 'AGENDAMENTO_NAO_ATIVO' };
            }

            const ultimaTentativa = await tx.lembreteAgendamentoEnvio.findFirst(
                {
                    where: { agendamentoId: id },
                    orderBy: { criadoEm: 'desc' },
                    select: { status: true },
                },
            );
            if (
                ultimaTentativa?.status ===
                StatusLembreteAgendamentoEnvio.PENDENTE
            ) {
                return { ok: false, motivo: 'LEMBRETE_PENDENTE' };
            }
            if (
                ultimaTentativa?.status ===
                StatusLembreteAgendamentoEnvio.ACEITO
            ) {
                return { ok: false, motivo: 'LEMBRETE_JA_ENVIADO' };
            }

            const envio = await tx.lembreteAgendamentoEnvio.create({
                data: {
                    agendamentoId: id,
                    status: StatusLembreteAgendamentoEnvio.PENDENTE,
                },
                select: { id: true },
            });
            return { ok: true, envioId: envio.id, agendamento };
        });
    }

    async marcarAceito(
        id: string,
        providerMessageId: string,
        aceitoEm: Date,
    ): Promise<void> {
        const prisma = await this.getPrisma();
        await prisma.lembreteAgendamentoEnvio.update({
            where: { id },
            data: {
                status: StatusLembreteAgendamentoEnvio.ACEITO,
                providerMessageId,
                aceitoEm,
                motivoFalha: null,
            },
        });
    }

    async marcarFalhou(id: string, motivo: string): Promise<void> {
        const prisma = await this.getPrisma();
        await prisma.lembreteAgendamentoEnvio.update({
            where: { id },
            data: {
                status: StatusLembreteAgendamentoEnvio.FALHOU,
                motivoFalha: motivo,
            },
        });
    }

    async confirmarPorCliente(
        id: string,
        telefone: string,
        _agora: Date,
    ): Promise<boolean> {
        const prisma = await this.getPrisma();
        return prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
                SELECT "id" FROM "agendamentos" WHERE "id" = ${id} FOR UPDATE
            `);
            if (!locked[0]) return false;

            const agendamento = await tx.agendamento.findUnique({
                where: { id },
                select: {
                    status: true,
                    cliente: { select: { telefone: true } },
                },
            });
            if (
                !agendamento ||
                !STATUS_ATIVO.includes(agendamento.status) ||
                canonicalizeYCloudPhone(agendamento.cliente.telefone) !==
                    canonicalizeYCloudPhone(telefone)
            ) {
                return false;
            }
            if (agendamento.status === StatusAgendamento.AGENDADO) {
                await tx.agendamento.update({
                    where: { id },
                    data: { status: StatusAgendamento.CONFIRMADO },
                });
            }
            return true;
        });
    }

    async registrarContextoRemarcacao(
        telefone: string,
        agendamentoId: string,
        expiraEm: Date,
        agora: Date,
    ): Promise<boolean> {
        const prisma = await this.getPrisma();
        return prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
                SELECT "id" FROM "agendamentos" WHERE "id" = ${agendamentoId} FOR UPDATE
            `);
            if (!locked[0]) return false;

            const agendamento = await tx.agendamento.findUnique({
                where: { id: agendamentoId },
                select: {
                    status: true,
                    cliente: { select: { telefone: true } },
                },
            });
            if (
                !agendamento ||
                !STATUS_ATIVO.includes(agendamento.status) ||
                canonicalizeYCloudPhone(agendamento.cliente.telefone) !==
                    canonicalizeYCloudPhone(telefone)
            ) {
                return false;
            }

            await tx.contextoRemarcacao.upsert({
                where: { telefone },
                create: { telefone, agendamentoId, expiraEm, criadoEm: agora },
                update: {
                    agendamentoId,
                    expiraEm,
                    consumidoEm: null,
                    criadoEm: agora,
                },
            });
            return true;
        });
    }

    async consumirContextoRemarcacao(
        telefone: string,
        agora: Date,
    ): Promise<ContextoRemarcacaoConsumido | null> {
        const prisma = await this.getPrisma();
        return prisma.$transaction(async (tx) => {
            const contexts = await tx.$queryRaw<
                {
                    id: string;
                    agendamentoId: string;
                    status: StatusAgendamento;
                    servico: string;
                    dataHoraInicio: Date;
                }[]
            >(Prisma.sql`
                SELECT c."id", c."agendamentoId", a."status", s."nome" AS "servico", a."dataHoraInicio"
                FROM "contextos_remarcacao" c
                JOIN "agendamentos" a ON a."id" = c."agendamentoId"
                JOIN "servicos" s ON s."id" = a."servicoId"
                WHERE c."telefone" = ${telefone}
                  AND c."expiraEm" > ${agora}
                  AND c."consumidoEm" IS NULL
                FOR UPDATE OF c
            `);
            const contexto = contexts[0];
            if (!contexto) return null;

            const claimed = await tx.contextoRemarcacao.updateMany({
                where: {
                    id: contexto.id,
                    consumidoEm: null,
                    expiraEm: { gt: agora },
                },
                data: { consumidoEm: agora },
            });
            if (
                claimed.count !== 1 ||
                !STATUS_ATIVO.includes(contexto.status)
            ) {
                return null;
            }
            return {
                agendamentoId: contexto.agendamentoId,
                servico: contexto.servico,
                dataHoraInicio: contexto.dataHoraInicio,
            };
        });
    }
}

let repository: LembreteAgendamentoRepository =
    new PrismaLembreteAgendamentoRepository();

export function getLembreteAgendamentoRepository(): LembreteAgendamentoRepository {
    return repository;
}

export function setLembreteAgendamentoRepository(
    next: LembreteAgendamentoRepository,
): void {
    repository = next;
}
