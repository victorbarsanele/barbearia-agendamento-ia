import { expect, test, type Page } from '@playwright/test';

interface NumeroIgnorado {
    id: string;
    telefone: string;
    rotulo: string;
    criadoEm: string;
}

interface MockResponse {
    status: number;
    body: unknown;
}

interface MockOptions {
    initial?: NumeroIgnorado[];
    listError?: string;
    createResponses?: MockResponse[];
}

interface MockApi {
    items: NumeroIgnorado[];
    posts: Record<string, unknown>[];
    deletes: string[];
}

const numeroExistente: NumeroIgnorado = {
    id: 'numero-existente',
    telefone: '5511888888888',
    rotulo: 'Família',
    criadoEm: '2026-10-28T12:00:00.000Z',
};

async function mockApi(
    page: Page,
    options: MockOptions = {},
): Promise<MockApi> {
    const state: MockApi = {
        items: [...(options.initial ?? [])],
        posts: [],
        deletes: [],
    };

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        let response: MockResponse = {
            status: 404,
            body: { message: 'Rota não prevista pelo teste.' },
        };

        if (request.method() === 'GET' && url.pathname === '/api/auth/me') {
            response = {
                status: 200,
                body: { username: 'e2e', role: 'admin' },
            };
        } else if (
            request.method() === 'GET' &&
            url.pathname === '/api/numeros-ignorados'
        ) {
            response = options.listError
                ? { status: 500, body: { message: options.listError } }
                : { status: 200, body: state.items };
        } else if (
            request.method() === 'POST' &&
            url.pathname === '/api/numeros-ignorados'
        ) {
            const payload = JSON.parse(request.postData() ?? '{}') as Record<
                string,
                unknown
            >;
            state.posts.push(payload);
            const configured =
                options.createResponses?.[state.posts.length - 1];

            if (configured && configured.status >= 400) {
                response = configured;
            } else {
                const item = (configured?.body as
                    | NumeroIgnorado
                    | undefined) ?? {
                    id: `numero-criado-${state.posts.length}`,
                    telefone: '5511999999999',
                    rotulo: String(payload.rotulo),
                    criadoEm: '2026-10-28T13:00:00.000Z',
                };
                state.items.unshift(item);
                response = { status: 201, body: item };
            }
        } else if (
            request.method() === 'DELETE' &&
            url.pathname.startsWith('/api/numeros-ignorados/')
        ) {
            const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
            state.deletes.push(id);
            state.items = state.items.filter((item) => item.id !== id);
            await route.fulfill({ status: 204 });
            return;
        }

        await route.fulfill({ status: response.status, json: response.body });
    });

    return state;
}

test('mostra texto explicativo quando lista está vazia', async ({ page }) => {
    await mockApi(page);
    await page.goto('/numeros-ignorados');

    await expect(
        page.getByText(
            'Nenhum número ignorado. Cadastre números de prestadores ou familiares para o assistente não responder a eles.',
        ),
    ).toBeVisible();
});

test('erro de carga não mostra estado vazio', async ({ page }) => {
    await mockApi(page, { listError: 'Falha ao carregar lista.' });
    await page.goto('/numeros-ignorados');

    await expect(page.getByRole('alert')).toHaveText(
        'Falha ao carregar lista.',
    );
    await expect(page.getByText(/Nenhum número ignorado/)).toHaveCount(0);
});

test('cadastra telefone colado e coloca resposta no topo da lista', async ({
    page,
}) => {
    const state = await mockApi(page, { initial: [numeroExistente] });
    await page.goto('/numeros-ignorados');
    await page.getByLabel('Telefone *').fill('+55 (11) 99999-9999');
    await page.getByLabel('Rótulo *').fill(' Prestador ');
    await page.getByRole('button', { name: 'Adicionar número' }).click();

    await expect.poll(() => state.posts.length).toBe(1);
    expect(state.posts[0]).toEqual({
        telefone: '+55 (11) 99999-9999',
        rotulo: 'Prestador',
    });
    await expect
        .poll(() =>
            page
                .getByTestId('numero-ignorado-item')
                .locator('p.font-semibold')
                .allTextContents(),
        )
        .toEqual(['Prestador', 'Família']);
    await expect(page.getByLabel('Telefone *')).toHaveValue('');
});

