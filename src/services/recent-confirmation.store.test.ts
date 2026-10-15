import { describe, expect, it } from 'vitest';
import {
    RECENT_CONFIRMATION_TTL_MS,
    RecentConfirmationStore,
} from './recent-confirmation.store';

describe('RecentConfirmationStore', () => {
    it('expira após cinco minutos usando relógio injetável', () => {
        let agora = new Date('2026-10-15T12:00:00.000Z');
        const store = new RecentConfirmationStore({ now: () => agora });

        const confirmacao = store.registrar('telefone-1', {
            servicoNome: 'Corte',
            diaSemana: 'sexta-feira',
            data: '16/10/2026',
            hora: '10:00',
            mensagemConfirmacaoId: 'confirmacao-1',
        });
        expect(confirmacao.expiraEm.getTime() - agora.getTime()).toBe(
            RECENT_CONFIRMATION_TTL_MS,
        );
        expect(store.obterValido('telefone-1')).not.toBeNull();

        agora = new Date(agora.getTime() + RECENT_CONFIRMATION_TTL_MS);
        expect(store.obterValido('telefone-1')).toBeNull();
    });

    it('limita capacidade e limpa expirados oportunisticamente', () => {
        let agora = new Date('2026-10-15T12:00:00.000Z');
        const store = new RecentConfirmationStore({
            maxEntries: 2,
            now: () => agora,
        });
        const dados = {
            servicoNome: 'Corte',
            diaSemana: 'sexta-feira',
            data: '16/10/2026',
            hora: '10:00',
        };

        store.registrar('expirado', {
            ...dados,
            mensagemConfirmacaoId: 'confirmacao-expirada',
        });
        agora = new Date(agora.getTime() + RECENT_CONFIRMATION_TTL_MS);
        store.registrar('atual', {
            ...dados,
            mensagemConfirmacaoId: 'confirmacao-atual',
        });
        expect(store.obterValido('expirado')).toBeNull();

        store.registrar('outro', {
            ...dados,
            mensagemConfirmacaoId: 'confirmacao-outro',
        });
        store.registrar('novo', {
            ...dados,
            mensagemConfirmacaoId: 'confirmacao-novo',
        });

        expect(store.obterValido('atual')).toBeNull();
        expect(store.obterValido('outro')).not.toBeNull();
        expect(store.obterValido('novo')).not.toBeNull();
    });

    it('limpar remove telefone específico ou todos os registros', () => {
        const store = new RecentConfirmationStore();
        const dados = {
            servicoNome: 'Corte',
            diaSemana: 'sexta-feira',
            data: '16/10/2026',
            hora: '10:00',
        };
        store.registrar('um', {
            ...dados,
            mensagemConfirmacaoId: 'confirmacao-um',
        });
        store.registrar('dois', {
            ...dados,
            mensagemConfirmacaoId: 'confirmacao-dois',
        });

        store.limpar('um');
        expect(store.obterValido('um')).toBeNull();
        expect(store.obterValido('dois')).not.toBeNull();

        store.reset();
        expect(store.obterValido('dois')).toBeNull();
    });
});
