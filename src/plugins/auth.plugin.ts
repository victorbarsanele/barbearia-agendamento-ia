import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const PUBLIC_POST_ROUTES = new Set(['/auth/login', '/webhook/whatsapp']);
const PUBLIC_GET_ROUTES = new Set(['/health']);
const revokedTokens = new Set<string>();

export function revokeAuthToken(token: string): void {
    revokedTokens.add(token);
}

export function resetRevokedTokens(): void {
    revokedTokens.clear();
}

async function authPlugin(app: FastifyInstance): Promise<void> {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error('JWT_SECRET nao configurado no ambiente.');
    }

    await app.register(fastifyJwt, {
        secret: jwtSecret,
        cookie: {
            cookieName: 'token',
            signed: false,
        },
    });

    app.addHook(
        'preHandler',
        async (request: FastifyRequest, reply: FastifyReply) => {
            const routeUrl = request.routeOptions.url ?? '';
            const isPublicRoute =
                (request.method === 'POST' &&
                    PUBLIC_POST_ROUTES.has(routeUrl)) ||
                (request.method === 'GET' && PUBLIC_GET_ROUTES.has(routeUrl));

            if (isPublicRoute) {
                return;
            }

            try {
                await request.jwtVerify({ onlyCookie: true });

                const token = request.cookies.token;
                if (!token || revokedTokens.has(token)) {
                    throw new Error('Token revogado ou ausente.');
                }
            } catch {
                void reply.status(401).send({ message: 'Nao autorizado.' });
            }
        },
    );
}

export const registerAuthPlugin = fp(authPlugin);
