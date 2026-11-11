import type { IdentidadeBarbeiro } from './barbeiro-identidade';
import { normalizarSemAcentos } from './nome-cliente';

const LEGACY_REQUEST_PATTERN =
    /\b(?:atendente|humano|pessoa real|falar com o barbeiro|falar com alguem)\b/u;
const CONTACT_TARGETS = [
    'barbeiro',
    'dono',
    'responsavel',
    'humano',
    'atendente',
    'pessoa real',
    'pessoa',
    'alguem',
];
const CONTACT_VERBS =
    '(?:responder|responda|responde|respondesse|atender|atenda|atende|atendesse)';
const BOOKING_EXCEPTION_PATTERN =
    /\b(?:so|apenas) uma excecao\b|\b(?:quero|queria|gostaria de|preciso de|pode|poderia|faz|fazer|abre|abrir|me da|da para|da pra|tem como)\b(?:\s+[\p{L}\p{N}]+){0,4}\s+(?:uma\s+)?excecao\b|\b(?:tem como|da para|da pra|pode|poderia|consegue|quero|queria|gostaria de|preciso de|faz|fazer|me|me da|abre|abrir)\b(?:\s+[\p{L}\p{N}]+){0,4}\s+(?:encaixe|encaixar|encaixa)\b|\b(?:encaixe|encaixar|encaixa)\b(?:\s+[\p{L}\p{N}]+){0,3}\s+(?:so eu|para mim|pra mim)\b|\b(?:tem como|da para|da pra|pode|poderia|consegue|quero|queria|gostaria de|preciso de)\s+(?:dar|da) um jeito\b|\b(?:quero|queria|gostaria de|preciso de|pode|poderia|faz|fazer|abre|abrir|me da)\b(?:\s+[\p{L}\p{N}]+){0,4}\s+excecao\b/u;
const NEGATED_BOOKING_REQUEST_PATTERN =
    /\b(?:nao|nunca)\s+(?:quero|queria|gostaria|preciso|precisa|posso|pode|tem|consigo)\b(?:\s+[\p{L}\p{N}]+){0,4}\s+(?:encaixe|encaixar|encaixa|excecao|dar um jeito)\b|\bsem\s+(?:(?:um|uma)\s+)?(?:encaixe|excecao)\b/u;
const ENCAIXE_REQUEST_PATTERN =
    // Encaixe segue para avaliação do barbeiro mesmo em forma de consulta.
    /\btem\s+encaixe\b|\b(?:pode\s+)?(?:verificar|verifica|checar|consultar)\b(?:\s+[\p{L}\p{N}]+){0,4}\s+encaixe\b/u;
const OUT_OF_HOURS_REQUEST_PATTERN =
    /\b(?:me atender|me encaixar|me agendar|atender|encaixar|agendar)\b(?:\s+[\p{L}\p{N}]+){0,3}\s+fora do (?:expediente|horario|agenda)\b|\bfora do (?:expediente|horario|agenda)\b(?:\s+[\p{L}\p{N}]+){0,3}\s+(?:me atender|me encaixar|me agendar|atender|encaixar|agendar)\b/u;
const NEGATED_OUT_OF_HOURS_REQUEST_PATTERN =
    /\b(?:nao|nunca)\s+(?:quero|queria|gostaria|preciso|precisa|posso|pode|consigo)\b(?:\s+[\p{L}\p{N}]+){0,4}\s+(?:me atender|me encaixar|me agendar|atender|encaixar|agendar)\b(?:\s+[\p{L}\p{N}]+){0,3}\s+fora do (?:expediente|horario|agenda)\b/u;

function normalizarTexto(value: string): string {
    return normalizarSemAcentos(value)
        .toLocaleLowerCase('pt-BR')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/gu, ' ');
}

function escaparRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function criarPadraoAlvo(identidade: IdentidadeBarbeiro | null): string {
    const alvos = new Set(CONTACT_TARGETS);
    for (const nome of identidade?.nomesAceitos ?? []) {
        const nomeNormalizado = normalizarTexto(nome);
        if (nomeNormalizado) {
            alvos.add(nomeNormalizado);
        }
    }

    return [...alvos]
        .sort((left, right) => right.length - left.length)
        .map(escaparRegex)
        .join('|');
}

export function detectarPedidoHumano(
    message: string,
    identidade: IdentidadeBarbeiro | null,
): boolean {
    const text = normalizarTexto(message);
    const target = criarPadraoAlvo(identidade);
    const negatedContactPattern = new RegExp(
        `\\b(?:nao|nunca)\\s+(?:quero|queria|gostaria|preciso|precisa|necessito|necessita|posso|pode|tem|consigo)\\b(?:\\s+[\\p{L}\\p{N}]+){0,4}\\s+(?:${target})\\b|\\bsem\\s+(?:(?:o|a|um|uma)\\s+)?(?:${target})\\b`,
        'u',
    );

    if (
        negatedContactPattern.test(text) ||
        NEGATED_BOOKING_REQUEST_PATTERN.test(text) ||
        NEGATED_OUT_OF_HOURS_REQUEST_PATTERN.test(text)
    ) {
        return false;
    }

    if (
        LEGACY_REQUEST_PATTERN.test(text) ||
        BOOKING_EXCEPTION_PATTERN.test(text) ||
        ENCAIXE_REQUEST_PATTERN.test(text) ||
        OUT_OF_HOURS_REQUEST_PATTERN.test(text)
    ) {
        return true;
    }

    const targetPatterns = [
        new RegExp(
            `\\b(?:falar|conversar)\\s+com\\s+(?:(?:o|a|um|uma)\\s+)?(?:${target})\\b`,
            'u',
        ),
        new RegExp(
            `\\b(?:me\\s+)?(?:chamar|chama|chame)\\s+(?:(?:o|a|um|uma)\\s+)?(?:${target})\\b`,
            'u',
        ),
        new RegExp(
            `\\b(?:me\\s+)?(?:passa|passe|passar)\\s+(?:pro|pra|para)\\s+(?:(?:o|a)\\s+)?(?:${target})\\b`,
            'u',
        ),
        new RegExp(
            `\\b(?:${target})\\b(?:\\s+[\\p{L}\\p{N}]+){0,3}\\s+me\\s+${CONTACT_VERBS}\\b`,
            'u',
        ),
        new RegExp(
            `\\b(?:ser\\s+)?(?:atendido|atendida)\\s+(?:por|pelo|pela)\\s+(?:${target})\\b`,
            'u',
        ),
    ];

    return targetPatterns.some((pattern) => pattern.test(text));
}
