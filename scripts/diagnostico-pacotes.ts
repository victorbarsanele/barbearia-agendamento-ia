// Script de diagnóstico read-only: viabilidade de Pacote com múltiplos serviços/quantidades.
// Uso: npx tsx scripts/diagnostico-pacotes.ts
// Regra: apenas findMany/count/groupBy. Nenhuma escrita no banco.
import prisma from '../src/lib/prisma';

async function main() {
    const porStatus = await prisma.pacoteCliente.groupBy({
        by: ['status'],
        _count: { _all: true },
    });

    const pacotesClientes = await prisma.pacoteCliente.findMany({
        select: {
            id: true,
            status: true,
            pacoteId: true,
            servicos: {
                select: {
                    servicoId: true,
                    quantidadeTotal: true,
                    usosAnteriores: true,
                    quantidadeRestante: true,
                },
            },
            pacote: {
                select: {
                    id: true,
                    nome: true,
                    servicos: { select: { servicoId: true } },
                },
            },
        },
    });

    const concluidosPorPacoteCliente = await prisma.agendamento.groupBy({
        by: ['pacoteClienteId', 'servicoId'],
        where: {
            pacoteClienteId: { not: null },
            concluido: true,
        },
        _count: { _all: true },
    });
    const mapaConcluidos = new Map<string, number>();
    for (const item of concluidosPorPacoteCliente) {
        if (item.pacoteClienteId) {
            mapaConcluidos.set(
                `${item.pacoteClienteId}:${item.servicoId}`,
                item._count._all,
            );
        }
    }

    const totalPacotesClientes = pacotesClientes.length;

    const comMultiplosServicos = pacotesClientes.filter(
        (item) => item.pacote.servicos.length > 1,
    );

    const divergencias = pacotesClientes.flatMap((item) =>
        item.servicos
            .map((servico) => {
                const concluidos =
                    mapaConcluidos.get(`${item.id}:${servico.servicoId}`) ?? 0;
                const consumidos =
                    servico.quantidadeTotal -
                    servico.usosAnteriores -
                    servico.quantidadeRestante;
                return {
                    pacoteClienteId: item.id,
                    pacoteId: item.pacoteId,
                    pacoteNome: item.pacote.nome,
                    status: item.status,
                    servicoId: servico.servicoId,
                    quantidadeTotal: servico.quantidadeTotal,
                    usosAnteriores: servico.usosAnteriores,
                    quantidadeRestante: servico.quantidadeRestante,
                    consumidoCalculado: consumidos,
                    agendamentosConcluidos: concluidos,
                    bate: consumidos === concluidos,
                    servicosNoPacote: item.pacote.servicos.length,
                };
            })
            .filter((servico) => !servico.bate),
    );

    console.log('=== DIAGNÓSTICO PACOTES (read-only) ===');
    console.log('\nTotal de PacoteCliente por status:');
    for (const grupo of porStatus) {
        console.log(`  ${grupo.status}: ${grupo._count._all}`);
    }

    console.log(`\nTotal geral de PacoteCliente: ${totalPacotesClientes}`);
    console.log(
        `PacoteCliente cujo Pacote tem mais de 1 serviço vinculado: ${comMultiplosServicos.length}`,
    );

    if (comMultiplosServicos.length > 0) {
        console.log('\nDetalhe dos PacoteCliente com múltiplos serviços:');
        for (const item of comMultiplosServicos) {
            for (const servico of item.servicos) {
                const concluidos =
                    mapaConcluidos.get(`${item.id}:${servico.servicoId}`) ?? 0;
                const consumidos =
                    servico.quantidadeTotal -
                    servico.usosAnteriores -
                    servico.quantidadeRestante;
                console.log(
                    `  pacoteClienteId=${item.id} pacote="${item.pacote.nome}" status=${item.status} ` +
                        `servicoId=${servico.servicoId} quantidadeTotal=${servico.quantidadeTotal} ` +
                        `usosAnteriores=${servico.usosAnteriores} quantidadeRestante=${servico.quantidadeRestante} ` +
                        `consumidoCalculado=${consumidos} agendamentosConcluidos=${concluidos} ` +
                        `bate=${consumidos === concluidos}`,
                );
            }
        }
    }

    console.log(
        `\nDivergências (consumidoCalculado != agendamentosConcluidos) entre múltiplos serviços: ${divergencias.length}`,
    );
    if (divergencias.length > 0) {
        console.log(JSON.stringify(divergencias, null, 2));
    }

    console.log('\n=== FIM DO DIAGNÓSTICO ===');
}

main()
    .catch((error) => {
        console.error('[DIAGNOSTICO PACOTES] Erro:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
