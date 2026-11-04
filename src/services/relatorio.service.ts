import { Prisma } from '@prisma/client';
import * as relatorioRepository from '../repositories/relatorio.repository';
import { AppError } from '../lib/app-error';
import * as numeroIgnoradoWhatsAppService from './numero-ignorado-whatsapp.service';
import { calcularIntervaloRelatorio } from '../utils/intervalo-relatorio';
import { chaveDataEmBrasilia } from '../utils/dia-semana';
import {
    canonicalizarTelefoneWhatsApp,
    variantesTelefoneWhatsApp,
} from '../utils/telefone';

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

export interface FiltroClientesInativos {
    diasMin?: number;
    diasMax?: number;
}

export interface RelatorioClientesInativos {
    geradoEm: string;
    filtro: { diasMin: number; diasMax: number };
    total: number;
    truncado: boolean;
    itens: relatorioRepository.ItemClienteInativo[];
}

export interface FiltroSaldoPacotes {
    diasParado?: number;
    somenteParados?: boolean;
}

export interface RelatorioSaldoPacotes {
    geradoEm: string;
    filtro: { diasParado: number; somenteParados: boolean };
    totalAtivos: number;
    totalParados: number;
    total: number;
    truncado: boolean;
    itens: relatorioRepository.ItemSaldoPacote[];
}

function validarDiasInativos(diasMin: number, diasMax: number): void {
    if (!Number.isInteger(diasMin) || diasMin < 1 || diasMin > 365) {
        throw new AppError('diasMin deve ser um inteiro entre 1 e 365.', 400);
    }
    if (!Number.isInteger(diasMax) || diasMax < diasMin || diasMax > 730) {
        throw new AppError(
            'diasMax deve ser um inteiro entre diasMin e 730.',
            400,
        );
    }
}

function validarFiltroSaldoPacotes(
    diasParado: number,
    somenteParados: unknown,
): void {
    if (!Number.isInteger(diasParado) || diasParado < 1 || diasParado > 365) {
        throw new AppError(
            'diasParado deve ser um inteiro entre 1 e 365.',
            400,
        );
    }
    if (typeof somenteParados !== 'boolean') {
        throw new AppError('somenteParados deve ser booleano.', 400);
    }
}

function montarVariantesIgnoradas(telefones: string[]): string[] {
    const variantes = new Set<string>();

    for (const telefone of telefones) {
        const canonico = canonicalizarTelefoneWhatsApp(telefone);
        if (!canonico) continue;

        for (const variante of variantesTelefoneWhatsApp(canonico)) {
            variantes.add(variante);
        }
    }

    return [...variantes];
}

export async function buscarClientesInativos(
    filtro: FiltroClientesInativos = {},
    agora = new Date(),
): Promise<RelatorioClientesInativos> {
    const diasMin = filtro.diasMin ?? 30;
    const diasMax = filtro.diasMax ?? 180;
    validarDiasInativos(diasMin, diasMax);

    const numerosIgnorados = await numeroIgnoradoWhatsAppService.listar();
    const variantesIgnoradas = montarVariantesIgnoradas(
        numerosIgnorados.map((numero) => numero.telefone),
    );
    const resultado = await relatorioRepository.listarClientesInativos(
        agora,
        chaveDataEmBrasilia(agora),
        diasMin,
        diasMax,
        variantesIgnoradas,
    );

    return {
        geradoEm: agora.toISOString(),
        filtro: { diasMin, diasMax },
        total: resultado.total,
        truncado: resultado.total > resultado.itens.length,
        itens: resultado.itens,
    };
}

export async function buscarSaldoPacotes(
    filtro: FiltroSaldoPacotes = {},
    agora = new Date(),
): Promise<RelatorioSaldoPacotes> {
    const diasParado = filtro.diasParado === undefined ? 7 : filtro.diasParado;
    const somenteParados =
        filtro.somenteParados === undefined ? false : filtro.somenteParados;
    validarFiltroSaldoPacotes(diasParado, somenteParados);

    const resultado = await relatorioRepository.listarSaldoPacotes(
        agora,
        chaveDataEmBrasilia(agora),
        diasParado,
        somenteParados,
    );

    return {
        geradoEm: agora.toISOString(),
        filtro: { diasParado, somenteParados },
        ...resultado,
        truncado: resultado.total > resultado.itens.length,
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
