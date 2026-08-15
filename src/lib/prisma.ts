import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config({ override: true });

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao definida no ambiente.');
}

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
    adapter,
});

export default prisma;