test('mostra duplicidade como erro inline', async ({ page }) => {
    const state = await mockApi(page, {
        createResponses: [
            {
                status: 409,
                body: {
                    message: 'Número já cadastrado na lista.',
                    code: 'NUMERO_JA_CADASTRADO',
                },
            },
        ],
    });
    await page.goto('/numeros-ignorados');
    await page.getByLabel('Telefone *').fill('+55 (11) 99999-9999');
    await page.getByLabel('Rótulo *').fill('Prestador');
    await page.getByRole('button', { name: 'Adicionar número' }).click();

    await expect(page.getByRole('alert')).toHaveText(
        'Número já cadastrado na lista.',
    );
    expect(state.posts).toHaveLength(1);
});

test('confirma número que pertence a cliente e reenvia flag', async ({
    page,
}) => {
    const state = await mockApi(page, {
        createResponses: [
            {
                status: 409,
                body: {
                    message: 'Número pertence a cliente cadastrado.',
                    code: 'NUMERO_E_CLIENTE',
                },
            },
        ],
    });
    await page.goto('/numeros-ignorados');
    await page.getByLabel('Telefone *').fill('+55 (11) 99999-9999');
    await page.getByLabel('Rótulo *').fill('Prestador');
    await page.getByRole('button', { name: 'Adicionar número' }).click();

    const dialog = page.getByRole('dialog', {
        name: 'Este número é de um cliente',
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Se continuar/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Ignorar mesmo assim' }).click();

    await expect.poll(() => state.posts.length).toBe(2);
    expect(state.posts[1]).toEqual({
        telefone: '+55 (11) 99999-9999',
        rotulo: 'Prestador',
        confirmarMesmoSendoCliente: true,
    });
    await expect(page.getByLabel('Telefone *')).toHaveValue('');
});

test('cancelar confirmação de cliente mantém formulário', async ({ page }) => {
    const state = await mockApi(page, {
        createResponses: [
            {
                status: 409,
                body: {
                    message: 'Número pertence a cliente cadastrado.',
                    code: 'NUMERO_E_CLIENTE',
                },
            },
        ],
    });
    await page.goto('/numeros-ignorados');
    await page.getByLabel('Telefone *').fill('+55 (11) 99999-9999');
    await page.getByLabel('Rótulo *').fill('Prestador');
    await page.getByRole('button', { name: 'Adicionar número' }).click();

    const dialog = page.getByRole('dialog', {
        name: 'Este número é de um cliente',
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel('Telefone *')).toHaveValue(
        '+55 (11) 99999-9999',
    );
    await expect(page.getByLabel('Rótulo *')).toHaveValue('Prestador');
    expect(state.posts).toHaveLength(1);
});

test('falha após confirmar cliente fecha diálogo e mantém formulário', async ({
    page,
}) => {
    await mockApi(page, {
        createResponses: [
            {
                status: 409,
                body: {
                    message: 'Número pertence a cliente cadastrado.',
                    code: 'NUMERO_E_CLIENTE',
                },
            },
            {
                status: 422,
                body: {
                    message: 'Telefone WhatsApp inválido.',
                    code: 'TELEFONE_INVALIDO',
                },
            },
        ],
    });
    await page.goto('/numeros-ignorados');
    await page.getByLabel('Telefone *').fill('+55 (11) 99999-9999');
    await page.getByLabel('Rótulo *').fill('Prestador');
    await page.getByRole('button', { name: 'Adicionar número' }).click();

    const dialog = page.getByRole('dialog', {
        name: 'Este número é de um cliente',
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Ignorar mesmo assim' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveText(
        'Telefone WhatsApp inválido.',
    );
    await expect(page.getByLabel('Telefone *')).toHaveValue(
        '+55 (11) 99999-9999',
    );
    await expect(page.getByLabel('Rótulo *')).toHaveValue('Prestador');
});

test('remove número somente após confirmação', async ({ page }) => {
    const state = await mockApi(page, { initial: [numeroExistente] });
    await page.goto('/numeros-ignorados');

    await page.getByRole('button', { name: 'Excluir número Família' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remover número?' });
    await expect(dialog).toBeVisible();
    await expect(page.getByText('Família')).toBeVisible();
    await dialog.getByRole('button', { name: 'Remover' }).click();

    await expect(page.getByTestId('numero-ignorado-item')).toHaveCount(0);
    expect(state.deletes).toEqual(['numero-existente']);
});

test('rótulo vazio mantém botão desabilitado', async ({ page }) => {
    await mockApi(page);
    await page.goto('/numeros-ignorados');
    await page.getByLabel('Telefone *').fill('+55 (11) 99999-9999');
    await page.getByLabel('Rótulo *').fill('   ');

    await expect(
        page.getByRole('button', { name: 'Adicionar número' }),
    ).toBeDisabled();
});
