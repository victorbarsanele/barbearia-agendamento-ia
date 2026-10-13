const DEFAULT_AUDIO_MAX_BYTES = 600_000;
const DEFAULT_AUDIO_DOWNLOAD_TIMEOUT_MS = 10_000;
const DEFAULT_AUDIO_TRANSCRIBE_TIMEOUT_MS = 30_000;
const DEFAULT_AUDIO_MAX_CONCURRENCY = 3;
const DEFAULT_AUDIO_MAX_QUEUE = 10;

function readNonNegativeNumber(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getAudioConfig(): {
    transcriptionEnabled: boolean;
    maxBytes: number;
    downloadTimeoutMs: number;
    transcribeTimeoutMs: number;
    maxConcurrency: number;
    maxQueue: number;
} {
    return {
        transcriptionEnabled: process.env.AUDIO_TRANSCRIPTION_ENABLED === 'true',
        maxBytes: readNonNegativeNumber('AUDIO_MAX_BYTES', DEFAULT_AUDIO_MAX_BYTES),
        downloadTimeoutMs: readNonNegativeNumber(
            'AUDIO_DOWNLOAD_TIMEOUT_MS',
            DEFAULT_AUDIO_DOWNLOAD_TIMEOUT_MS,
        ),
        transcribeTimeoutMs: readNonNegativeNumber(
            'AUDIO_TRANSCRIBE_TIMEOUT_MS',
            DEFAULT_AUDIO_TRANSCRIBE_TIMEOUT_MS,
        ),
        maxConcurrency: readNonNegativeNumber(
            'AUDIO_MAX_CONCURRENCY',
            DEFAULT_AUDIO_MAX_CONCURRENCY,
        ),
        maxQueue: readNonNegativeNumber('AUDIO_MAX_QUEUE', DEFAULT_AUDIO_MAX_QUEUE),
    };
}
