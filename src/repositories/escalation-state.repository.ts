import { EstadoEscalonamento, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

export interface EscalationState {
    telefone: string;
    estado: EstadoEscalonamento;
    motivo: string | null;
    escaladoEm: Date | null;
    avisoEsperaEnviadoEm: Date | null;
    avisoMidiaEnviadoEm: Date | null;
    humanoUltimaMensagemEm: Date | null;
    expiraEm: Date | null;
    atualizadoEm: Date;
}

export interface EscalationStateRepository {
    obter(
        telefone: string,
        agora: Date,
    ): Promise<EscalationState | null>;
    escalar(
        telefone: string,
        motivo: string,
        escaladoEm: Date,
        expiraEm: Date,
    ): Promise<{ estado: EscalationState; novaEscalada: boolean }>;
    reivindicarAviso(
        telefone: string,
        agora: Date,
    ): Promise<{ reivindicado: boolean; reivindicadoEm: Date }>;
    liberarAviso(
        telefone: string,
        reivindicadoEm: Date,
    ): Promise<void>;
    reivindicarAvisoMidia(
        telefone: string,
        agora: Date,
        cooldownMs: number,
    ): Promise<{ reivindicado: boolean; reivindicadoEm: Date }>;
    liberarAvisoMidia(
        telefone: string,
        reivindicadoEm: Date,
    ): Promise<void>;
    registrarRespostaHumana(
        telefone: string,
        mensagemEm: Date,
        agora: Date,
        ttlMs: number,
    ): Promise<EscalationState>;
    registrarRespostaHumanaIdempotente(
        provedor: string,
        messageId: string,
        telefone: string,
        mensagemEm: Date,
        agora: Date,
        ttlMs: number,
    ): Promise<{ duplicado: boolean; estado: EscalationState | null }>;
}

function toState(value: {
    telefone: string;
    estado: EstadoEscalonamento;
    motivo: string | null;
    escaladoEm: Date | null;
    avisoEsperaEnviadoEm: Date | null;
    avisoMidiaEnviadoEm: Date | null;
    humanoUltimaMensagemEm: Date | null;
    expiraEm: Date | null;
    atualizadoEm: Date;
}): EscalationState {
    return value;
}

export class PrismaEscalationStateRepository
    implements EscalationStateRepository
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

    async obter(
        telefone: string,
        agora: Date,
    ): Promise<EscalationState | null> {
        const prisma = await this.getPrisma();
        const state = await prisma.escalonamentoWhatsApp.findUnique({
            where: { telefone },
        });

        if (!state) {
            return null;
        }

        if (
            state.estado === EstadoEscalonamento.HUMANO_ATIVO &&
            state.expiraEm !== null &&
            state.expiraEm < agora
        ) {
            const expired = await prisma.escalonamentoWhatsApp.update({
                where: { telefone },
                data: {
                    estado: EstadoEscalonamento.BOT,
                    humanoUltimaMensagemEm: null,
                    expiraEm: null,
                },
            });
            return toState(expired);
        }

        if (
            state.estado === EstadoEscalonamento.ESCALADO &&
            state.expiraEm !== null &&
            state.expiraEm < agora
        ) {
            const expired = await prisma.escalonamentoWhatsApp.update({
                where: { telefone },
                data: {
                    estado: EstadoEscalonamento.BOT,
                    motivo: null,
                    avisoEsperaEnviadoEm: null,
                    expiraEm: null,
                },
            });
            return toState(expired);
        }

        return toState(state);
    }

    async registrarRespostaHumana(
        telefone: string,
        mensagemEm: Date,
        agora: Date,
        ttlMs: number,
    ): Promise<EscalationState> {
        const prisma = await this.getPrisma();
        const state = await prisma.escalonamentoWhatsApp.upsert({
            where: { telefone },
            create: {
                telefone,
                estado: EstadoEscalonamento.HUMANO_ATIVO,
                humanoUltimaMensagemEm: mensagemEm,
                expiraEm: new Date(agora.getTime() + ttlMs),
            },
            update: {
                estado: EstadoEscalonamento.HUMANO_ATIVO,
                humanoUltimaMensagemEm: mensagemEm,
                expiraEm: new Date(agora.getTime() + ttlMs),
            },
        });
        return toState(state);
    }

    async registrarRespostaHumanaIdempotente(
        provedor: string,
        messageId: string,
        telefone: string,
        mensagemEm: Date,
        agora: Date,
        ttlMs: number,
    ): Promise<{ duplicado: boolean; estado: EscalationState | null }> {
        const prisma = await this.getPrisma();
        return prisma.$transaction(async (tx) => {
            const inserted = await tx.mensagemWhatsAppProcessada.createMany({
                data: [{ provedor, idMensagem: messageId }],
                skipDuplicates: true,
            });
            if (inserted.count !== 1) {
                return { duplicado: true, estado: null };
            }

            const state = await tx.escalonamentoWhatsApp.upsert({
                where: { telefone },
                create: {
                    telefone,
                    estado: EstadoEscalonamento.HUMANO_ATIVO,
                    humanoUltimaMensagemEm: mensagemEm,
                    expiraEm: new Date(agora.getTime() + ttlMs),
                },
                update: {
                    estado: EstadoEscalonamento.HUMANO_ATIVO,
                    humanoUltimaMensagemEm: mensagemEm,
                    expiraEm: new Date(agora.getTime() + ttlMs),
                },
            });
            return { duplicado: false, estado: toState(state) };
        });
    }

    async escalar(
        telefone: string,
        motivo: string,
        escaladoEm: Date,
        expiraEm: Date,
    ): Promise<{ estado: EscalationState; novaEscalada: boolean }> {
        const prisma = await this.getPrisma();
        try {
            const created = await prisma.escalonamentoWhatsApp.create({
                data: {
                    telefone,
                    estado: EstadoEscalonamento.ESCALADO,
                    motivo,
                    escaladoEm,
                    expiraEm,
                },
            });
            return { estado: toState(created), novaEscalada: true };
        } catch (error) {
            if (
                !(
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === 'P2002'
                )
            ) {
                throw error;
            }
        }

        const claimed = await prisma.escalonamentoWhatsApp.updateMany({
            where: {
                telefone,
                estado: EstadoEscalonamento.BOT,
            },
            data: {
                estado: EstadoEscalonamento.ESCALADO,
                motivo,
                escaladoEm,
                avisoEsperaEnviadoEm: null,
                humanoUltimaMensagemEm: null,
                expiraEm,
            },
        });
        const state = await prisma.escalonamentoWhatsApp.findUniqueOrThrow({
            where: { telefone },
        });
        return {
            estado: toState(state),
            novaEscalada: claimed.count === 1,
        };
    }

    async reivindicarAviso(
        telefone: string,
        agora: Date,
    ): Promise<{ reivindicado: boolean; reivindicadoEm: Date }> {
        const prisma = await this.getPrisma();
        const result = await prisma.escalonamentoWhatsApp.updateMany({
            where: {
                telefone,
                estado: EstadoEscalonamento.ESCALADO,
                avisoEsperaEnviadoEm: null,
            },
            data: { avisoEsperaEnviadoEm: agora },
        });
        return { reivindicado: result.count === 1, reivindicadoEm: agora };
    }

    async liberarAviso(
        telefone: string,
        reivindicadoEm: Date,
    ): Promise<void> {
        const prisma = await this.getPrisma();
        await prisma.escalonamentoWhatsApp.updateMany({
            where: {
                telefone,
                estado: EstadoEscalonamento.ESCALADO,
                avisoEsperaEnviadoEm: reivindicadoEm,
            },
            data: { avisoEsperaEnviadoEm: null },
        });
    }

    async reivindicarAvisoMidia(
        telefone: string,
        agora: Date,
        cooldownMs: number,
    ): Promise<{ reivindicado: boolean; reivindicadoEm: Date }> {
        // Linha BOT criada por mídia é intencional; leitores não usam existência da linha para escalonar.
        const prisma = await this.getPrisma();
        const limite = new Date(agora.getTime() - cooldownMs);

        try {
            await prisma.escalonamentoWhatsApp.create({
                data: {
                    telefone,
                    avisoMidiaEnviadoEm: agora,
                },
            });
            return { reivindicado: true, reivindicadoEm: agora };
        } catch (error) {
            if (
                !(
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === 'P2002'
                )
            ) {
                throw error;
            }
        }

        const result = await prisma.escalonamentoWhatsApp.updateMany({
            where: {
                telefone,
                estado: EstadoEscalonamento.BOT,
                OR: [
                    { avisoMidiaEnviadoEm: null },
                    { avisoMidiaEnviadoEm: { lte: limite } },
                ],
            },
            data: { avisoMidiaEnviadoEm: agora },
        });
        return { reivindicado: result.count === 1, reivindicadoEm: agora };
    }

    async liberarAvisoMidia(
        telefone: string,
        reivindicadoEm: Date,
    ): Promise<void> {
        const prisma = await this.getPrisma();
        await prisma.escalonamentoWhatsApp.updateMany({
            where: {
                telefone,
                avisoMidiaEnviadoEm: reivindicadoEm,
            },
            data: { avisoMidiaEnviadoEm: null },
        });
    }
}

