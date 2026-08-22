import { config } from 'dotenv';

const globalWithDotenvFlag = globalThis as typeof globalThis & {
    __dotenvConfigLoaded?: boolean;
};

if (!globalWithDotenvFlag.__dotenvConfigLoaded && !process.env.VITEST) {
    config({ override: true });
    globalWithDotenvFlag.__dotenvConfigLoaded = true;
}

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { AppError } from './src/lib/app-error';
import { agendamentoRoutes } from './src/routes/agendamento.routes';
import { bloqueioRoutes } from './src/routes/bloqueio.routes';
import { authRoutes } from './src/routes/auth.routes';
import { clienteRoutes } from './src/routes/cliente.routes';
import { servicoRoutes } from './src/routes/servico.routes';
import { webhookRoutes } from './src/routes/webhook.routes';
import { registerAuthPlugin } from './src/plugins/auth.plugin';

const app = Fastify({
    logger: true,
});

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
        void reply.status(error.statusCode).send({ message: error.message });
        return;
    }

    if (
        typeof error === 'object' &&
        error !== null &&
        'validation' in error &&
        Array.isArray((error as { validation?: unknown[] }).validation)
    ) {
        const validationErrors =
            (error as { validation?: Array<{ message?: string }> })
                .validation ?? [];
        const message = validationErrors
            .map((validationError) => validationError.message)
            .filter((message): message is string => Boolean(message))
            .join(', ');

        void reply.status(400).send({
            message: message
                ? `Requisição inválida: ${message}`
                : 'Requisição inválida.',
        });
        return;
    }

    app.log.error(error);
    void reply.status(500).send({ message: 'Erro interno do servidor.' });
});

void app.register(cookie);
void app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
});
void app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
});
void app.register(helmet);
void app.register(registerAuthPlugin);
void app.register(authRoutes);
void app.register(clienteRoutes);
void app.register(servicoRoutes);
void app.register(agendamentoRoutes);
void app.register(bloqueioRoutes);
void app.register(webhookRoutes);

app.get('/health', async () => {
    return { status: 'ok' };
});

const port = Number(process.env.PORT ?? 3333);

const start = async (): Promise<void> => {
    try {
        await app.listen({ port, host: '0.0.0.0' });
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
};

void start();
