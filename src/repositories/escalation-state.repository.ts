import { EstadoEscalonamento, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | undefined;

function getPrisma(): PrismaClient {
    prismaClient ??= require('../lib/prisma').default as PrismaClient;
    return prismaClient;
}

export interface EscalationState {
    telefone: string;
    estado: EstadoEscalonamento;
    motivo: string | null;
    escaladoEm: Date | null;
    avisoEsperaEnviadoEm: Date | null;
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
}

function toState(value: {
    telefone: string;
    estado: EstadoEscalonamento;
    motivo: string | null;
    escaladoEm: Date | null;
    avisoEsperaEnviadoEm: Date | null;
    humanoUltimaMensagemEm: Date | null;
    expiraEm: Date | null;
    atualizadoEm: Date;
}): EscalationState {
    return value;
}

export class PrismaEscalationStateRepository
    implements EscalationStateRepository
{
    async obter(
        telefone: string,
        agora: Date,
    ): Promise<EscalationState | null> {
        const state = await getPrisma().escalonamentoWhatsApp.findUnique({
            where: { telefone },
        });

        if (!state) {
            return null;
        }

        if (
            state.estado !== EstadoEscalonamento.BOT &&
            state.expiraEm !== null &&
            state.expiraEm < agora
        ) {
            const expired = await getPrisma().escalonamentoWhatsApp.update({
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

    async escalar(
        telefone: string,
        motivo: string,
        escaladoEm: Date,
        expiraEm: Date,
    ): Promise<{ estado: EscalationState; novaEscalada: boolean }> {
        try {
            const created = await getPrisma().escalonamentoWhatsApp.create({
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

        const claimed = await getPrisma().escalonamentoWhatsApp.updateMany({
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
        const state = await getPrisma().escalonamentoWhatsApp.findUniqueOrThrow({
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
        const result = await getPrisma().escalonamentoWhatsApp.updateMany({
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
        await getPrisma().escalonamentoWhatsApp.updateMany({
            where: {
                telefone,
                estado: EstadoEscalonamento.ESCALADO,
                avisoEsperaEnviadoEm: reivindicadoEm,
            },
            data: { avisoEsperaEnviadoEm: null },
        });
    }
}

export class InMemoryEscalationStateRepository
    implements EscalationStateRepository
{
    private readonly states = new Map<string, EscalationState>();

    async obter(
        telefone: string,
        agora: Date,
    ): Promise<EscalationState | null> {
        const state = this.states.get(telefone);
        if (
            state &&
            state.estado !== EstadoEscalonamento.BOT &&
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
