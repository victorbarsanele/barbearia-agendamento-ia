import { describe, expect, it } from 'vitest';
import { runExclusive } from './phone-queue';

describe('runExclusive', () => {
    it('mantém ordem FIFO por chave e recupera após erro', async () => {
        const events: string[] = [];
        const first = runExclusive('phone', async () => {
            events.push('first');
            throw new Error('first failed');
        });
        const second = runExclusive('phone', async () => {
            events.push('second');
            return 'ok';
        });

        await expect(first).rejects.toThrow('first failed');
        await expect(second).resolves.toBe('ok');
        expect(events).toEqual(['first', 'second']);
    });

    it('executa chaves diferentes em paralelo', async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const first = runExclusive('one', async () => gate);
        const second = runExclusive('two', async () => 'done');

        await expect(second).resolves.toBe('done');
        release();
        await expect(first).resolves.toBeUndefined();
    });

    it('remove fila ao terminar', async () => {
        await expect(runExclusive('phone', async () => 'done')).resolves.toBe(
            'done',
        );
        await expect(runExclusive('phone', async () => 'again')).resolves.toBe(
            'again',
        );
    });
});
