import { createHash } from 'node:crypto';

export type YCloudMediaDownloadFailureReason =
    | 'invalid_url'
    | 'http_error'
    | 'too_large'
    | 'timeout'
    | 'network'
    | 'empty';

export type YCloudMediaDownloadResult =
    | {
          ok: true;
          data: Buffer;
          contentType: string | null;
      }
    | {
          ok: false;
          reason: YCloudMediaDownloadFailureReason;
          status?: number;
      };

export const AUDIO_TRANSCRIPTION_MIME_TYPES = new Set([
    'audio/ogg',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/aac',
    'audio/x-aac',
    'audio/wav',
    'audio/webm',
    'audio/flac',
]);

const YCLOUD_MEDIA_HOST = 'api.ycloud.com';
const YCLOUD_MEDIA_PATH_PREFIX = '/v2/whatsapp/media/download/';

export function normalizeAudioMimeType(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }

    const normalized = raw.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    return normalized || null;
}

function isInitialMediaUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:' &&
            url.hostname === YCLOUD_MEDIA_HOST &&
            url.pathname.startsWith(YCLOUD_MEDIA_PATH_PREFIX)
        );
    } catch {
        return false;
    }
}

function isTimeoutError(error: unknown, signal: AbortSignal): boolean {
    return signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
}

async function readResponseBody(
    response: Response,
    maxBytes: number,
    controller: AbortController,
): Promise<Buffer | YCloudMediaDownloadFailureReason> {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        return 'too_large';
    }

    if (!response.body) {
        return 'empty';
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const result = await reader.read();
            if (result.done) {
                break;
            }

            const chunk = Buffer.from(result.value);
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
                controller.abort();
                await reader.cancel().catch(() => undefined);
                return 'too_large';
            }
            chunks.push(chunk);
        }
    } finally {
        reader.releaseLock();
    }

    return totalBytes === 0 ? 'empty' : Buffer.concat(chunks, totalBytes);
}

export async function downloadYCloudMedia(
    link: string,
    maxBytes: number,
    timeoutMs: number,
): Promise<YCloudMediaDownloadResult> {
    if (!isInitialMediaUrl(link)) {
        return { ok: false, reason: 'invalid_url' };
    }

    const apiKey = process.env.YCLOUD_API_KEY;
    if (!apiKey) {
        return { ok: false, reason: 'network' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let currentUrl = link;

    try {
        for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
            const target = new URL(currentUrl);
            const headers: Record<string, string> = {};
            if (target.hostname === YCLOUD_MEDIA_HOST) {
                headers['X-API-Key'] = apiKey;
            }

            let response: Response;
            try {
                response = await fetch(currentUrl, {
                    headers,
                    redirect: 'manual',
                    signal: controller.signal,
                });
            } catch (error) {
                return {
                    ok: false,
                    reason: isTimeoutError(error, controller.signal)
                        ? 'timeout'
                        : 'network',
                };
            }

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location || redirectCount === 2) {
                    return {
                        ok: false,
                        reason: 'http_error',
                        status: response.status,
                    };
                }

                let redirectUrl: URL;
                try {
                    redirectUrl = new URL(location, currentUrl);
                } catch {
                    return { ok: false, reason: 'invalid_url' };
                }
                if (redirectUrl.protocol !== 'https:') {
                    return { ok: false, reason: 'invalid_url' };
                }
                currentUrl = redirectUrl.toString();
                continue;
            }

            if (!response.ok) {
                return {
                    ok: false,
                    reason: 'http_error',
                    status: response.status,
                };
            }

            const body = await readResponseBody(response, maxBytes, controller);
            if (typeof body === 'string') {
                return { ok: false, reason: body };
            }

            return {
                ok: true,
                data: body,
                contentType: response.headers.get('content-type'),
            };
        }

        return { ok: false, reason: 'http_error' };
    } catch (error) {
        return {
            ok: false,
            reason: isTimeoutError(error, controller.signal)
                ? 'timeout'
                : 'network',
        };
    } finally {
        clearTimeout(timeout);
    }
}

export function compareAudioSha256(
    data: Buffer,
    expected: string | null,
): boolean | null {
    if (!expected) {
        return null;
    }

    const digest = createHash('sha256').update(data).digest();
    const normalized = expected.trim();
    if (/^[a-f0-9]{64}$/i.test(normalized)) {
        return digest.toString('hex') === normalized.toLowerCase();
    }
    if (/^[a-z0-9+/]+={0,2}$/i.test(normalized)) {
        return digest.toString('base64') === normalized;
    }
    return false;
}
