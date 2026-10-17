export type ResultadoValidacaoNomeCliente =
    | { ok: true; nome: string }
    | {
          ok: false;
          motivo: 'nome_nao_informado' | 'nome_invalido' | 'nome_longo';
      };

const PLACEHOLDERS = new Set([
    'cliente',
    'nome',
    'nome cliente',
    'sem nome',
    'n/a',
    'na',
    'desconhecido',
    'anonimo',
    'usuario',
    'nao informado',
    'nao informada',
    'nao sei',
    'sem identificacao',
    'unknown',
    'anonymous',
    'user',
    '-',
    '.',
    'x',
]);

function normalizarPalavra(value: string): string {
    return value
        .replace(/[’]/gu, "'")
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLocaleLowerCase('pt-BR');
}

function extrairPalavras(value: string): string[] {
    return (
        normalizarPalavra(value).match(/[\p{L}]+(?:['-][\p{L}]+)*/gu) ?? []
    );
}

export function validarNomeCliente(value: unknown): ResultadoValidacaoNomeCliente {
    if (typeof value !== 'string') {
        return { ok: false, motivo: 'nome_nao_informado' };
    }

    const nome = value.trim().replace(/\s+/gu, ' ').replace(/[’]/gu, "'");
    if (!nome) {
        return { ok: false, motivo: 'nome_nao_informado' };
    }
    if (nome.length > 120) {
        return { ok: false, motivo: 'nome_longo' };
    }

    const normalizado = normalizarPalavra(nome);
    const palavras = nome.split(' ');
    if (
        PLACEHOLDERS.has(normalizado) ||
        palavras.length < 2 ||
        palavras.some((palavra) => !/^\p{L}+(?:['-]\p{L}+)*$/u.test(palavra))
    ) {
        return { ok: false, motivo: 'nome_invalido' };
    }

    return { ok: true, nome };
}

export function nomeClienteInformadoPeloCliente(
    nome: string,
    mensagensCliente: readonly string[] | null | undefined,
): boolean {
    if (!mensagensCliente?.length) {
        return false;
    }

    const palavrasNome = extrairPalavras(nome);
    const palavrasInformadas = new Set(
        mensagensCliente.flatMap(extrairPalavras),
    );

    return (
        palavrasNome.length > 0 &&
        palavrasNome.every((palavra) => palavrasInformadas.has(palavra))
    );
}
