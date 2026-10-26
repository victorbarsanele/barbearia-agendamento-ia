import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { getGoogleCalendarConfig } from './config';

afterEach(() => vi.unstubAllEnvs());

describe('getGoogleCalendarConfig', () => {
    it('mantém sincronização desligada sem valor exato true', () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'TRUE');
        const log = vi.fn();

        expect(getGoogleCalendarConfig(log)).toEqual({ enabled: false });
        expect(log).not.toHaveBeenCalled();
    });

    it('desabilita e registra erro quando credenciais faltam', () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'true');
        vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64', '');
        vi.stubEnv('GOOGLE_CALENDAR_ID', '');
        const log = vi.fn();

        expect(getGoogleCalendarConfig(log)).toEqual({ enabled: false });
        expect(log).toHaveBeenCalledOnce();
    });

    it('desabilita credencial inválida sem lançar nem logar o conteúdo', () => {
        const segredo = 'not-json-secret';
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'true');
        vi.stubEnv(
            'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64',
            Buffer.from(segredo).toString('base64'),
        );
        vi.stubEnv('GOOGLE_CALENDAR_ID', 'calendar-id');
        const log = vi.fn();

        expect(getGoogleCalendarConfig(log)).toEqual({ enabled: false });
        expect(log).toHaveBeenCalledOnce();
        expect(log.mock.calls.join(' ')).not.toContain(segredo);
    });

    it('valida credencial sem expor conteúdo', () => {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
        });
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'true');
        vi.stubEnv(
            'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64',
            Buffer.from(
                JSON.stringify({
                    client_email: 'calendar@example.test',
                    private_key: privateKey.export({
                        type: 'pkcs8',
                        format: 'pem',
                    }),
                }),
            ).toString('base64'),
        );
        vi.stubEnv('GOOGLE_CALENDAR_ID', 'calendar-id');
        const log = vi.fn();

        expect(getGoogleCalendarConfig(log)).toMatchObject({
            enabled: true,
            calendarId: 'calendar-id',
            serviceAccount: { client_email: 'calendar@example.test' },
        });
        expect(log).not.toHaveBeenCalled();
    });
});
