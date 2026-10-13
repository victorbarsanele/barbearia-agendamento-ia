import { describe, expect, it } from 'vitest';
import { describeSafeError } from './audio-error';

describe('audio error description', () => {
    it('does not expose message, cause, URL or client content', () => {
        const error = Object.assign(
            new Error(
                'download failed https://api.ycloud.com/media?sig=secret with client text',
            ),
            {
                code: 'ETIMEDOUT',
                status: 504,
                cause: {
                    code: 'UPSTREAM',
                    message:
                        'https://api.ycloud.com/media?sig=secret client text',
                },
            },
        );

        const serialized = JSON.stringify(describeSafeError(error));

        expect(serialized).toBe(
            JSON.stringify({
                name: 'Error',
                code: 'ETIMEDOUT',
                status: 504,
            }),
        );
        expect(serialized).not.toContain('sig=');
        expect(serialized).not.toContain('client text');
    });
});
