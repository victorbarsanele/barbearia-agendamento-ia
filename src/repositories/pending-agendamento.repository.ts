import type { PrismaClient } from '@prisma/client';

export const REMINDER_MIN_EXPIRY_MARGIN_MS = 3 * 60_000;

export interface PendingAgendamento {
    telefoneSessao: string;
    nomeCliente: string;
    telefoneCliente: string;
    servicoId: string;
    dataHoraInicio: Date;
    mensagemCriacaoId: string;
    criadoEm: Date;
    expiraEm: Date;
    lembreteEnviadoEm?: Date | null;
    resumoEnviadoEm?: Date | null;
}

export type PendingAgendamentoSchedule = Pick<
    PendingAgendamento,
    | 'telefoneSessao'
    | 'criadoEm'
    | 'expiraEm'
    | 'dataHoraInicio'
    | 'lembreteEnviadoEm'
>;

export type PendingAgendamentoChange =
    | { tipo: 'salvo'; rascunho: PendingAgendamentoSchedule }
    | { tipo: 'lembrete_reivindicado'; telefoneSessao: string; agora: Date }
    | { tipo: 'resumo_marcado'; telefoneSessao: string }
    | { tipo: 'removido'; telefoneSessao: string };

let changeHandler: ((change: PendingAgendamentoChange) => void) | undefined;

export function registrarObservadorRascunho(
    handler: (change: PendingAgendamentoChange) => void,
): () => void {
    changeHandler = handler;
    return () => {
        if (changeHandler === handler) changeHandler = undefined;
    };
}

function notificarAlteracaoRascunho(change: PendingAgendamentoChange): void {
    changeHandler?.(change);
}

function paraAgendamento(
    draft: PendingAgendamento,
): PendingAgendamentoSchedule {
    return {
        telefoneSessao: draft.telefoneSessao,
        criadoEm: draft.criadoEm,
        expiraEm: draft.expiraEm,
        dataHoraInicio: draft.dataHoraInicio,
        lembreteEnviadoEm: draft.lembreteEnviadoEm,
    };
}

export interface PendingAgendamentoRepository {
    salvar(
        draft: Omit<PendingAgendamento, 'criadoEm'> & { criadoEm?: Date },
    ): Promise<PendingAgendamento>;
    restaurarSeAusente(draft: PendingAgendamento): Promise<boolean>;
    obterValido(
        telefoneSessao: string,
        agora: Date,
    ): Promise<PendingAgendamento | null>;
    consumir(
        telefoneSessao: string,
        messageIdAtual: string,
        agora: Date,
    ): Promise<PendingAgendamento | null>;
    listarElegiveisParaLembrete(
        agora: Date,
        criadoAte: Date,
    ): Promise<PendingAgendamento[]>;
    listarParaAgendamento(): Promise<PendingAgendamentoSchedule[]>;
    reivindicarLembrete(telefoneSessao: string, agora: Date): Promise<boolean>;
    marcarResumoEnviado(
        telefoneSessao: string,
        mensagemCriacaoId: string,
        agora: Date,
    ): Promise<boolean>;
    listarExpirados(agora: Date): Promise<PendingAgendamento[]>;
    apagarExpirado(telefoneSessao: string, agora: Date): Promise<boolean>;
    apagar(telefoneSessao: string): Promise<boolean>;
}

function toPending(value: PendingAgendamento): PendingAgendamento {
    return value;
}

export class PrismaPendingAgendamentoRepository implements PendingAgendamentoRepository {
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

