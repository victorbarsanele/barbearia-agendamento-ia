import { NumeroIgnoradoWhatsApp } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

export interface NumeroIgnoradoWhatsAppRepository {
    listar(): Promise<NumeroIgnoradoWhatsApp[]>;
    criar(data: {
        telefone: string;
        rotulo: string;
    }): Promise<NumeroIgnoradoWhatsApp>;
    excluirPorId(id: string): Promise<boolean>;
    existePorTelefone(telefone: string): Promise<boolean>;
}

export class PrismaNumeroIgnoradoWhatsAppRepository implements NumeroIgnoradoWhatsAppRepository {
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

    async listar(): Promise<NumeroIgnoradoWhatsApp[]> {
        const prisma = await this.getPrisma();
        return prisma.numeroIgnoradoWhatsApp.findMany({
            orderBy: { criadoEm: 'desc' },
        });
    }

    async criar(data: {
        telefone: string;
        rotulo: string;
    }): Promise<NumeroIgnoradoWhatsApp> {
        const prisma = await this.getPrisma();
        return prisma.numeroIgnoradoWhatsApp.create({ data });
    }

    async excluirPorId(id: string): Promise<boolean> {
        const prisma = await this.getPrisma();
        const result = await prisma.numeroIgnoradoWhatsApp.deleteMany({
            where: { id },
        });
        return result.count === 1;
    }

    async existePorTelefone(telefone: string): Promise<boolean> {
        const prisma = await this.getPrisma();
        const result = await prisma.numeroIgnoradoWhatsApp.findUnique({
            where: { telefone },
            select: { id: true },
        });
        return result !== null;
    }
}

let repository: NumeroIgnoradoWhatsAppRepository =
    new PrismaNumeroIgnoradoWhatsAppRepository();

export function getNumeroIgnoradoWhatsAppRepository(): NumeroIgnoradoWhatsAppRepository {
    return repository;
}

export function setNumeroIgnoradoWhatsAppRepository(
    value: NumeroIgnoradoWhatsAppRepository,
): void {
    repository = value;
}
