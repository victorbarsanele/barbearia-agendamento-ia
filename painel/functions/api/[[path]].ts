const BACKEND = 'https://barbearia-agendamento-ia.up.railway.app';

interface Context {
    request: Request;
    params: { path?: string | string[] };
}

export const onRequest = async ({ request, params }: Context) => {
    const path = Array.isArray(params.path)
        ? params.path.join('/')
        : (params.path ?? '');
    const { search } = new URL(request.url);

    const headers = new Headers(request.headers);
    headers.delete('host');
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) headers.set('X-Forwarded-For', clientIp);

    return fetch(`${BACKEND}/${path}${search}`, {
        method: request.method,
        headers,
        body:
            request.method === 'GET' || request.method === 'HEAD'
                ? undefined
                : request.body,
        redirect: 'manual',
    });
};
