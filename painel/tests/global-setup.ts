import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { request, type FullConfig } from '@playwright/test';

const AUTH_FILE = 'auth.json';
const TOKEN_COOKIE = 'token';
const SESSION_MARGIN_MS = 10 * 60 * 1000;
const ENV_FILE = '.env.e2e';

function loadE2EEnvironment(rootDir: string): void {
    const envFile = path.resolve(rootDir, ENV_FILE);

    if (existsSync(envFile)) {
        process.loadEnvFile(envFile);
    }
}

function getRequiredCredentials(): { username: string; password: string } {
    const missing = ['E2E_USER', 'E2E_PASSWORD'].filter(
        (name) => !process.env[name],
    );

    if (missing.length > 0) {
        throw new Error(
            `Variáveis de ambiente ausentes: ${missing.join(', ')}. Configure painel/.env.e2e ou o ambiente da execução.`,
        );
    }

    return {
        username: process.env.E2E_USER as string,
        password: process.env.E2E_PASSWORD as string,
    };
}

function hasValidTokenCookie(authFile: string): boolean {
    if (!existsSync(authFile)) {
        return false;
    }

    try {
        const state = JSON.parse(readFileSync(authFile, 'utf8')) as {
            cookies?: Array<{ name?: string; expires?: number }>;
        };
        const tokenCookie = state.cookies?.find(
            (cookie) => cookie.name === TOKEN_COOKIE,
        );

        return Boolean(
            tokenCookie &&
                typeof tokenCookie.expires === 'number' &&
                tokenCookie.expires * 1000 > Date.now() + SESSION_MARGIN_MS,
        );
    } catch {
        return false;
    }
}

function serverUnavailable(): Error {
    return new Error(
        'painel/backend fora do ar (suba o dev server e o backend)',
    );
}

async function verifyStoredSession(
    baseURL: string,
    authFile: string,
): Promise<boolean> {
    const context = await request.newContext({
        baseURL,
        storageState: authFile,
    });

    try {
        const response = await context.get('/api/auth/me');

        if (response.status() >= 200 && response.status() < 300) {
            return true;
        }

        if (response.status() >= 500) {
            throw serverUnavailable();
        }

        return false;
    } catch (error) {
        if (error instanceof Error && error.message === serverUnavailable().message) {
            throw error;
        }

        throw serverUnavailable();
    } finally {
        await context.dispose();
    }
}

function loginError(status: number): Error {
    if (status === 401) {
        return new Error('credencial E2E inválida');
    }

    if (status === 429) {
        return new Error('rate limit do login (5 por 15 min); aguarde');
    }

    if (status >= 500) {
        return serverUnavailable();
    }

    return new Error(`login E2E falhou com status ${status}`);
}

async function loginAndSaveSession(
    baseURL: string,
    authFile: string,
    username: string,
    password: string,
): Promise<void> {
    const context = await request.newContext({ baseURL });

    try {
        const response = await context.post('/api/auth/login', {
            data: { username, password },
        });

        if (!response.ok()) {
            throw loginError(response.status());
        }

        await context.storageState({ path: authFile });
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('login E2E')) {
            throw error;
        }

        if (
            error instanceof Error &&
            (error.message === 'credencial E2E inválida' ||
                error.message === 'rate limit do login (5 por 15 min); aguarde' ||
                error.message ===
                    'painel/backend fora do ar (suba o dev server e o backend)')
        ) {
            throw error;
        }

        throw serverUnavailable();
    } finally {
        await context.dispose();
    }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
    const baseURL = config.projects[0]?.use.baseURL;

    if (typeof baseURL !== 'string' || baseURL.length === 0) {
        throw new Error('baseURL não configurada no Playwright.');
    }

    const configDirectory = config.configFile
        ? path.dirname(config.configFile)
        : process.cwd();
    const authFile = path.resolve(configDirectory, AUTH_FILE);

    if (
        hasValidTokenCookie(authFile) &&
        (await verifyStoredSession(baseURL, authFile))
    ) {
        console.log('auth setup: sessão reutilizada');
        return;
    }

    loadE2EEnvironment(configDirectory);
    const credentials = getRequiredCredentials();

    await loginAndSaveSession(
        baseURL,
        authFile,
        credentials.username,
        credentials.password,
    );
    console.log('auth setup: login realizado e auth.json atualizado');
}