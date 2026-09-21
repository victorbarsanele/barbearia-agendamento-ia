import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    testMatch: '**/*.unit.spec.ts',
    fullyParallel: true,
    reporter: 'list',
    projects: [{ name: 'unit', use: {} }],
});