import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAudioConfig } from './audio-config';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('audio configuration', () => {
    it('uses safe defaults', () => {
        expect(getAudioConfig()).toEqual({
            transcriptionEnabled: false,
            maxBytes: 600000,
            downloadTimeoutMs: 10000,
            transcribeTimeoutMs: 30000,
            maxConcurrency: 3,
            maxQueue: 10,
        });
    });

    it('reads valid values at call time', () => {
        vi.stubEnv('AUDIO_TRANSCRIPTION_ENABLED', 'true');
        vi.stubEnv('AUDIO_MAX_BYTES', '123');
        vi.stubEnv('AUDIO_DOWNLOAD_TIMEOUT_MS', '456');
        vi.stubEnv('AUDIO_TRANSCRIBE_TIMEOUT_MS', '789');
        vi.stubEnv('AUDIO_MAX_CONCURRENCY', '2');
        vi.stubEnv('AUDIO_MAX_QUEUE', '5');

        expect(getAudioConfig()).toEqual({
            transcriptionEnabled: true,
            maxBytes: 123,
            downloadTimeoutMs: 456,
            transcribeTimeoutMs: 789,
            maxConcurrency: 2,
            maxQueue: 5,
        });
    });

    it.each(['NaN', '-1', '0', ''])(
        'falls back for invalid numeric value: %s',
        (value) => {
            vi.stubEnv('AUDIO_MAX_BYTES', value);
            expect(getAudioConfig().maxBytes).toBe(600000);
        },
    );

    it.each(['TRUE', '1', 'yes', ''])(
        'disables transcription for non-exact true value: %s',
        (value) => {
            vi.stubEnv('AUDIO_TRANSCRIPTION_ENABLED', value);
            expect(getAudioConfig().transcriptionEnabled).toBe(false);
        },
    );
});
