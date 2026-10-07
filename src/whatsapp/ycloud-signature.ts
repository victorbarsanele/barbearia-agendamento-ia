import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export function verifyYCloudSignature(
    rawBody: string | undefined,
    signatureHeader: string | undefined,
    secret: string | undefined,
    now = Date.now(),
): boolean {
    if (!rawBody || !signatureHeader || !secret) {
        return false;
    }

    const match = signatureHeader.match(/^t=(\d+),s=([a-fA-F0-9]{64})$/);
    if (!match) {
        return false;
    }

    const timestampText = match[1];
    const signature = match[2];
    const timestampValue = Number(timestampText);

    if (!Number.isSafeInteger(timestampValue)) {
        return false;
    }

    const timestampMs =
        timestampValue > 1e12 ? timestampValue : timestampValue * 1000;

    if (Math.abs(now - timestampMs) > SIGNATURE_WINDOW_MS) {
        return false;
    }

    const expected = createHmac('sha256', secret)
        .update(`${timestampText}.${rawBody}`)
        .digest();
    const received = Buffer.from(signature, 'hex');

    return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createYCloudSignature(
    rawBody: string,
    secret: string,
    timestamp = Math.floor(Date.now() / 1000),
): string {
    const signature = createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

    return `t=${timestamp},s=${signature}`;
}
