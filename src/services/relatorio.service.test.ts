import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = vi.hoisted(() => ({
    agregarAtendimentos: vi.fn(),
    listarClientesInativos: vi.fn(),
}));

const numeroIgnoradoMock = vi.hoisted(() => ({
    listar: vi.fn(),
}));

vi.mock('../repositories/relatorio.repository', () => repositoryMock);
vi.mock('./numero-ignorado-whatsapp.service', () => numeroIgnoradoMock);

import * as relatorioRepository from '../repositories/relatorio.repository';
import * as numeroIgnoradoWhatsAppService from './numero-ignorado-whatsapp.service';
import {
    buscarAtendimentos,
    buscarClientesInativos,
} from './relatorio.service';

const agora = new Date('2026-10-11T02:45:00.000Z');

function item(
    servicoId: string,
    valorEstimado: string | null,
    overrides: Partial<{
        quantidade: number;
        quantidadeAvulso: number;
        quantidadePacote: number;
        semPreco: number;
    }> = {},
) {
    return {
        servicoId,
        nome: servicoId,
        quantidade: overrides.quantidade ?? 1,
        quantidadeAvulso: overrides.quantidadeAvulso ?? 1,
        quantidadePacote: overrides.quantidadePacote ?? 0,
        valorEstimado,
        semPreco: overrides.semPreco ?? 0,
    };
}

describe('relatorio.service.buscarAtendimentos', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(relatorioRepository.agregarAtendimentos).mockResolvedValue(
            [],
        );
        vi.mocked(numeroIgnoradoWhatsAppService.listar).mockResolvedValue([]);
        vi.mocked(relatorioRepository.listarClientesInativos).mockResolvedValue(
            { total: 0, itens: [] },
        );
    });

    it.each([
        ['formato inválido', '2026/10/10', '2026-10-10', 'formato'],
        ['data inexistente', '2026-02-31', '2026-03-01', 'data válida'],
        ['início posterior', '2026-10-11', '2026-10-10', 'posterior'],
        ['intervalo acima de 366 dias', '2025-01-01', '2026-01-02', '366'],
    ])('rejeita %s com mensagem clara', async (_cenario, de, ate, trecho) => {
        await expect(buscarAtendimentos(de, ate, agora)).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining(trecho),
        });
        expect(relatorioRepository.agregarAtendimentos).not.toHaveBeenCalled();
    });

    it('calcula total decimal sem erro de ponto flutuante', async () => {
        vi.mocked(relatorioRepository.agregarAtendimentos).mockResolvedValue([
            item('servico-1', new Prisma.Decimal('0.10').toFixed(2)),
            item('servico-2', new Prisma.Decimal('0.20').toFixed(2)),
        ]);

        const resultado = await buscarAtendimentos(
            '2026-10-10',
            '2026-10-10',
            agora,
        );

        expect(resultado.total.valorEstimado).toBe('0.30');
        expect(resultado.geradoEm).toBe(agora.toISOString());
    });

    it('devolve total vazio com quantidade zero e valor nulo', async () => {
        const resultado = await buscarAtendimentos(
            '2026-10-10',
            '2026-10-10',
            agora,
        );

        expect(resultado).toEqual({
            periodo: { de: '2026-10-10', ate: '2026-10-10' },
            geradoEm: agora.toISOString(),
            itens: [],
            total: { quantidade: 0, valorEstimado: null, semPreco: 0 },
        });
    });

    it.each([
        [{ diasMin: 0 }, 'diasMin'],
        [{ diasMin: 366 }, 'diasMin'],
        [{ diasMin: 1.5 }, 'diasMin'],
        [{ diasMax: 1.5 }, 'diasMax'],
        [{ diasMax: 731 }, 'diasMax'],
        [{ diasMin: 40, diasMax: 39 }, 'diasMax'],
        [{ diasMin: 200 }, 'diasMax'],
    ])('rejeita filtro inválido %j', async (filtro, campo) => {
        await expect(
            buscarClientesInativos(filtro, agora),
        ).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining(campo),
        });
        expect(numeroIgnoradoWhatsAppService.listar).not.toHaveBeenCalled();
        expect(
            relatorioRepository.listarClientesInativos,
        ).not.toHaveBeenCalled();
    });

    it('monta variantes canônicas com e sem nono dígito', async () => {
        vi.mocked(numeroIgnoradoWhatsAppService.listar).mockResolvedValue([
            { telefone: '+55 (11) 8765-4321' },
            { telefone: '5521976543210' },
            { telefone: 'sem telefone' },
        ] as Awaited<ReturnType<typeof numeroIgnoradoWhatsAppService.listar>>);

        await buscarClientesInativos({}, agora);

        expect(relatorioRepository.listarClientesInativos).toHaveBeenCalledWith(
            agora,
            '2026-10-10',
            30,
            180,
            ['5511987654321', '551187654321', '5521976543210', '552176543210'],
        );
    });

    it('trata lista ignorada vazia e devolve contrato padrão com truncado', async () => {
        const itemInativo = {
            clienteId: 'cliente-1',
            nome: 'Cliente Teste',
            telefone: '5511999999999',
            ultimaVisita: '2026-08-01',
            diasSemVir: 70,
            ultimoServico: 'Corte',
            totalVisitas: 4,
            pacoteAtivoComSaldo: false,
        };
        vi.mocked(relatorioRepository.listarClientesInativos).mockResolvedValue(
            { total: 501, itens: [itemInativo] },
        );

        const resultado = await buscarClientesInativos({}, agora);

        expect(relatorioRepository.listarClientesInativos).toHaveBeenCalledWith(
            agora,
            '2026-10-10',
            30,
            180,
            [],
        );
        expect(resultado).toEqual({
            geradoEm: agora.toISOString(),
            filtro: { diasMin: 30, diasMax: 180 },
            total: 501,
            truncado: true,
            itens: [itemInativo],
        });
    });

    it('devolve truncado falso quando todos os resultados estão incluídos', async () => {
        vi.mocked(relatorioRepository.listarClientesInativos).mockResolvedValue(
            { total: 0, itens: [] },
        );

        const resultado = await buscarClientesInativos(
            { diasMin: 20, diasMax: 60 },
            agora,
        );

        expect(resultado.filtro).toEqual({ diasMin: 20, diasMax: 60 });
        expect(resultado.truncado).toBe(false);
    });
});
