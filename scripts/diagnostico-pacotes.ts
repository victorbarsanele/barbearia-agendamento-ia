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
            quantidadeTotal: true,
            quantidadeRestante: true,
            pacoteId: true,
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
        by: ['pacoteClienteId'],
        where: {
            pacoteClienteId: { not: null },
            concluido: true,
        },
        _count: { _all: true },
    });
    const mapaConcluidos = new Map<string, number>();
    for (const item of concluidosPorPacoteCliente) {
        if (item.pacoteClienteId) {
            mapaConcluidos.set(item.pacoteClienteId, item._count._all);
        }
    }

    const totalPacotesClientes = pacotesClientes.length;

    const comMultiplosServicos = pacotesClientes.filter(
        (item) => item.pacote.servicos.length > 1,
    );

    const divergencias = comMultiplosServicos
        .map((item) => {
            const consumidos = item.quantidadeTotal - item.quantidadeRestante;
            const concluidos = mapaConcluidos.get(item.id) ?? 0;
            return {
                pacoteClienteId: item.id,
                pacoteId: item.pacoteId,
                pacoteNome: item.pacote.nome,
                status: item.status,
                quantidadeTotal: item.quantidadeTotal,
                quantidadeRestante: item.quantidadeRestante,
                consumidoCalculado: consumidos,
                agendamentosConcluidos: concluidos,
                bate: consumidos === concluidos,
                servicosNoPacote: item.pacote.servicos.length,
            };
        })
        .filter((item) => !item.bate);

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
            const concluidos = mapaConcluidos.get(item.id) ?? 0;
            const consumidos = item.quantidadeTotal - item.quantidadeRestante;
            console.log(
                `  pacoteClienteId=${item.id} pacote="${item.pacote.nome}" status=${item.status} ` +
                    `servicos=${item.pacote.servicos.length} quantidadeTotal=${item.quantidadeTotal} ` +
                    `quantidadeRestante=${item.quantidadeRestante} consumidoCalculado=${consumidos} ` +
                    `agendamentosConcluidos=${concluidos} bate=${consumidos === concluidos}`,
            );
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
