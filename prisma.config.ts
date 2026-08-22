import { config } from 'dotenv';

const globalWithDotenvFlag = globalThis as typeof globalThis & {
    __dotenvConfigLoaded?: boolean;
};

if (!globalWithDotenvFlag.__dotenvConfigLoaded && !process.env.VITEST) {
    config({ override: true });
    globalWithDotenvFlag.__dotenvConfigLoaded = true;
}

import { defineConfig, env } from 'prisma/config';

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: env('DATABASE_URL'),
    },
});
