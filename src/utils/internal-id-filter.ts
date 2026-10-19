const INTERNAL_ID_SOURCE = String.raw`\bc(?=[a-z0-9]*\d)[a-z0-9]{24}\b`;
const INTERNAL_ID_PATTERN = new RegExp(INTERNAL_ID_SOURCE, 'gi');
const INTERNAL_ID_SEPARATOR = String.raw`(?:[ \t]*(?:,|e)[ \t]*|[ \t]+)`;
const INTERNAL_ID_GROUP_PATTERN = new RegExp(
    String.raw`[ \t]*(?:\(${INTERNAL_ID_SOURCE}(?:${INTERNAL_ID_SEPARATOR}${INTERNAL_ID_SOURCE})*\)|\[${INTERNAL_ID_SOURCE}(?:${INTERNAL_ID_SEPARATOR}${INTERNAL_ID_SOURCE})*\])`,
    'gi',
);

export function removerIdsInternos(text: string): {
    text: string;
    count: number;
} {
    const count = text.match(INTERNAL_ID_PATTERN)?.length ?? 0;
    if (count === 0) {
        return { text, count };
    }
    const sanitizedText = text
        .replace(INTERNAL_ID_GROUP_PATTERN, '')
        .replace(INTERNAL_ID_PATTERN, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([,.;:!?])/g, '$1')
        .split(/(\r?\n)/)
        .map((part, index) =>
            index % 2 === 0 ? part.replace(/^[ \t]+|[ \t]+$/g, '') : part,
        )
        .join('');

    return { text: sanitizedText, count };
}
