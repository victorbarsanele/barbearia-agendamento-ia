import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaModality } from '@google/genai';
import {
    emitirLogGeminiUsage,
    montarPayloadGeminiUsage,
    type GeminiUsagePayloadInput,
} from './gemini-usage';

const baseInput: GeminiUsagePayloadInput = {
    finalidade: 'conversa',
    origem: 'texto',
    modelo: 'gemini-3.1-flash-lite',
    iteracao: 1,
    tentativas: 2,
    correlationId: '4a64e5f1-d7fb-4bdb-beb1-f459af1c02ef',
};

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('gemini usage payload', () => {
    it('monta payload completo com contadores e modalidades', () => {
        const payload = montarPayloadGeminiUsage({
            ...baseInput,
            finalidade: 'transcricao',
            origem: 'audio',
            duracaoAudioSeg: 8.5,
            usageMetadata: {
                promptTokenCount: 120,
                candidatesTokenCount: 24,
                thoughtsTokenCount: 5,
                cachedContentTokenCount: 10,
                toolUsePromptTokenCount: 3,
                totalTokenCount: 162,
                promptTokensDetails: [
                    { modality: MediaModality.TEXT, tokenCount: 20 },
                    { modality: MediaModality.AUDIO, tokenCount: 100 },
                    { modality: MediaModality.IMAGE, tokenCount: 0 },
                ],
            },
        });

        expect(payload).toEqual({
            evt: 'gemini_usage',
            finalidade: 'transcricao',
            origem: 'audio',
            modelo: 'gemini-3.1-flash-lite',
            iteracao: 1,
            tentativas: 2,
            correlationId: baseInput.correlationId,
            promptTokens: 120,
            outputTokens: 24,
            thoughtsTokens: 5,
            cachedTokens: 10,
            toolUsePromptTokens: 3,
            totalTokens: 162,
            promptPorModalidade: { TEXT: 20, AUDIO: 100, IMAGE: 0 },
            duracaoAudioSeg: 8.5,
        });
    });

    it('preenche contadores ausentes com null e modalidades com mapa vazio', () => {
        expect(montarPayloadGeminiUsage(baseInput)).toMatchObject({
            promptTokens: null,
            outputTokens: null,
            thoughtsTokens: null,
            cachedTokens: null,
            toolUsePromptTokens: null,
            totalTokens: null,
            promptPorModalidade: {},
        });
    });

    it('mantém mapa de modalidades vazio quando promptTokensDetails falta', () => {
        const payload = montarPayloadGeminiUsage({
            ...baseInput,
            usageMetadata: { promptTokenCount: 7 },
        });

        expect(payload.promptPorModalidade).toEqual({});
    });

    it('omite modalidade cujo tokenCount está ausente', () => {
        const payload = montarPayloadGeminiUsage({
            ...baseInput,
            usageMetadata: {
                promptTokensDetails: [{ modality: MediaModality.AUDIO }],
            },
        });

        expect(payload.promptPorModalidade).toEqual({});
    });

    it('soma modalidades TEXT e AUDIO presentes no prompt', () => {
        const payload = montarPayloadGeminiUsage({
            ...baseInput,
            usageMetadata: {
                promptTokensDetails: [
                    { modality: MediaModality.TEXT, tokenCount: 11 },
                    { modality: MediaModality.AUDIO, tokenCount: 90 },
                    { modality: MediaModality.TEXT, tokenCount: 2 },
                ],
            },
        });

        expect(payload.promptPorModalidade).toEqual({ TEXT: 13, AUDIO: 90 });
    });

    it('não serializa chaves nem valores com conteúdo sensível', () => {
        const payload = montarPayloadGeminiUsage({
            ...baseInput,
            usageMetadata: { promptTokenCount: 1 },
        });
        const serialized = JSON.stringify(payload);

        expect(Object.keys(payload)).not.toEqual(
            expect.arrayContaining([
                'texto',
                'transcricao',
                'telefone',
                'phone',
                'remoteJid',
                'contents',
                'history',
                'response',
                'arguments',
                'result',
                'messageId',
            ]),
        );
        expect(serialized).not.toContain('transcrição privada');
        expect(serialized).not.toContain('5511999999999');
    });
});

describe('gemini usage logging', () => {
    it('emite uma única linha JSON filtrável pelo evento', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});

        emitirLogGeminiUsage(baseInput);

        expect(info).toHaveBeenCalledOnce();
        const line = info.mock.calls[0][0] as string;
        expect(line).not.toContain('\n');
        expect(JSON.parse(line)).toMatchObject({ evt: 'gemini_usage' });
    });

    it('não emite log quando a feature flag está desligada', () => {
        vi.stubEnv('GEMINI_USAGE_LOG_ENABLED', 'false');
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});

        emitirLogGeminiUsage(baseInput);

        expect(info).not.toHaveBeenCalled();
    });

    it('engole falha na emissão', () => {
        vi.spyOn(console, 'info').mockImplementation(() => {
            throw new Error('logger indisponível');
        });

        expect(() => emitirLogGeminiUsage(baseInput)).not.toThrow();
    });
});