    async salvar(
        draft: Omit<PendingAgendamento, 'criadoEm'> & { criadoEm?: Date },
    ): Promise<PendingAgendamento> {
        const prisma = await this.getPrisma();
        const saved = await prisma.rascunhoAgendamento.upsert({
            where: { telefoneSessao: draft.telefoneSessao },
            create: {
                ...draft,
                lembreteEnviadoEm: null,
                resumoEnviadoEm: null,
            },
            update: {
                nomeCliente: draft.nomeCliente,
                telefoneCliente: draft.telefoneCliente,
                servicoId: draft.servicoId,
                dataHoraInicio: draft.dataHoraInicio,
                mensagemCriacaoId: draft.mensagemCriacaoId,
                criadoEm: draft.criadoEm ?? new Date(),
                expiraEm: draft.expiraEm,
                lembreteEnviadoEm: null,
                resumoEnviadoEm: null,
            },
        });
        notificarAlteracaoRascunho({
            tipo: 'salvo',
            rascunho: paraAgendamento(saved),
        });
        return toPending(saved);
    }

    async restaurarSeAusente(draft: PendingAgendamento): Promise<boolean> {
        const prisma = await this.getPrisma();
        const result = await prisma.$executeRaw`
            INSERT INTO "rascunhos_agendamento" (
                "telefoneSessao",
                "nomeCliente",
                "telefoneCliente",
                "servicoId",
                "dataHoraInicio",
                "mensagemCriacaoId",
                "criadoEm",
                "expiraEm",
                "lembreteEnviadoEm",
                "resumoEnviadoEm"
            )
            VALUES (
                ${draft.telefoneSessao},
                ${draft.nomeCliente},
                ${draft.telefoneCliente},
                ${draft.servicoId},
                ${draft.dataHoraInicio},
                ${draft.mensagemCriacaoId},
                ${draft.criadoEm},
                ${draft.expiraEm},
                ${draft.lembreteEnviadoEm ?? null},
                ${draft.resumoEnviadoEm ?? null}
            )
            ON CONFLICT ("telefoneSessao") DO NOTHING
        `;
        if (result === 1) {
            notificarAlteracaoRascunho({
                tipo: 'salvo',
                rascunho: paraAgendamento(draft),
            });
            return true;
        }
        return false;
    }

    async obterValido(
        telefoneSessao: string,
        agora: Date,
    ): Promise<PendingAgendamento | null> {
        const prisma = await this.getPrisma();
        const draft = await prisma.rascunhoAgendamento.findFirst({
            where: { telefoneSessao, expiraEm: { gt: agora } },
        });
        return draft ? toPending(draft) : null;
    }

    async listarElegiveisParaLembrete(
        agora: Date,
        criadoAte: Date,
    ): Promise<PendingAgendamento[]> {
        const prisma = await this.getPrisma();
        return prisma.rascunhoAgendamento.findMany({
            where: {
                lembreteEnviadoEm: null,
                expiraEm: {
                    gte: new Date(
                        agora.getTime() + REMINDER_MIN_EXPIRY_MARGIN_MS,
                    ),
                },
                dataHoraInicio: { gt: agora },
                criadoEm: { lte: criadoAte },
            },
        });
    }

    async listarParaAgendamento(): Promise<PendingAgendamentoSchedule[]> {
        const prisma = await this.getPrisma();
        return prisma.rascunhoAgendamento.findMany({
            select: {
                telefoneSessao: true,
                criadoEm: true,
                expiraEm: true,
                dataHoraInicio: true,
                lembreteEnviadoEm: true,
            },
        });
    }

    async reivindicarLembrete(
        telefoneSessao: string,
        agora: Date,
    ): Promise<boolean> {
        const prisma = await this.getPrisma();
        const result = await prisma.rascunhoAgendamento.updateMany({
            where: {
                telefoneSessao,
                lembreteEnviadoEm: null,
                expiraEm: {
                    gte: new Date(
                        agora.getTime() + REMINDER_MIN_EXPIRY_MARGIN_MS,
                    ),
                },
                dataHoraInicio: { gt: agora },
            },
            data: { lembreteEnviadoEm: agora },
        });
        if (result.count !== 1) return false;
        notificarAlteracaoRascunho({
            tipo: 'lembrete_reivindicado',
            telefoneSessao,
            agora,
        });
        return true;
    }

