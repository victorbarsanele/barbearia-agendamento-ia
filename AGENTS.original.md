# AGENTS.md

## Project Snapshot

- Monorepo leve com backend em raiz e frontend em `painel/`.
- Backend: Node.js + TypeScript + Fastify + Prisma + PostgreSQL + JWT (`@fastify/jwt`) + bcrypt (`bcryptjs`).
- Frontend: React + Vite + TypeScript + Tailwind CSS v4.
- Autenticação implementada com login em `/auth/login` e proteção via hook global (exceções: `/auth/login` e `/webhook/whatsapp`).

## Editor And Tooling Conventions

- Format on save is enabled.
- Prettier is the default formatter.
- ESLint auto-fix runs on save.
- TypeScript imports should use relative module specifiers.

## Agent Working Rules

- Keep changes small and focused.
- Follow existing formatting and lint rules.
- Prefer creating minimal project structure first, then iterate.
- Do not introduce global architectural patterns without explicit project files that justify them.

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

- Use link-first documentation: reference canonical docs instead of duplicating details.
- If `README.md`, `CONTRIBUTING.md`, or architecture docs are added, link them here and keep this file concise.
