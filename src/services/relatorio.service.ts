import { Prisma } from '@prisma/client';
import * as relatorioRepository from '../repositories/relatorio.repository';
import { calcularIntervaloRelatorio } from '../utils/intervalo-relatorio';

export interface ItemRelatorioAtendimentos {
    servicoId: string;
    nome: string;
    quantidade: number;
    quantidadeAvulso: number;
    quantidadePacote: number;
    valorEstimado: string | null;
    semPreco: number;
}

export interface RelatorioAtendimentos {
    periodo: { de: string; ate: string };
    geradoEm: string;
    itens: ItemRelatorioAtendimentos[];
    total: {
        quantidade: number;
        valorEstimado: string | null;
        semPreco: number;
    };
}

export async function buscarAtendimentos(
    de: string,
    ate: string,
    agora = new Date(),
): Promise<RelatorioAtendimentos> {
    const intervalo = calcularIntervaloRelatorio(de, ate);
    const itens = await relatorioRepository.agregarAtendimentos(
        intervalo.inicio,
        intervalo.fimExclusivo,
        agora,
    );

    let quantidade = 0;
    let semPreco = 0;
    let temPreco = false;
    let valorEstimado = new Prisma.Decimal(0);

    for (const item of itens) {
        quantidade += item.quantidade;
        semPreco += item.semPreco;
        if (item.valorEstimado !== null) {
            temPreco = true;
            valorEstimado = valorEstimado.plus(item.valorEstimado);
        }
    }

    return {
        periodo: { de, ate },
        geradoEm: agora.toISOString(),
        itens,
        total: {
            quantidade,
            valorEstimado: temPreco ? valorEstimado.toFixed(2) : null,
            semPreco,
        },
    };
}
