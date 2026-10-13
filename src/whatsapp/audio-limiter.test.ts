import { describe, expect, it } from 'vitest';
import { AudioLimiter, AudioQueueFullError } from './audio-limiter';

describe('audio limiter', () => {
    it('limits active work and releases queued work', async () => {
        const limiter = new AudioLimiter(1, 1);
        const firstRelease = await limiter.acquire();
        const second = limiter.acquire();

        await expect(limiter.acquire()).rejects.toBeInstanceOf(
            AudioQueueFullError,
        );
        firstRelease();
        const secondRelease = await second;
        secondRelease();
    });

    it('releases capacity after failure', async () => {
        const limiter = new AudioLimiter(1, 0);
        const release = await limiter.acquire();
        try {
            throw new Error('test');
        } catch {
            release();
        }
        await expect(limiter.acquire()).resolves.toBeTypeOf('function');
    });
});
