import prisma from '../src/lib/prisma';

async function main(): Promise<void> {
    const servicos = await prisma.servico.findMany({
        where: { nome: 'Corte e Barba' },
        select: { id: true, nome: true },
    });

    if (servicos.length === 0) {
        throw new Error('Serviço "Corte e Barba" não encontrado.');
    }
    if (servicos.length > 1) {
        throw new Error(
            `Mais de um serviço "Corte e Barba" encontrado (${servicos.length}); confirmação necessária.`,
        );
    }

    const [servico] = servicos;

    await prisma.servico.update({
        where: { id: servico.id },
        data: { permiteExtensaoFechamento: true },
    });

    console.log(`Serviço marcado: ${servico.nome} (${servico.id})`);
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
