type ApiFetchOptions = RequestInit;

export async function apiFetch(
    input: string | URL | Request,
    options: ApiFetchOptions = {},
): Promise<Response> {
    const { headers, ...restOptions } = options;
    const nextHeaders = new Headers(headers);

    return fetch(input, {
        ...restOptions,
        headers: nextHeaders,
        credentials: 'include',
    });
}
