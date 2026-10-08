import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enviarNotificacaoWhatsApp } from './whatsapp-notification.service';
import {
    avisarBarbeiroUsuarioSemTelefone,
    resetAvisosUsuarioSemTelefone,
} from './ycloud-username-notification.service';

vi.mock('./whatsapp-notification.service', () => ({
    enviarNotificacaoWhatsApp: vi.fn(),
}));

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    vi.stubEnv('ESCALATION_COOLDOWN_MS', '1000');
    vi.stubEnv('BARBER_PHONE', '5511888888888');
    vi.clearAllMocks();
    resetAvisosUsuarioSemTelefone();
    vi.mocked(enviarNotificacaoWhatsApp).mockResolvedValue(null);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe('avisarBarbeiroUsuarioSemTelefone', () => {
    it('notifies once per user ID during the escalation cooldown', async () => {
        await avisarBarbeiroUsuarioSemTelefone('username-1');
        await avisarBarbeiroUsuarioSemTelefone('username-1');
        await avisarBarbeiroUsuarioSemTelefone('username-2');

        expect(enviarNotificacaoWhatsApp).toHaveBeenCalledTimes(2);
        expect(enviarNotificacaoWhatsApp).toHaveBeenCalledWith(
            'atendimento_humano',
            '5511888888888',
            {
                telefoneCliente: 'sem telefone visível (username)',
                motivo: 'cliente sem número visível; responda pelo app',
            },
        );
    });

    it('sends notification again after cooldown expires', async () => {
        await avisarBarbeiroUsuarioSemTelefone('username-1');
        await vi.advanceTimersByTimeAsync(1001);
        await avisarBarbeiroUsuarioSemTelefone('username-1');

        expect(enviarNotificacaoWhatsApp).toHaveBeenCalledTimes(2);
    });

    it('does not include alternate ID or errors in failure logs', async () => {
        vi.mocked(enviarNotificacaoWhatsApp).mockRejectedValueOnce(
            new Error('sensitive failure details'),
        );
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

        await avisarBarbeiroUsuarioSemTelefone('username-private');

        expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
            'username-private',
        );
        expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
            'sensitive failure details',
        );
        errorLog.mockRestore();
    });
});
