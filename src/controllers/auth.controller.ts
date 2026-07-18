import { compare } from 'bcryptjs';
import { FastifyReply, FastifyRequest } from 'fastify';

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

const INVALID_CREDENTIALS_MESSAGE = 'Usuario ou senha incorretos';

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

    void reply.send({ token });
}
