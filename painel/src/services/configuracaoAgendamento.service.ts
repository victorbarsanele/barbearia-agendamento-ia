import { apiFetch } from './api';

export interface ConfiguracaoAgendamento {
    minAntecedenciaMinutos: number;
}

export async function buscarConfiguracaoAgendamento(): Promise<ConfiguracaoAgendamento> {
    const response = await apiFetch('/api/configuracao-agendamento');
    if (!response.ok) {
        throw new Error(
            'Não foi possível carregar a configuração de agendamento.',
        );
    }

    return (await response.json()) as ConfiguracaoAgendamento;
}
