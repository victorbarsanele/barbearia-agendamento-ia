import { apiFetch } from './api';

export interface HorarioFuncionamento {
    id: string;
    diaSemana: number;
    horaAberturaMinutos: number;
    horaFechamentoMinutos: number;
    almocoInicioMinutos: number | null;
    almocoFimMinutos: number | null;
    limiteExtensaoMinutos: number | null;
    ultimoInicioExtensaoMinutos: number | null;
    updatedAt: string;
}

export type HorarioFuncionamentoPayload = Omit<
    HorarioFuncionamento,
    'id' | 'updatedAt'
>;

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            message?: string;
        } | null;
        throw new Error(body?.message ?? 'Erro ao processar requisição.');
    }

    return (await response.json()) as T;
}

export async function listarHorariosFuncionamento(): Promise<
    Array<HorarioFuncionamento | null>
> {
    const response = await apiFetch('/api/horarios-funcionamento');
    return handleResponse<Array<HorarioFuncionamento | null>>(response);
}

export async function atualizarHorariosFuncionamento(
    payload: Array<HorarioFuncionamentoPayload | null>,
): Promise<Array<HorarioFuncionamento | null>> {
    const response = await apiFetch('/api/horarios-funcionamento', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<Array<HorarioFuncionamento | null>>(response);
}
