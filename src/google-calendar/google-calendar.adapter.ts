import { JWT } from 'google-auth-library';
import type { GoogleCalendarConfig } from './config';
import type { GoogleCalendarEvent } from './event';

const API_URL = 'https://www.googleapis.com/calendar/v3/calendars';
const REQUEST_TIMEOUT_MS = 10_000;

export interface GoogleCalendarListedEvent {
    id: string;
    status?: string;
    summary?: string;
    description?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    extendedProperties?: {
        private?: { agendamentoId?: string; origem?: string };
    };
}

export class GoogleCalendarApiError extends Error {
    constructor(
        readonly statusCode: number,
        readonly transitório: boolean,
    ) {
        super(`Google Calendar HTTP ${statusCode}`);
        this.name = 'GoogleCalendarApiError';
    }
}

interface AdapterOptions {
    fetchImpl?: typeof fetch;
    obterAccessToken?: () => Promise<string>;
}

export class GoogleCalendarAdapter {
    private readonly fetchImpl: typeof fetch;
    private readonly obterAccessToken: () => Promise<string>;

    constructor(
        private readonly config: GoogleCalendarConfig,
        options: AdapterOptions = {},
    ) {
        if (!config.enabled || !config.calendarId || !config.serviceAccount) {
            throw new Error('Configuração Google Calendar inválida.');
        }
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.obterAccessToken =
            options.obterAccessToken ??
            this.criarProvedorDeToken(config.serviceAccount);
    }

    private criarProvedorDeToken(
        serviceAccount: NonNullable<GoogleCalendarConfig['serviceAccount']>,
    ): () => Promise<string> {
        const cliente = new JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        return async () => {
            const credentials = await cliente.getAccessToken();
            if (!credentials.token) {
                throw new Error('Google Calendar não retornou access token.');
            }
            return credentials.token;
        };
    }

    private async requisitar<T>(
        path: string,
        init: RequestInit = {},
    ): Promise<T> {
        let token: string;
        let timeout: NodeJS.Timeout | undefined;
        try {
            token = await Promise.race([
                this.obterAccessToken(),
                new Promise<never>((_, reject) => {
                    timeout = setTimeout(
                        () => reject(new Error('Google access token timeout')),
                        REQUEST_TIMEOUT_MS,
                    );
                }),
            ]);
        } catch (error) {
            const statusCode = obterStatusHttp(error) ?? 503;
            throw new GoogleCalendarApiError(
                statusCode,
                statusCode === 429 || statusCode >= 500,
            );
        } finally {
            if (timeout) clearTimeout(timeout);
        }

        let response: Response;
        try {
            response = await this.fetchImpl(
                `${API_URL}/${encodeURIComponent(this.config.calendarId!)}${path}`,
                {
                    ...init,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        ...(init.body
                            ? { 'Content-Type': 'application/json' }
                            : {}),
                        ...init.headers,
                    },
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                },
            );
        } catch {
            throw new GoogleCalendarApiError(503, true);
        }

        if (!response.ok) {
            throw new GoogleCalendarApiError(
                response.status,
                response.status === 429 || response.status >= 500,
            );
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
    }

    inserir(evento: GoogleCalendarEvent): Promise<GoogleCalendarListedEvent> {
        return this.requisitar<GoogleCalendarListedEvent>('/events', {
            method: 'POST',
            body: JSON.stringify(evento),
        });
    }

    atualizar(
        evento: GoogleCalendarEvent,
        status: 'confirmed' = 'confirmed',
    ): Promise<GoogleCalendarListedEvent> {
        return this.requisitar<GoogleCalendarListedEvent>(
            `/events/${encodeURIComponent(evento.id)}`,
            {
                method: 'PUT',
                body: JSON.stringify({ ...evento, status }),
            },
        );
    }

    async inserirOuReativar(
        evento: GoogleCalendarEvent,
    ): Promise<GoogleCalendarListedEvent> {
        try {
            return await this.inserir(evento);
        } catch (error) {
            if (
                !(error instanceof GoogleCalendarApiError) ||
                error.statusCode !== 409
            ) {
                throw error;
            }
            return this.atualizar(evento, 'confirmed');
        }
    }

    async excluir(eventId: string): Promise<void> {
        try {
            await this.requisitar<void>(
                `/events/${encodeURIComponent(eventId)}`,
                { method: 'DELETE' },
            );
        } catch (error) {
            if (
                error instanceof GoogleCalendarApiError &&
                (error.statusCode === 404 || error.statusCode === 410)
            ) {
                return;
            }
            throw error;
        }
    }

    async listarEventos(timeMin: Date): Promise<GoogleCalendarListedEvent[]> {
        const eventos: GoogleCalendarListedEvent[] = [];
        let pageToken: string | undefined;

        do {
            const params = new URLSearchParams({
                timeMin: timeMin.toISOString(),
                singleEvents: 'true',
                showDeleted: 'false',
                maxResults: '2500',
                privateExtendedProperty: 'origem=painel-barbearia',
            });
            if (pageToken) params.set('pageToken', pageToken);
            const result = await this.requisitar<{
                items?: GoogleCalendarListedEvent[];
                nextPageToken?: string;
            }>(`/events?${params.toString()}`);
            eventos.push(...(result.items ?? []));
            pageToken = result.nextPageToken;
        } while (pageToken);

        return eventos;
    }
}

function obterStatusHttp(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('response' in error)) {
        return undefined;
    }
    const response = error.response;
    if (
        typeof response === 'object' &&
        response !== null &&
        'status' in response &&
        typeof response.status === 'number'
    ) {
        return response.status;
    }
    return undefined;
}

export const __testables = { REQUEST_TIMEOUT_MS };
