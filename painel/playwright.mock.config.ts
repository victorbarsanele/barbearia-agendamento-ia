import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    testMatch: [
        '**/novoAgendamentoPacote.spec.ts',
        '**/overrideExpediente.spec.ts',
        '**/loteAgendamentoPacote.spec.ts',
        '**/numerosIgnorados.spec.ts',
        '**/horizonteAgenda.spec.ts',
        '**/bottom-sheet.spec.ts',
    ],
    fullyParallel: true,
    workers: process.env.CI ? 1 : 2,
    reporter: 'list',
    projects: [
        {
            name: 'chromium-mock-api',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    use: {
        baseURL: 'http://127.0.0.1:5173',
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
    },
});
