const EMOJIS_CONFIRMATORIOS = /^(?:👍|✅|👌)(?:️|🏻|🏼|🏽|🏾|🏿)?(?:\s*(?:👍|✅|👌)(?:️|🏻|🏼|🏽|🏾|🏿)?)*$/u;
const EMOJIS = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\u20E3\u{1F1E6}-\u{1F1FF}]/gu;
const PONTUACAO = /\p{P}/gu;
const ESPACOS = /\s+/gu;
const RESPOSTAS_AFIRMATIVAS = new Set([
    's',
    'ss',
    'isso',
    'isso mesmo',
    'pode',
    'pode sim',
    'pode confirmar',
    'confirmo',
    'confirmado',
    'confirma',
    'certo',
    'correto',
    'esta certo',
    'esta correto',
    'estao corretos',
    'estao certos',
    'sim estao',
    'sim esta',
    'sim pode',
    'tudo certo',
    'perfeito',
    'ok',
    'okay',
]);
const RESPOSTAS_REPETIDAS = new Set([
    's',
    'ss',
    'pode',
    'pode sim',
    'pode confirmar',
    'confirmo',
    'confirma',
    'sim estao',
    'sim esta',
    'sim pode',
]);

export function normalizarRespostaCurta(texto: string): string {
    if (EMOJIS_CONFIRMATORIOS.test(texto.trim())) {
        return 'sim';
    }

    return texto
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(EMOJIS, '')
        .replace(PONTUACAO, ' ')
        .replace(ESPACOS, ' ')
        .trim();
}

function ehRespostaAfirmativa(
    texto: string,
    respostas: ReadonlySet<string>,
): boolean {
    const normalizado = normalizarRespostaCurta(texto);
    if (normalizado.length > 30) {
        return false;
    }
    return /^s+i+m+$/u.test(normalizado) || respostas.has(normalizado);
}

export function ehConfirmacaoInequivoca(texto: string): boolean {
    return ehRespostaAfirmativa(texto, RESPOSTAS_AFIRMATIVAS);
}

export function ehConfirmacaoRepetida(texto: string): boolean {
    return ehRespostaAfirmativa(texto, RESPOSTAS_REPETIDAS);
}
