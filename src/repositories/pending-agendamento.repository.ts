import type { PrismaClient } from '@prisma/client';

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
        return result === 1;
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
                expiraEm: { gt: agora },
                criadoEm: { lte: criadoAte },
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
                expiraEm: { gt: agora },
            },
            data: { lembreteEnviadoEm: agora },
        });
        return result.count === 1;
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
        return result.count === 1;
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
        return result.count === 1;
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
        return rows[0] ? toPending(rows[0]) : null;
    }

    async apagar(telefoneSessao: string): Promise<boolean> {
        const prisma = await this.getPrisma();
        const result = await prisma.rascunhoAgendamento.deleteMany({
            where: { telefoneSessao },
        });
        return result.count > 0;
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
                    draft.expiraEm > agora &&
                    draft.criadoEm <= criadoAte,
            )
            .map((draft) => ({ ...draft }));
    }

    async reivindicarLembrete(
        telefoneSessao: string,
        agora: Date,
    ): Promise<boolean> {
        const draft = this.drafts.get(telefoneSessao);
        if (
            !draft ||
            draft.lembreteEnviadoEm != null ||
            draft.expiraEm <= agora
        ) {
            return false;
        }
        draft.lembreteEnviadoEm = agora;
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
        return true;
    }

    async restaurarSeAusente(draft: PendingAgendamento): Promise<boolean> {
        if (this.drafts.has(draft.telefoneSessao)) {
            return false;
        }
        this.drafts.set(draft.telefoneSessao, { ...draft });
        return true;
    }

    async apagar(telefoneSessao: string): Promise<boolean> {
        const existed = this.drafts.has(telefoneSessao);
        this.drafts.delete(telefoneSessao);
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
