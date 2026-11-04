import {
    type ItemClienteInativo,
    type RelatorioClientesInativos,
} from '../services/relatorios.service.js';
import { getBrazilDateKey } from './dateTime.js';
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
