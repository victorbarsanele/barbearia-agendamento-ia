import { FastifyInstance } from 'fastify';
import * as authController from '../controllers/auth.controller';

export async function authRoutes(app: FastifyInstance): Promise<void> {
    app.post(
        '/auth/login',
        {
            config: {
                rateLimit: {
                    max: 5,
                    timeWindow: '15 minutes',
                },
            },
            schema: {
                body: {
                    type: 'object',
                    required: ['username', 'password'],
                    additionalProperties: false,
                    properties: {
                        username: { type: 'string', minLength: 1 },
                        password: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        authController.login,
    );

    app.post('/auth/logout', authController.logout);
    app.get('/auth/me', authController.me);
}
