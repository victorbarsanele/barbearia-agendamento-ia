import { describe, expect, it } from 'vitest';
import { ResumoEnviadoStore } from './resumo-enviado.store';

describe('ResumoEnviadoStore', () => {
    it('expira pelo TTL configurado usando relógio injetável', () => {
        let agora = new Date('2026-10-15T12:00:00.000Z');
        const store = new ResumoEnviadoStore({
            ttlMs: 1_000,
            now: () => agora,
        });

        store.registrar('telefone-1', {
            mensagemCriacaoId: 'mensagem-1',
            resumo: 'Corte, sexta, 10:00',
        });
        expect(store.obterValido('telefone-1')).not.toBeNull();

        agora = new Date(agora.getTime() + 1_000);
        expect(store.obterValido('telefone-1')).toBeNull();
    });

    it('remove expirados oportunisticamente e limita capacidade', () => {
        let agora = new Date('2026-10-15T12:00:00.000Z');
        const store = new ResumoEnviadoStore({
            ttlMs: 1_000,
            maxEntries: 2,
            now: () => agora,
        });

        store.registrar('antigo', {
            mensagemCriacaoId: 'mensagem-antiga',
            resumo: 'Antigo',
        });
        agora = new Date(agora.getTime() + 1_000);
        store.registrar('atual', {
            mensagemCriacaoId: 'mensagem-atual',
            resumo: 'Atual',
        });
        expect(store.obterValido('antigo')).toBeNull();

        store.registrar('outro', {
            mensagemCriacaoId: 'mensagem-outro',
            resumo: 'Outro',
        });
        store.registrar('novo', {
            mensagemCriacaoId: 'mensagem-novo',
            resumo: 'Novo',
        });

        expect(store.obterValido('atual')).toBeNull();
        expect(store.obterValido('outro')).not.toBeNull();
        expect(store.obterValido('novo')).not.toBeNull();
    });

    it('limpar remove telefone específico ou todos os registros', () => {
        const store = new ResumoEnviadoStore();
        store.registrar('um', {
            mensagemCriacaoId: 'mensagem-um',
            resumo: 'Um',
        });
        store.registrar('dois', {
            mensagemCriacaoId: 'mensagem-dois',
            resumo: 'Dois',
        });

        store.limpar('um');
        expect(store.obterValido('um')).toBeNull();
        expect(store.obterValido('dois')).not.toBeNull();

        store.limpar();
        expect(store.obterValido('dois')).toBeNull();
    });
});
