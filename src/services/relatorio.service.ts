import { Prisma } from '@prisma/client';
import * as relatorioRepository from '../repositories/relatorio.repository';
import { AppError } from '../lib/app-error';
import * as numeroIgnoradoWhatsAppService from './numero-ignorado-whatsapp.service';
import { calcularIntervaloRelatorio } from '../utils/intervalo-relatorio';
import { chaveDataEmBrasilia } from '../utils/dia-semana';
import { getReativacaoRepository } from '../repositories/reativacao.repository';
import {
    calcularFimCooldown,
    estaEmCooldown,
    normalizarTentativaReativacao,
} from '../utils/reativacao-cooldown';
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

export type OrigemRelatorioAgendamentos =
    | 'WHATSAPP_IA'
    | 'PAINEL'
    | 'NAO_INFORMADO';

export interface ItemRelatorioOrigemAgendamentos {
    origem: OrigemRelatorioAgendamentos;
    total: number;
    ativos: number;
    cancelados: number;
    percentual: number;
}

export interface RelatorioOrigemAgendamentos {
    de: string;
    ate: string;
    total: number;
    origens: ItemRelatorioOrigemAgendamentos[];
}

export interface FiltroClientesInativos {
    diasMin?: number;
    diasMax?: number;
}

export interface ItemRelatorioClienteInativo extends Omit<
    relatorioRepository.ItemClienteInativo,
    'optOutMarketing'
> {
    ultimaTentativa: {
        status: string;
        criadoEm: string;
    } | null;
    podeReativar: boolean;
    reativacaoBloqueio: 'OPT_OUT' | 'COOLDOWN' | null;
    reativacaoBloqueadaAte: string | null;
}

export interface RelatorioClientesInativos {
    geradoEm: string;
    filtro: { diasMin: number; diasMax: number };
    total: number;
    truncado: boolean;
    itens: ItemRelatorioClienteInativo[];
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
    const tentativas =
        await getReativacaoRepository().buscarResumoReativacoesPorClientes(
            resultado.itens.map((item) => item.clienteId),
            agora,
        );

    const itens = resultado.itens.map((item) => {
        const { optOutMarketing, ...dadosCliente } = item;
        const resumo = tentativas.get(item.clienteId);
        const ultimaNaoFalhada = normalizarTentativaReativacao(
            resumo?.ultimaNaoFalhada ?? null,
            agora,
        );
        const ultimaTentativa = normalizarTentativaReativacao(
            resumo?.ultimaTentativa ?? null,
            agora,
        );
        const fimCooldown = calcularFimCooldown(ultimaNaoFalhada, agora);
        const emCooldown = estaEmCooldown(ultimaNaoFalhada, agora);
        const bloqueio: ItemRelatorioClienteInativo['reativacaoBloqueio'] =
            optOutMarketing ? 'OPT_OUT' : emCooldown ? 'COOLDOWN' : null;

        return {
            ...dadosCliente,
            ultimaTentativa: ultimaTentativa
                ? {
                      status: ultimaTentativa.status,
                      criadoEm: ultimaTentativa.criadoEm.toISOString(),
                  }
                : null,
            podeReativar: bloqueio === null,
            reativacaoBloqueio: bloqueio,
            reativacaoBloqueadaAte:
                emCooldown && fimCooldown ? fimCooldown.toISOString() : null,
        };
    });

    return {
        geradoEm: agora.toISOString(),
        filtro: { diasMin, diasMax },
        total: resultado.total,
        truncado: resultado.total > resultado.itens.length,
        itens,
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

export async function buscarAgendamentosPorOrigem(
    de: string,
    ate: string,
): Promise<RelatorioOrigemAgendamentos> {
    const intervalo = calcularIntervaloRelatorio(de, ate);
    const grupos = await relatorioRepository.agruparAgendamentosPorOrigem(
        intervalo.inicio,
        intervalo.fimExclusivo,
    );
    const origens: OrigemRelatorioAgendamentos[] = [
        'WHATSAPP_IA',
        'PAINEL',
        'NAO_INFORMADO',
    ];
    const contagens = new Map(
        origens.map((origem) => [origem, { total: 0, cancelados: 0 }]),
    );

    for (const grupo of grupos) {
        const origem = grupo.origem ?? 'NAO_INFORMADO';
        const contagem = contagens.get(origem)!;
        const quantidade = grupo._count._all;
        contagem.total += quantidade;
        if (grupo.status === 'CANCELADO') {
            contagem.cancelados += quantidade;
        }
    }

    const total = origens.reduce(
        (soma, origem) => soma + contagens.get(origem)!.total,
        0,
    );

    return {
        de,
        ate,
        total,
        origens: origens.map((origem) => {
            const contagem = contagens.get(origem)!;
            return {
                origem,
                total: contagem.total,
                ativos: contagem.total - contagem.cancelados,
                cancelados: contagem.cancelados,
                percentual:
                    total === 0
                        ? 0
                        : Number(((contagem.total / total) * 100).toFixed(1)),
            };
        }),
    };
}
