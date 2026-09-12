import type { PacoteClienteAtivo } from '../services/pacoteCliente.service';
import type { Servico } from '../services/servicos.service';

export function filtrarServicosPorPacoteAtivo(
    servicos: Servico[],
    pacoteAtivo: PacoteClienteAtivo | null,
    usarPacoteAtivo: boolean,
): Servico[] {
    if (!usarPacoteAtivo || !pacoteAtivo) {
        return servicos;
    }

    const idsInclusos = new Set(
        pacoteAtivo.pacote.servicos.map((item) => item.servicoId),
    );

    return servicos.filter((servico) => idsInclusos.has(servico.id));
}
