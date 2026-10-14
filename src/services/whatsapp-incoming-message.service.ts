import {
    escalarParaHumano,
    obterEstadoEscalonamento,
    processarMensagemWhatsapp,
    sendWhatsAppText,
    transcreverAudio,
} from './gemini.service';
import { EstadoEscalonamento } from '@prisma/client';
import { IncomingWhatsAppMessage } from '../whatsapp/types';
import { getEscalationStateRepository } from '../repositories/escalation-state.repository';
import { describeSafeError } from '../whatsapp/audio-error';
import { getAudioConfig } from '../whatsapp/audio-config';
import {
    AUDIO_TRANSCRIPTION_MIME_TYPES,
    compareAudioSha256,
    downloadYCloudMedia,
    normalizeAudioMimeType,
} from '../whatsapp/ycloud-media-download';
import { AudioLimiter, AudioQueueFullError } from '../whatsapp/audio-limiter';
import { runExclusive } from '../utils/phone-queue';

const MAX_MESSAGE_LENGTH = 500;
const URL_PATTERN = /(https?:\/\/|www\.)/i;
const JAILBREAK_PATTERN =
    /\b(ignore|system\s*prompt|instru[çc][aã]o|dan|jailbreak|bypass|prompt|base64)\b/i;
const ESCALATION_KEYWORDS_PATTERN =
    /\b(atendente|humano|pessoa real|falar com o barbeiro|falar com alguem)\b/i;
const MEDIA_NOTICE =
    'Olá! No momento só consigo entender mensagens escritas. Pode me enviar sua dúvida por texto?';
const AUDIO_FAILURE_NOTICE =
    'Não consegui entender seu áudio. Pode me enviar sua dúvida por texto?';
const DEFAULT_MEDIA_NOTICE_COOLDOWN_MS = 10 * 60 * 1000;
const AUDIO_MAX_FAILURE_REASON = 'texto_longo_demais' as const;
type AudioFailureReason =
    | 'invalid_url'
    | 'http_error'
    | 'too_large'
    | 'timeout'
    | 'network'
    | 'empty'
    | 'unsupported_format'
    | 'transcription_empty'
    | 'transcription_unintelligible'
    | 'invalid_response'
    | 'rate_limited'
    | 'error'
    | 'queue_full'
    | typeof AUDIO_MAX_FAILURE_REASON;

interface BlockDecision {
    blocked: boolean;
    reason?: string;
    response?: string;
}

function evaluateIncomingMessage(message: string): BlockDecision {
    if (message.length > MAX_MESSAGE_LENGTH) {
        return {
            blocked: true,
            reason: 'mensagem muito longa',
            response: 'Mensagem muito longa. Por favor, seja mais breve.',
        };
    }

    if (URL_PATTERN.test(message)) {
        return {
            blocked: true,
            reason: 'mensagem com link',
            response: 'Não consigo processar links. Posso agendar um horário?',
        };
    }

    if (JAILBREAK_PATTERN.test(message)) {
        return {
            blocked: true,
            reason: 'padrão suspeito de jailbreak',
            response:
                'Só posso ajudar com agendamentos. Quer marcar um horário?',
        };
    }

    return { blocked: false };
}