export class InMemoryEscalationStateRepository
    implements EscalationStateRepository
{
    private readonly states = new Map<string, EscalationState>();
    private readonly processedMessages = new Set<string>();
    falharProximoTakeover = false;

    async obter(
        telefone: string,
        agora: Date,
    ): Promise<EscalationState | null> {
        const state = this.states.get(telefone);
        if (
            state &&
            state.estado === EstadoEscalonamento.HUMANO_ATIVO &&
            state.expiraEm !== null &&
            state.expiraEm < agora
        ) {
            state.estado = EstadoEscalonamento.BOT;
            state.humanoUltimaMensagemEm = null;
            state.expiraEm = null;
            state.atualizadoEm = agora;
        } else if (
            state &&
            state.estado === EstadoEscalonamento.ESCALADO &&
            state.expiraEm !== null &&
            state.expiraEm < agora
        ) {
            state.estado = EstadoEscalonamento.BOT;
            state.motivo = null;
            state.avisoEsperaEnviadoEm = null;
            state.expiraEm = null;
            state.atualizadoEm = agora;
        }
        return state ? { ...state } : null;
    }

    async registrarRespostaHumana(
        telefone: string,
        mensagemEm: Date,
        agora: Date,
        ttlMs: number,
    ): Promise<EscalationState> {
        const current = this.states.get(telefone);
        const state: EscalationState = {
            telefone,
            estado: EstadoEscalonamento.HUMANO_ATIVO,
            motivo: current?.motivo ?? null,
            escaladoEm: current?.escaladoEm ?? null,
            avisoEsperaEnviadoEm: current?.avisoEsperaEnviadoEm ?? null,
            avisoMidiaEnviadoEm: current?.avisoMidiaEnviadoEm ?? null,
            humanoUltimaMensagemEm: mensagemEm,
            expiraEm: new Date(agora.getTime() + ttlMs),
            atualizadoEm: agora,
        };
        this.states.set(telefone, state);
        return { ...state };
    }

    async registrarRespostaHumanaIdempotente(
        provedor: string,
        messageId: string,
        telefone: string,
        mensagemEm: Date,
        agora: Date,
        ttlMs: number,
    ): Promise<{ duplicado: boolean; estado: EscalationState | null }> {
        const key = `${provedor}:${messageId}`;
        if (this.processedMessages.has(key)) {
            return { duplicado: true, estado: null };
        }

        this.processedMessages.add(key);
        try {
            if (this.falharProximoTakeover) {
                this.falharProximoTakeover = false;
                throw new Error('falha simulada no takeover');
            }
            const state = await this.registrarRespostaHumana(
                telefone,
                mensagemEm,
                agora,
                ttlMs,
            );
            return { duplicado: false, estado: state };
        } catch (error) {
            this.processedMessages.delete(key);
            throw error;
        }
    }

    async escalar(
        telefone: string,
        motivo: string,
        escaladoEm: Date,
        expiraEm: Date,
    ): Promise<{ estado: EscalationState; novaEscalada: boolean }> {
        const current = this.states.get(telefone);
        if (current?.estado === EstadoEscalonamento.ESCALADO) {
            return { estado: { ...current }, novaEscalada: false };
        }

        const state: EscalationState = {
            telefone,
            estado: EstadoEscalonamento.ESCALADO,
            motivo,
            escaladoEm,
            avisoEsperaEnviadoEm: null,
            avisoMidiaEnviadoEm: current?.avisoMidiaEnviadoEm ?? null,
            humanoUltimaMensagemEm: null,
            expiraEm,
            atualizadoEm: escaladoEm,
        };
        this.states.set(telefone, state);
        return { estado: { ...state }, novaEscalada: true };
    }

    async reivindicarAviso(
        telefone: string,
        agora: Date,
    ): Promise<{ reivindicado: boolean; reivindicadoEm: Date }> {
        const state = this.states.get(telefone);
        if (
            !state ||
            state.estado !== EstadoEscalonamento.ESCALADO ||
            state.avisoEsperaEnviadoEm !== null
        ) {
            return { reivindicado: false, reivindicadoEm: agora };
        }
        state.avisoEsperaEnviadoEm = agora;
        state.atualizadoEm = agora;
        return { reivindicado: true, reivindicadoEm: agora };
    }

    async liberarAviso(
        telefone: string,
        reivindicadoEm: Date,
    ): Promise<void> {
        const state = this.states.get(telefone);
        if (
            state?.estado === EstadoEscalonamento.ESCALADO &&
            state.avisoEsperaEnviadoEm?.getTime() === reivindicadoEm.getTime()
        ) {
            state.avisoEsperaEnviadoEm = null;
            state.atualizadoEm = new Date();
        }
    }

    async reivindicarAvisoMidia(
        telefone: string,
        agora: Date,
        cooldownMs: number,
    ): Promise<{ reivindicado: boolean; reivindicadoEm: Date }> {
        // Linha BOT criada por mídia é intencional; leitores não usam existência da linha para escalonar.
        const state = this.states.get(telefone);
        const last = state?.avisoMidiaEnviadoEm;
        if (state && state.estado !== EstadoEscalonamento.BOT) {
            return { reivindicado: false, reivindicadoEm: agora };
        }
        if (
            last &&
            agora.getTime() - last.getTime() < cooldownMs
        ) {
            return { reivindicado: false, reivindicadoEm: agora };
        }

        const next: EscalationState = state ?? {
            telefone,
            estado: EstadoEscalonamento.BOT,
            motivo: null,
            escaladoEm: null,
            avisoEsperaEnviadoEm: null,
            avisoMidiaEnviadoEm: null,
            humanoUltimaMensagemEm: null,
            expiraEm: null,
            atualizadoEm: agora,
        };
        next.avisoMidiaEnviadoEm = agora;
        next.atualizadoEm = agora;
        this.states.set(telefone, next);
        return { reivindicado: true, reivindicadoEm: agora };
    }

    async liberarAvisoMidia(
        telefone: string,
        reivindicadoEm: Date,
    ): Promise<void> {
        const state = this.states.get(telefone);
        if (
            state?.avisoMidiaEnviadoEm?.getTime() ===
            reivindicadoEm.getTime()
        ) {
            state.avisoMidiaEnviadoEm = null;
            state.atualizadoEm = new Date();
        }
    }
}

let repository: EscalationStateRepository =
    process.env.NODE_ENV === 'test'
        ? new InMemoryEscalationStateRepository()
        : new PrismaEscalationStateRepository();

export function getEscalationStateRepository(): EscalationStateRepository {
    return repository;
}

export function setEscalationStateRepository(
    value: EscalationStateRepository,
): void {
    repository = value;
}
