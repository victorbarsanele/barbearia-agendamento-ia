import {
    type ItemClienteInativo,
    type RelatorioClientesInativos,
} from '../services/relatorios.service.js';
import { getBrazilDateKey } from './dateTime.js';
import { formatBrazilDateKey } from './dateTime.js';
import { formatarTelefone } from './formatarTelefone.js';
import { neutralizarFormulaCsv, serializarCsv } from './csv.js';
import { formatarDataRelatorio } from './relatorios.js';
import { formatarTelefoneCsv } from './contatoRelatorio.js';

export {
    formatarTelefoneCsv,
    obterTelefoneWhatsApp,
} from './contatoRelatorio.js';

export function validarIntervaloDiasInativos(
    diasMin: number,
    diasMax: number,
): string | null {
    if (!Number.isInteger(diasMin) || diasMin < 1 || diasMin > 365) {
        return 'O mínimo deve ser um número inteiro entre 1 e 365.';
    }
    if (!Number.isInteger(diasMax) || diasMax < diasMin || diasMax > 730) {
        return 'O máximo deve ser um inteiro igual ou maior que o mínimo, até 730.';
    }
    return null;
}

export function montarCsvClientesInativos(itens: ItemClienteInativo[]): string {
    const linhas = [
        [
            'Cliente',
            'Telefone',
            'Última visita',
            'Dias sem vir',
            'Último serviço',
            'Visitas',
            'Pacote ativo com saldo',
        ],
        ...itens.map((item) => [
            neutralizarFormulaCsv(item.nome.trim() || '(sem nome)'),
            formatarTelefoneCsv(item.telefone),
            formatarDataRelatorio(item.ultimaVisita),
            item.diasSemVir,
            neutralizarFormulaCsv(item.ultimoServico ?? ''),
            item.totalVisitas,
            item.pacoteAtivoComSaldo ? 'Sim' : 'Não',
        ]),
    ];
    return serializarCsv(linhas);
}

export function nomeArquivoCsvClientesInativos(
    relatorio: Pick<RelatorioClientesInativos, 'geradoEm'>,
): string {
    const data = new Date(relatorio.geradoEm);
    const dataLocal = Number.isNaN(data.getTime())
        ? 'data-indisponivel'
        : getBrazilDateKey(data);
    return `clientes_inativos_${dataLocal}.csv`;
}

export function formatarTelefoneCliente(telefone: string): string {
    return telefone.trim() ? formatarTelefone(telefone) : 'Não informado';
}

export interface EstadoReativacao {
    tipo: 'OPT_OUT' | 'COOLDOWN' | 'FALHOU' | 'DISPONIVEL' | 'INDISPONIVEL';
    mensagem: string | null;
    botaoTexto: 'Enviar reativação' | 'Reenviar' | null;
    envioDesabilitado: boolean;
    whatsappDesabilitado: boolean;
    statusSecundario: string | null;
}

export function formatarDiaMesBrasil(dataIso: string | null): string | null {
    if (!dataIso) return null;
    const data = new Date(dataIso);
    if (Number.isNaN(data.getTime())) return null;
    return formatBrazilDateKey(getBrazilDateKey(data)).slice(0, 5);
}

export function derivarEstadoReativacao(
    item: ItemClienteInativo,
): EstadoReativacao {
    if (item.reativacaoBloqueio === 'OPT_OUT') {
        return {
            tipo: 'OPT_OUT',
            mensagem: 'Pediu para não receber',
            botaoTexto: null,
            envioDesabilitado: true,
            whatsappDesabilitado: true,
            statusSecundario: null,
        };
    }

    if (item.reativacaoBloqueio === 'COOLDOWN') {
        const dia = formatarDiaMesBrasil(item.reativacaoBloqueadaAte);
        const statusUltimaTentativa = item.ultimaTentativa?.status;
        const statusSecundario =
            statusUltimaTentativa === 'PENDENTE'
                ? 'Enviando'
                : statusUltimaTentativa === 'ACEITA'
                  ? 'Enviada'
                  : statusUltimaTentativa === 'ENTREGUE'
                    ? 'Entregue'
                    : null;

        return {
            tipo: 'COOLDOWN',
            mensagem: dia
                ? `Reativação em espera até ${dia}`
                : 'Reativação em espera',
            botaoTexto: 'Enviar reativação',
            envioDesabilitado: true,
            whatsappDesabilitado: false,
            statusSecundario: statusSecundario ?? null,
        };
    }

    if (!item.podeReativar) {
        return {
            tipo: 'INDISPONIVEL',
            mensagem: 'Reativação indisponível',
            botaoTexto: null,
            envioDesabilitado: true,
            whatsappDesabilitado: false,
            statusSecundario: null,
        };
    }

    if (item.ultimaTentativa?.status === 'FALHOU') {
        const dia = formatarDiaMesBrasil(item.ultimaTentativa.criadoEm);
        return {
            tipo: 'FALHOU',
            mensagem: dia
                ? `Último envio falhou em ${dia}`
                : 'Último envio falhou',
            botaoTexto: 'Reenviar',
            envioDesabilitado: false,
            whatsappDesabilitado: false,
            statusSecundario: null,
        };
    }

    return {
        tipo: 'DISPONIVEL',
        mensagem: null,
        botaoTexto: 'Enviar reativação',
        envioDesabilitado: false,
        whatsappDesabilitado: false,
        statusSecundario: null,
    };
}
