interface ApiFetchOptions extends RequestInit {
    withAuth?: boolean;
}

export async function apiFetch(
    input: RequestInfo | URL,
    options: ApiFetchOptions = {},
): Promise<Response> {
    const { withAuth = true, headers, ...restOptions } = options;
    const nextHeaders = new Headers(headers);

    if (withAuth) {
        const token = localStorage.getItem('token');

        if (token) {
            nextHeaders.set('Authorization', `Bearer ${token}`);
        }
    }

    return fetch(input, {
        ...restOptions,
        headers: nextHeaders,
    });
}