function mascararTelefone(phone: string): string {
    return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

function getMediaNoticeCooldownMs(): number {
    const configured = Number(
        process.env.MEDIA_NOTICE_COOLDOWN_MS ??
            DEFAULT_MEDIA_NOTICE_COOLDOWN_MS,
    );
    return Number.isFinite(configured) && configured >= 0
        ? configured
        : DEFAULT_MEDIA_NOTICE_COOLDOWN_MS;
}

let audioLimiter: AudioLimiter | null = null;
let audioLimiterConfig = '';

function getAudioLimiter(): AudioLimiter {
    const config = getAudioConfig();
    const key = `${config.maxConcurrency}:${config.maxQueue}`;
    if (!audioLimiter || audioLimiterConfig !== key) {
        audioLimiter = new AudioLimiter(
            config.maxConcurrency,
            config.maxQueue,
        );
        audioLimiterConfig = key;
    }
    return audioLimiter;
}

function logAudioResult(data: {
    phone: string;
    resultado: 'success' | AudioFailureReason;
    bytesBaixados: number | null;
    mime: string | null;
    sha256Match: boolean | null;
    downloadMs: number;
    transcribeMs: number;
    transcriptChars: number;
    estado: EstadoEscalonamento;
}): void {
    console.info('[WEBHOOK] audio_transcricao', {
        telefone: mascararTelefone(data.phone),
        resultado: data.resultado,
        bytesBaixados: data.bytesBaixados,
        mime: data.mime,
        sha256Match: data.sha256Match,
        downloadMs: data.downloadMs,
        transcribeMs: data.transcribeMs,
        transcriptChars: data.transcriptChars,
        estado: data.estado,
    });
}

class AudioProcessingError extends Error {
    constructor(readonly reason: AudioFailureReason) {
        super(reason);
        this.name = 'AudioProcessingError';
    }
}

async function enviarAvisoDeMidia(
    phone: string,
    estadoAtual: EstadoEscalonamento,
    texto: string,
    audio: boolean,
    provider: string,
    rawType: string,
): Promise<void> {
    const claim = await getEscalationStateRepository().reivindicarAvisoMidia(
        phone,
        new Date(),
        getMediaNoticeCooldownMs(),
    );
    if (!claim.reivindicado) {
        if (audio) {
            console.info('[WEBHOOK] Falha de áudio suprimida', {
                provider,
                kind: 'non_text',
                rawType,
                estado: estadoAtual,
                aviso: 'cooldown',
                telefone: mascararTelefone(phone),
            });
        } else {
            console.info('[WEBHOOK] Mídia não textual suprimida', {
                provider,
                kind: 'non_text',
                rawType,
                estado: estadoAtual,
                aviso: 'cooldown',
                telefone: mascararTelefone(phone),
            });
        }
        return;
    }

    try {
        await sendWhatsAppText(phone, texto);
        console.info(
            audio
                ? '[WEBHOOK] Aviso de falha de áudio enviado'
                : '[WEBHOOK] Aviso de mídia não textual enviado',
            {
                provider,
                kind: 'non_text',
                rawType,
                estado: estadoAtual,
                aviso: 'enviado',
                telefone: mascararTelefone(phone),
            },
        );
    } catch (error) {
        try {
            await getEscalationStateRepository().liberarAvisoMidia(
                phone,
                claim.reivindicadoEm,
            );
        } catch {
            console.error(
                audio
                    ? '[WEBHOOK] Falha ao liberar cooldown do aviso de áudio.'
                    : '[WEBHOOK] Falha ao liberar cooldown do aviso de mídia não textual.',
            );
        }
        console.error(
            audio
                ? '[WEBHOOK] Falha ao enviar aviso de falha de áudio.'
                : '[WEBHOOK] Falha ao enviar aviso de mídia não textual.',
            { erro: describeSafeError(error) },
        );
    }
}

async function processarAudio(
    phone: string,
    message: IncomingWhatsAppMessage,
    estadoAtual: EstadoEscalonamento,
): Promise<void> {
    const config = getAudioConfig();
    const media = message.media;
    const startedAt = Date.now();
    let bytesBaixados: number | null = null;
    let mime: string | null = null;
    let sha256Match: boolean | null = null;
    let downloadMs = 0;
    let transcribeMs = 0;
    let transcriptChars = 0;
    let result: 'success' | AudioFailureReason = 'error';

    try {
        const release = await getAudioLimiter().acquire();
        try {
            const estadoAntesDownload = await obterEstadoEscalonamento(phone);
            if (
                estadoAntesDownload &&
                estadoAntesDownload.estado !== EstadoEscalonamento.BOT
            ) {
                return;
            }

            const downloaded = await downloadYCloudMedia(
                media?.link ?? '',
                config.maxBytes,
                config.downloadTimeoutMs,
            );
            downloadMs = Date.now() - startedAt;
            if (!downloaded.ok) {
                throw new AudioProcessingError(downloaded.reason);
            }

            bytesBaixados = downloaded.data.length;
            const payloadMime = normalizeAudioMimeType(media?.mimeType);
            mime = payloadMime ?? normalizeAudioMimeType(downloaded.contentType);
            if (!mime || !AUDIO_TRANSCRIPTION_MIME_TYPES.has(mime)) {
                throw new AudioProcessingError('unsupported_format');
            }
            sha256Match = compareAudioSha256(downloaded.data, media?.sha256 ?? null);

            const transcribeStartedAt = Date.now();
            const transcription = await transcreverAudio(downloaded.data, mime);
            transcribeMs = Date.now() - transcribeStartedAt;
            if (!transcription.ok) {
                throw new AudioProcessingError(
                    transcription.reason === 'empty'
                        ? 'transcription_empty'
                        : transcription.reason === 'unintelligible'
                          ? 'transcription_unintelligible'
                          : transcription.reason,
                );
            }
            transcriptChars = transcription.text.length;
            if (transcription.text.length > MAX_MESSAGE_LENGTH) {
                throw new AudioProcessingError(AUDIO_MAX_FAILURE_REASON);
            }

            await processarTextoDeCliente(
                phone,
                transcription.text,
                message.messageId,
            );
            result = 'success';
        } finally {
            release();
        }
    } catch (error) {
        result =
            error instanceof AudioProcessingError
                ? error.reason
                : error instanceof AudioQueueFullError
                  ? 'queue_full'
                  : 'error';
        if (!(error instanceof AudioProcessingError)) {
            console.error('[WEBHOOK] Falha no processamento de áudio.', {
                erro: describeSafeError(error),
            });
        }
    }

    logAudioResult({
        phone,
        resultado: result,
        bytesBaixados,
        mime,
        sha256Match,
        downloadMs,
        transcribeMs,
        transcriptChars,
        estado: estadoAtual,
    });

    if (result !== 'success') {
        const estadoAntesAviso = await obterEstadoEscalonamento(phone);
        if (
            estadoAntesAviso &&
            estadoAntesAviso.estado !== EstadoEscalonamento.BOT
        ) {
            return;
        }

        await enviarAvisoDeMidia(
            phone,
            estadoAtual,
            AUDIO_FAILURE_NOTICE,
            true,
            message.provider,
            message.rawType ?? 'audio',
        );
    }
}

async function processarTextoDeCliente(
    phone: string,
    text: string,
    messageId: string | null,
): Promise<void> {
    const estado = await obterEstadoEscalonamento(phone);

    if (
        estado?.estado === EstadoEscalonamento.ESCALADO ||
        estado?.estado === EstadoEscalonamento.HUMANO_ATIVO
    ) {
        console.debug(
            `[WEBHOOK] Mensagem ignorada durante escalonamento | numero: ${mascararTelefone(phone)}`,
        );
        return;
    }

    if (ESCALATION_KEYWORDS_PATTERN.test(text)) {
        console.log(
            `[WEBHOOK] Escalonamento por palavra-chave | numero: ${mascararTelefone(phone)}`,
        );
        await escalarParaHumano(phone, 'palavra_chave');
        return;
    }

    const blockDecision = evaluateIncomingMessage(text);

    if (blockDecision.blocked && blockDecision.response) {
        console.log(
            `[WEBHOOK] Mensagem bloqueada: ${blockDecision.reason} | numero: ${mascararTelefone(phone)}`,
        );
        await sendWhatsAppText(phone, blockDecision.response);
        return;
    }

    await processarMensagemWhatsapp(phone, text, messageId);
}

async function processarMensagemRecebidaInterno(
    message: IncomingWhatsAppMessage,
): Promise<void> {
    const { phone, text } = message;

    if (
        !phone ||
        message.kind === 'unknown' ||
        (message.kind === 'text' && !text)
    ) {
        return;
    }

    try {
        if (message.kind === 'non_text') {
            const estado = await obterEstadoEscalonamento(phone);
            const estadoAtual = estado?.estado ?? EstadoEscalonamento.BOT;
            if (estadoAtual !== EstadoEscalonamento.BOT) {
                console.info('[WEBHOOK] Mídia não textual suprimida', {
                    provider: message.provider,
                    kind: message.kind,
                    rawType: message.rawType,
                    estado: estadoAtual,
                    aviso: 'estado',
                    telefone: mascararTelefone(phone),
                });
                return;
            }

            const audioConfig = getAudioConfig();
            if (
                message.rawType === 'audio' &&
                audioConfig.transcriptionEnabled &&
                message.media?.link
            ) {
                await processarAudio(phone, message, estadoAtual);
                return;
            }

            await enviarAvisoDeMidia(
                phone,
                estadoAtual,
                MEDIA_NOTICE,
                false,
                message.provider,
                message.rawType ?? 'non_text',
            );
            return;
        }

        if (!text) {
            return;
        }

        await processarTextoDeCliente(phone, text, message.messageId);
    } catch {
        console.error('[WEBHOOK] Falha no processamento assíncrono.');
    }
}

export function processarMensagemRecebida(
    message: IncomingWhatsAppMessage,
): Promise<void> {
    if (!message.phone) {
        return processarMensagemRecebidaInterno(message);
    }

    return runExclusive(message.phone, async () => {
        try {
            await processarMensagemRecebidaInterno(message);
        } catch {
            console.error('[WEBHOOK] Falha no processamento assíncrono.');
        }
    });
}
