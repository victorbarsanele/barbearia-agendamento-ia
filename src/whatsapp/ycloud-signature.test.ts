import { describe, expect, it } from 'vitest';
import { createYCloudSignature, verifyYCloudSignature } from './ycloud-signature';

const secret = 'test-secret';
const body = '{"type":"event"}';
const now = 1_800_000_000_000;

describe('YCloud webhook signature', () => {
    it('accepts signature for exact body', () => {
        const signature = createYCloudSignature(body, secret, now / 1000);
        expect(verifyYCloudSignature(body, signature, secret, now)).toBe(true);
    });

    it('rejects absent secret, header, malformed signature, stale timestamp and changed body', () => {
        const valid = createYCloudSignature(body, secret, now / 1000);

        expect(verifyYCloudSignature(body, valid, undefined, now)).toBe(false);
        expect(verifyYCloudSignature(body, undefined, secret, now)).toBe(false);
        expect(verifyYCloudSignature(body, 'broken', secret, now)).toBe(false);
        expect(
            verifyYCloudSignature(
                body,
                createYCloudSignature(body, secret, now / 1000 - 301),
                secret,
                now,
            ),
        ).toBe(false);
        expect(verifyYCloudSignature(`${body} `, valid, secret, now)).toBe(false);
    });

    it('accepts a millisecond timestamp', () => {
        const signature = createYCloudSignature(body, secret, now);
        expect(verifyYCloudSignature(body, signature, secret, now)).toBe(true);
    });
});
