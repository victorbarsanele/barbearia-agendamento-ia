import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const PUBLIC_POST_ROUTES = new Set(['/auth/login', '/webhook/whatsapp']);

async function authPlugin(app: FastifyInstance): Promise<void> {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error('JWT_SECRET nao configurado no ambiente.');
    }

    await app.register(fastifyJwt, {
        secret: jwtSecret,
    });

    app.addHook(
        'preHandler',
        async (request: FastifyRequest, reply: FastifyReply) => {
            const routeUrl = request.routeOptions.url ?? '';
            const isPublicRoute =
                request.method === 'POST' && PUBLIC_POST_ROUTES.has(routeUrl);

            if (isPublicRoute) {
                return;
            }

            try {
                await request.jwtVerify();
            } catch {
                void reply.status(401).send({ message: 'Nao autorizado.' });
            }
        },
    );
}

export const registerAuthPlugin = fp(authPlugin);
