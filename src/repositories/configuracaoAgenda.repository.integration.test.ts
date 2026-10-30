import { afterEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import * as configuracaoAgendaRepository from './configuracaoAgenda.repository';

describe('configuracaoAgendaRepository', () => {
    afterEach(async () => {
        await prisma.configuracaoAgenda.deleteMany({ where: { id: 1 } });
    });

    it('retorna null quando singleton não existe', async () => {
        await prisma.configuracaoAgenda.deleteMany({ where: { id: 1 } });
        await expect(configuracaoAgendaRepository.obter()).resolves.toEqual({
            horizonteDias: null,
            limiteAte: null,
        });
    });

    it('define e obtém configuração sem deslocar limiteAte por fuso', async () => {
        const configuracao = {
            horizonteDias: 45,
            limiteAte: '2027-02-03',
        };

        await expect(
            configuracaoAgendaRepository.definir(configuracao),
        ).resolves.toEqual(configuracao);
        await expect(configuracaoAgendaRepository.obter()).resolves.toEqual(
            configuracao,
        );
    });

    it('persiste null/null como configuração sem valores', async () => {
        await configuracaoAgendaRepository.definir({
            horizonteDias: 30,
            limiteAte: '2027-02-03',
        });

        await expect(
            configuracaoAgendaRepository.definir({
                horizonteDias: null,
                limiteAte: null,
            }),
        ).resolves.toEqual({ horizonteDias: null, limiteAte: null });
        await expect(configuracaoAgendaRepository.obter()).resolves.toEqual({
            horizonteDias: null,
            limiteAte: null,
        });
    });
});