    async marcarResumoEnviado(
        telefoneSessao: string,
        mensagemCriacaoId: string,
        agora: Date,
    ): Promise<boolean> {
        const prisma = await this.getPrisma();
        const result = await prisma.rascunhoAgendamento.updateMany({
            where: {
                telefoneSessao,
                mensagemCriacaoId,
                expiraEm: { gt: agora },
            },
            data: { resumoEnviadoEm: agora },
        });
        if (result.count !== 1) return false;
        notificarAlteracaoRascunho({
            tipo: 'resumo_marcado',
            telefoneSessao,
        });
        return true;
    }

    async listarExpirados(agora: Date): Promise<PendingAgendamento[]> {
        const prisma = await this.getPrisma();
        return prisma.rascunhoAgendamento.findMany({
            where: { expiraEm: { lt: agora } },
        });
    }

    async apagarExpirado(
        telefoneSessao: string,
        agora: Date,
    ): Promise<boolean> {
        const prisma = await this.getPrisma();
        const result = await prisma.rascunhoAgendamento.deleteMany({
            where: { telefoneSessao, expiraEm: { lt: agora } },
        });
        if (result.count !== 1) return false;
        notificarAlteracaoRascunho({
            tipo: 'removido',
            telefoneSessao,
        });
        return true;
    }

    async consumir(
        telefoneSessao: string,
        messageIdAtual: string,
        agora: Date,
    ): Promise<PendingAgendamento | null> {
        const prisma = await this.getPrisma();
        const rows = await prisma.$queryRaw<PendingAgendamento[]>`
            DELETE FROM "rascunhos_agendamento"
            WHERE "telefoneSessao" = ${telefoneSessao}
              AND "expiraEm" > ${agora}
              AND "mensagemCriacaoId" <> ${messageIdAtual}
            RETURNING
                "telefoneSessao",
                "nomeCliente",
                "telefoneCliente",
                "servicoId",
                "dataHoraInicio",
                "mensagemCriacaoId",
                "criadoEm",
                "expiraEm",
                "lembreteEnviadoEm",
                "resumoEnviadoEm"
        `;
        if (!rows[0]) return null;
        notificarAlteracaoRascunho({ tipo: 'removido', telefoneSessao });
        return toPending(rows[0]);
    }

    async apagar(telefoneSessao: string): Promise<boolean> {
        const prisma = await this.getPrisma();
        const result = await prisma.rascunhoAgendamento.deleteMany({
            where: { telefoneSessao },
        });
        if (result.count === 0) return false;
        notificarAlteracaoRascunho({ tipo: 'removido', telefoneSessao });
        return true;
    }
}

export class InMemoryPendingAgendamentoRepository implements PendingAgendamentoRepository {
    private readonly drafts = new Map<string, PendingAgendamento>();

    async salvar(
        draft: Omit<PendingAgendamento, 'criadoEm'> & { criadoEm?: Date },
    ): Promise<PendingAgendamento> {
        const saved: PendingAgendamento = {
            ...draft,
            criadoEm: draft.criadoEm ?? new Date(),
            lembreteEnviadoEm: null,
            resumoEnviadoEm: null,
        };
        this.drafts.set(saved.telefoneSessao, saved);
        notificarAlteracaoRascunho({
            tipo: 'salvo',
            rascunho: paraAgendamento(saved),
        });
        return { ...saved };
    }

    async obterValido(
        telefoneSessao: string,
        agora: Date,
    ): Promise<PendingAgendamento | null> {
        const draft = this.drafts.get(telefoneSessao);
        if (!draft || draft.expiraEm <= agora) {
            return null;
        }
        return { ...draft };
    }

    async consumir(
        telefoneSessao: string,
        messageIdAtual: string,
        agora: Date,
    ): Promise<PendingAgendamento | null> {
        const draft = this.drafts.get(telefoneSessao);
        if (
            !draft ||
            draft.expiraEm <= agora ||
            draft.mensagemCriacaoId === messageIdAtual
        ) {
            return null;
        }
        this.drafts.delete(telefoneSessao);
        notificarAlteracaoRascunho({ tipo: 'removido', telefoneSessao });
        return { ...draft };
    }

