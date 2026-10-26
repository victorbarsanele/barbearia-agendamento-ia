export interface DescricaoErroSeguro {
    nome: string;
    codigo?: string;
    alvo?: string | string[];
}

const CODIGO_SEGURO = /^[A-Za-z0-9]{2,12}$/;
const NOME_SEGURO = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ALVO_SEGURO = /^[A-Za-z0-9_]+$/;

function objeto(valor: unknown): Record<string, unknown> | undefined {
    return typeof valor === 'object' && valor !== null
        ? (valor as Record<string, unknown>)
        : undefined;
}

function primeiroCodigo(
    registros: Array<Record<string, unknown> | undefined>,
): string | undefined {
    for (const registro of registros) {
        if (!registro) continue;
        for (const chave of ['code', 'originalCode']) {
            const valor = registro[chave];
            if (typeof valor === 'string' && CODIGO_SEGURO.test(valor)) {
                return valor;
            }
        }
    }
    return undefined;
}

function alvoSeguro(valor: unknown): string | string[] | undefined {
    if (typeof valor === 'string' && ALVO_SEGURO.test(valor)) return valor;
    if (
        Array.isArray(valor) &&
        valor.every(
            (item) => typeof item === 'string' && ALVO_SEGURO.test(item),
        )
    ) {
        return valor as string[];
    }
    return undefined;
}

export function descreverErroSeguro(erro: unknown): DescricaoErroSeguro {
    try {
        const raiz = objeto(erro);
        const causa = objeto(raiz?.cause);
        const meta = objeto(raiz?.meta);
        const erroDriver = objeto(meta?.driverAdapterError);
        const causaDriver = objeto(erroDriver?.cause);
        const nomeRecebido = raiz?.name;
        const nome =
            typeof nomeRecebido === 'string' && NOME_SEGURO.test(nomeRecebido)
                ? nomeRecebido
                : erro instanceof Error
                  ? 'Error'
                  : 'UnknownError';
        const codigo = primeiroCodigo([
            raiz,
            causa,
            meta,
            erroDriver,
            causaDriver,
        ]);
        const alvo = alvoSeguro(meta?.target) ?? alvoSeguro(meta?.column);

        return {
            nome,
            ...(codigo ? { codigo } : {}),
            ...(alvo !== undefined ? { alvo } : {}),
        };
    } catch {
        return { nome: 'UnknownError' };
    }
}
