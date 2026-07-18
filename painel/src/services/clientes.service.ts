import { apiFetch } from './api';

export interface Cliente {
    id: string;
    nome: string;
    telefone: string;
}

export interface ClientePayload {
    nome: string;
    telefone: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            message?: string;
        } | null;
        throw new Error(body?.message ?? 'Erro ao processar requisição.');
    }

    return (await response.json()) as T;
}

export async function listarClientes(): Promise<Cliente[]> {
    const response = await apiFetch('/api/clientes');
    return handleResponse<Cliente[]>(response);
}

export async function buscarClientesPorNome(nome: string): Promise<Cliente[]> {
    const termo = nome.trim().toLowerCase();
    const clientes = await listarClientes();

    if (!termo) {
        return clientes;
    }

    return clientes
        .filter((cliente) => cliente.nome.toLowerCase().includes(termo))
        .slice(0, 8);
}

export async function buscarClientePorId(id: string): Promise<Cliente> {
    const response = await apiFetch(`/api/clientes/${id}`);
    return handleResponse<Cliente>(response);
}

export async function criarCliente(payload: ClientePayload): Promise<Cliente> {
    const response = await apiFetch('/api/clientes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<Cliente>(response);
}

export async function atualizarCliente(
    id: string,
    payload: ClientePayload,
): Promise<Cliente> {
    const response = await apiFetch(`/api/clientes/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<Cliente>(response);
}

export async function excluirCliente(id: string): Promise<void> {
    const response = await apiFetch(`/api/clientes/${id}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            message?: string;
        } | null;
        throw new Error(body?.message ?? 'Erro ao processar requisição.');
    }
}
