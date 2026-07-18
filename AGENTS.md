# AGENTS.md

## Project Snapshot

- Monorepo: backend na raiz, frontend em `painel/`.
- Backend: Node.js, TypeScript, Fastify, Prisma, PostgreSQL, JWT (`@fastify/jwt`), bcrypt (`bcryptjs`).
- Frontend: React, Vite, TypeScript, Tailwind CSS v4.
- Auth ativa: login em `/auth/login`; hook global protege rotas; exceções: `/auth/login`, `/webhook/whatsapp`.

## Editor And Tooling Conventions

- Format on save is enabled.
- Prettier is the default formatter.
- ESLint auto-fix runs on save.
- TypeScript imports should use relative module specifiers.

## Agent Working Rules

- Keep changes small, focused.
- Follow formatting and lint rules.
- Build minimal structure first, iterate depois.
- No global architecture sem arquivos projeto justificando.

## Commands

- Backend build: `npm run build`
- Backend dev/run: `npm run dev`
- Backend production start: `npm start`
- Backend test: not defined yet.
- Backend lint: not defined yet.
- Frontend dev/run: `cd painel && npm run dev`
- Frontend build: `cd painel && npm run build`
- Frontend lint: `cd painel && npm run lint`
- Frontend test: not defined yet.

When linting and test commands are added, update this file with the exact commands.

## Suggested Early Structure

- `src/` (backend app code)
- `prisma/` (schema and migrations)
- `scripts/` (utilitários, ex.: `gerar-hash.ts`)
- `painel/src/` (frontend app code)
- `tests/` for automated tests (when created)
- `docs/` for architecture and contribution notes (when created)

## Documentation Strategy

- Use link-first docs: reference canonical docs, avoid duplication.
- If `README.md`, `CONTRIBUTING.md`, architecture docs exist, link here, keep file concise.
