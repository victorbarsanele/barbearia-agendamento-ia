/// <reference types="node" />

import { hash } from 'bcryptjs';

async function main(): Promise<void> {
    const password = process.argv[2];

    if (!password) {
        console.error('Uso: npx tsx scripts/gerar-hash.ts <senha>');
        process.exit(1);
    }

    const passwordHash = await hash(password, 10);
    console.log(passwordHash);
}

void main();
