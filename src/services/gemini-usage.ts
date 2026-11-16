import {
    MediaModality,
    type GenerateContentResponseUsageMetadata,
} from '@google/genai';

export type GeminiUsagePurpose = 'transcricao' | 'conversa';
export type GeminiUsageOrigin = 'texto' | 'audio';
export type GeminiUsageModality = 'TEXT' | 'AUDIO' | 'IMAGE';

export interface GeminiUsageContext {
    origem: GeminiUsageOrigin;
    correlationId: string;
}

export interface GeminiUsagePayloadInput extends GeminiUsageContext {
    finalidade: GeminiUsagePurpose;
    modelo: string;
    iteracao: number;
    tentativas: number;
    usageMetadata?: GenerateContentResponseUsageMetadata;
    duracaoAudioSeg?: number;
}

export interface GeminiUsagePayload {
    evt: 'gemini_usage';
    finalidade: GeminiUsagePurpose;
    origem: GeminiUsageOrigin;
    modelo: string;
    iteracao: number;
    tentativas: number;
    correlationId: string;
    promptTokens: number | null;
    outputTokens: number | null;
    thoughtsTokens: number | null;
    cachedTokens: number | null;
    toolUsePromptTokens: number | null;
    totalTokens: number | null;
    promptPorModalidade: Partial<Record<GeminiUsageModality, number>>;
    duracaoAudioSeg?: number;
}

export function montarPayloadGeminiUsage(
    input: GeminiUsagePayloadInput,
): GeminiUsagePayload {
    const promptPorModalidade: Partial<Record<GeminiUsageModality, number>> =
        {};

    for (const detail of input.usageMetadata?.promptTokensDetails ?? []) {
        const modality = detail.modality;
        if (detail.tokenCount === undefined) {
            continue;
        }
        if (modality === MediaModality.TEXT) {
            promptPorModalidade.TEXT =
                (promptPorModalidade.TEXT ?? 0) + detail.tokenCount;
        } else if (modality === MediaModality.AUDIO) {
            promptPorModalidade.AUDIO =
                (promptPorModalidade.AUDIO ?? 0) + detail.tokenCount;
        } else if (modality === MediaModality.IMAGE) {
            promptPorModalidade.IMAGE =
                (promptPorModalidade.IMAGE ?? 0) + detail.tokenCount;
        }
    }

    return {
        evt: 'gemini_usage',
        finalidade: input.finalidade,
        origem: input.origem,
        modelo: input.modelo,
        iteracao: input.iteracao,
        tentativas: input.tentativas,
        correlationId: input.correlationId,
        promptTokens: input.usageMetadata?.promptTokenCount ?? null,
        outputTokens: input.usageMetadata?.candidatesTokenCount ?? null,
        thoughtsTokens: input.usageMetadata?.thoughtsTokenCount ?? null,
        cachedTokens: input.usageMetadata?.cachedContentTokenCount ?? null,
        toolUsePromptTokens:
            input.usageMetadata?.toolUsePromptTokenCount ?? null,
        totalTokens: input.usageMetadata?.totalTokenCount ?? null,
        promptPorModalidade,
        ...(input.finalidade === 'transcricao' &&
        input.duracaoAudioSeg !== undefined
            ? { duracaoAudioSeg: input.duracaoAudioSeg }
            : {}),
    };
}

export function emitirLogGeminiUsage(input: GeminiUsagePayloadInput): void {
    try {
        if (process.env.GEMINI_USAGE_LOG_ENABLED === 'false') {
            return;
        }

        console.info(JSON.stringify(montarPayloadGeminiUsage(input)));
    } catch {}
}