    async listarElegiveisParaLembrete(
        agora: Date,
        criadoAte: Date,
    ): Promise<PendingAgendamento[]> {
        return [...this.drafts.values()]
            .filter(
                (draft) =>
                    draft.lembreteEnviadoEm == null &&
                    draft.expiraEm.getTime() >=
                        agora.getTime() + REMINDER_MIN_EXPIRY_MARGIN_MS &&
                    draft.dataHoraInicio > agora &&
                    draft.criadoEm <= criadoAte,
            )
            .map((draft) => ({ ...draft }));
    }

    async listarParaAgendamento(): Promise<PendingAgendamentoSchedule[]> {
        return [...this.drafts.values()].map(paraAgendamento);
    }

    async reivindicarLembrete(
        telefoneSessao: string,
        agora: Date,
    ): Promise<boolean> {
        const draft = this.drafts.get(telefoneSessao);
        if (
            !draft ||
            draft.lembreteEnviadoEm != null ||
            draft.expiraEm.getTime() <
                agora.getTime() + REMINDER_MIN_EXPIRY_MARGIN_MS ||
            draft.dataHoraInicio <= agora
        ) {
            return false;
        }
        draft.lembreteEnviadoEm = agora;
        notificarAlteracaoRascunho({
            tipo: 'lembrete_reivindicado',
            telefoneSessao,
            agora,
        });
        return true;
    }

    async marcarResumoEnviado(
        telefoneSessao: string,
        mensagemCriacaoId: string,
        agora: Date,
    ): Promise<boolean> {
        const draft = this.drafts.get(telefoneSessao);
        if (
            !draft ||
            draft.mensagemCriacaoId !== mensagemCriacaoId ||
            draft.expiraEm <= agora
        ) {
            return false;
        }
        draft.resumoEnviadoEm = agora;
        notificarAlteracaoRascunho({
            tipo: 'resumo_marcado',
            telefoneSessao,
        });
        return true;
    }

    async listarExpirados(agora: Date): Promise<PendingAgendamento[]> {
        return [...this.drafts.values()]
            .filter((draft) => draft.expiraEm < agora)
            .map((draft) => ({ ...draft }));
    }

    async apagarExpirado(
        telefoneSessao: string,
        agora: Date,
    ): Promise<boolean> {
        const draft = this.drafts.get(telefoneSessao);
        if (!draft || draft.expiraEm >= agora) {
            return false;
        }
        this.drafts.delete(telefoneSessao);
        notificarAlteracaoRascunho({ tipo: 'removido', telefoneSessao });
        return true;
    }

    async restaurarSeAusente(draft: PendingAgendamento): Promise<boolean> {
        if (this.drafts.has(draft.telefoneSessao)) {
            return false;
        }
        this.drafts.set(draft.telefoneSessao, { ...draft });
        notificarAlteracaoRascunho({
            tipo: 'salvo',
            rascunho: paraAgendamento(draft),
        });
        return true;
    }

    async apagar(telefoneSessao: string): Promise<boolean> {
        const existed = this.drafts.has(telefoneSessao);
        this.drafts.delete(telefoneSessao);
        if (existed) {
            notificarAlteracaoRascunho({ tipo: 'removido', telefoneSessao });
        }
        return existed;
    }
}

let repository: PendingAgendamentoRepository =
    process.env.NODE_ENV === 'test'
        ? new InMemoryPendingAgendamentoRepository()
        : new PrismaPendingAgendamentoRepository();

export function getPendingAgendamentoRepository(): PendingAgendamentoRepository {
    return repository;
}

export function setPendingAgendamentoRepository(
    value: PendingAgendamentoRepository,
): void {
    repository = value;
}
