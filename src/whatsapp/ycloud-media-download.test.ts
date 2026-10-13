import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
    AUDIO_TRANSCRIPTION_MIME_TYPES,
    compareAudioSha256,
    downloadYCloudMedia,
    normalizeAudioMimeType,
} from './ycloud-media-download';

const link =
    'https://api.ycloud.com/v2/whatsapp/media/download/audio-1?sig=synthetic&payload=test';

function response(
    status: number,
    body?: ReadableStream<Uint8Array>,
    headers: Record<string, string> = {},
): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(headers),
        body: body ?? null,
    } as Response;
}

function stream(chunks: string[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(new TextEncoder().encode(chunk));
            }
            controller.close();
        },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('YCloud media download', () => {
    it('rejects invalid URL before fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            downloadYCloudMedia(
                'https://evil.example/v2/whatsapp/media/download/audio',
                100,
                1000,
            ),
        ).resolves.toEqual({ ok: false, reason: 'invalid_url' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends API key only to YCloud and reads bounded body', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(response(200, stream(['audio']), {
                'content-type': 'audio/ogg; codecs=opus',
            }));
        vi.stubGlobal('fetch', fetchMock);
        vi.stubEnv('YCLOUD_API_KEY', 'test-key');

        await expect(downloadYCloudMedia(link, 10, 1000)).resolves.toEqual({
            ok: true,
            data: Buffer.from('audio'),
            contentType: 'audio/ogg; codecs=opus',
        });
        expect(fetchMock).toHaveBeenCalledWith(
            link,
            expect.objectContaining({
                redirect: 'manual',
                headers: { 'X-API-Key': 'test-key' },
            }),
        );
    });

    it('rejects Content-Length above limit without reading body', async () => {
        const body = stream(['should-not-read']);
        const reader = body.getReader();
        const readSpy = vi.spyOn(reader, 'read');
        reader.releaseLock();
        const fetchMock = vi.fn().mockResolvedValue(
            response(200, body, { 'content-length': '101' }),
        );
        vi.stubGlobal('fetch', fetchMock);
        vi.stubEnv('YCLOUD_API_KEY', 'test-key');

        await expect(downloadYCloudMedia(link, 100, 1000)).resolves.toEqual({
            ok: false,
            reason: 'too_large',
        });
        expect(readSpy).not.toHaveBeenCalled();
    });

    it('aborts stream when body exceeds limit', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(response(200, stream(['123', '456']))),
        );
        vi.stubEnv('YCLOUD_API_KEY', 'test-key');

        await expect(downloadYCloudMedia(link, 5, 1000)).resolves.toEqual({
            ok: false,
            reason: 'too_large',
        });
    });

    it('returns empty for an empty body and hides network errors', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal(
            'fetch',
            vi.fn()
                .mockRejectedValue(
                    new Error(
                        'network https://api.ycloud.com/media?sig=secret client text',
                    ),
                ),
        );
        vi.stubEnv('YCLOUD_API_KEY', 'test-key');

        await expect(downloadYCloudMedia(link, 100, 1000)).resolves.toEqual({
            ok: false,
            reason: 'network',
        });
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sig=');
        errorLog.mockRestore();

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(response(200, stream([]))),
        );
        await expect(downloadYCloudMedia(link, 100, 1000)).resolves.toEqual({
            ok: false,
            reason: 'empty',
        });
    });

    it('follows external HTTPS redirect without forwarding API key', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                response(302, undefined, {
                    location: 'https://cdn.example/audio',
                }),
            )
            .mockResolvedValueOnce(response(200, stream(['audio'])));
        vi.stubGlobal('fetch', fetchMock);
        vi.stubEnv('YCLOUD_API_KEY', 'test-key');

        await expect(downloadYCloudMedia(link, 100, 1000)).resolves.toMatchObject({
            ok: true,
            data: Buffer.from('audio'),
        });
        expect(fetchMock.mock.calls[1]?.[1]).toEqual(
            expect.objectContaining({ headers: {} }),
        );
    });

    it('normalizes MIME and compares SHA-256 in hex or base64', () => {
        const data = Buffer.from('audio');
        expect(normalizeAudioMimeType(' Audio/OGG; codecs=opus ')).toBe(
            'audio/ogg',
        );
        expect(AUDIO_TRANSCRIPTION_MIME_TYPES.has('audio/ogg')).toBe(true);
        expect(compareAudioSha256(data, '')).toBe(null);
        expect(
            compareAudioSha256(
                data,
                createHash('sha256').update(data).digest('hex'),
            ),
        ).toBe(true);
        expect(
            compareAudioSha256(
                data,
                createHash('sha256').update(data).digest('base64'),
            ),
        ).toBe(true);
        expect(
            compareAudioSha256(
                data,
                '1c55d9b826b48f2f4f7d3a6f4f6d5b2c03d8f0b36d9a3d4a1c9a6bb7e6c7f1a0',
            ),
        ).toBe(false);
        expect(compareAudioSha256(data, 'invalid')).toBe(false);
    });
});
