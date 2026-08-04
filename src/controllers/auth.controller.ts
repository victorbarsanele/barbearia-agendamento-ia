import { compare } from 'bcryptjs';
import { FastifyReply, FastifyRequest } from 'fastify';
import { revokeAuthToken } from '../plugins/auth.plugin';

type UserRole = 'admin' | 'barber';

interface LoginBody {
    username: string;
    password: string;
}

interface FixedUser {
    username: string;
    passwordHash: string;
    role: UserRole;
}

interface AuthenticatedUser {
    username: string;
    role: UserRole;
}

const INVALID_CREDENTIALS_MESSAGE = 'Usuario ou senha incorretos';

function isCookieSecureEnabled(): boolean {
    return process.env.COOKIE_SECURE === 'true';
}

function getFixedUsers(): FixedUser[] {
    const users: FixedUser[] = [
        {
            username: process.env.ADMIN_USER ?? '',
            passwordHash: process.env.ADMIN_PASSWORD_HASH ?? '',
            role: 'admin',
        },
        {
            username: process.env.BARBER_USER ?? '',
            passwordHash: process.env.BARBER_PASSWORD_HASH ?? '',
            role: 'barber',
        },
    ];

    return users.filter(
        (user) => Boolean(user.username) && Boolean(user.passwordHash),
    );
}

export async function login(
    request: FastifyRequest<{ Body: LoginBody }>,
    reply: FastifyReply,
): Promise<void> {
    const { username, password } = request.body;
    const fixedUsers = getFixedUsers();

    const user = fixedUsers.find(
        (fixedUser) => fixedUser.username === username,
    );

    if (!user) {
        void reply.status(401).send({ message: INVALID_CREDENTIALS_MESSAGE });
        return;
    }

    const passwordMatches = await compare(password, user.passwordHash);

    if (!passwordMatches) {
        void reply.status(401).send({ message: INVALID_CREDENTIALS_MESSAGE });
        return;
    }

    const token = request.server.jwt.sign(
        {
            username: user.username,
            role: user.role,
        },
        {
            expiresIn: '8h',
        },
    );

    const cookieSecure = isCookieSecureEnabled();

    void reply
        .setCookie('token', token, {
            httpOnly: true,
            secure: cookieSecure,
            sameSite: cookieSecure ? 'none' : 'lax',
            path: '/',
            maxAge: 8 * 60 * 60,
        })
        .send({ message: 'Login realizado com sucesso.' });
}

export async function logout(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const token = request.cookies.token;

    if (token) {
        revokeAuthToken(token);
    }

    void reply.clearCookie('token', { path: '/' }).send({
        message: 'Logout realizado.',
    });
}

export async function me(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const user = request.user as AuthenticatedUser;

    void reply.send({
        username: user.username,
        role: user.role,
    });
}
