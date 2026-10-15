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
    apagar(telefoneSessao: string): Promise<void>;
}

function toPending(value: PendingAgendamento): PendingAgendamento {
    return value;
}

export class PrismaPendingAgendamentoRepository
    implements PendingAgendamentoRepository
{
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
            create: draft,
            update: {
                nomeCliente: draft.nomeCliente,
                telefoneCliente: draft.telefoneCliente,
                servicoId: draft.servicoId,
                dataHoraInicio: draft.dataHoraInicio,
                mensagemCriacaoId: draft.mensagemCriacaoId,
                criadoEm: draft.criadoEm ?? new Date(),
                expiraEm: draft.expiraEm,
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
                "expiraEm"
            )
            VALUES (
                ${draft.telefoneSessao},
                ${draft.nomeCliente},
                ${draft.telefoneCliente},
                ${draft.servicoId},
                ${draft.dataHoraInicio},
                ${draft.mensagemCriacaoId},
                ${draft.criadoEm},
                ${draft.expiraEm}
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
                "expiraEm"
        `;
        return rows[0] ? toPending(rows[0]) : null;
    }

    async apagar(telefoneSessao: string): Promise<void> {
        const prisma = await this.getPrisma();
        await prisma.rascunhoAgendamento.deleteMany({
            where: { telefoneSessao },
        });
    }
}

export class InMemoryPendingAgendamentoRepository
    implements PendingAgendamentoRepository
{
    private readonly drafts = new Map<string, PendingAgendamento>();

    async salvar(
        draft: Omit<PendingAgendamento, 'criadoEm'> & { criadoEm?: Date },
    ): Promise<PendingAgendamento> {
        const saved: PendingAgendamento = {
            ...draft,
            criadoEm: draft.criadoEm ?? new Date(),
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

    async restaurarSeAusente(draft: PendingAgendamento): Promise<boolean> {
        if (this.drafts.has(draft.telefoneSessao)) {
            return false;
        }
        this.drafts.set(draft.telefoneSessao, { ...draft });
        return true;
    }

    async apagar(telefoneSessao: string): Promise<void> {
        this.drafts.delete(telefoneSessao);
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
