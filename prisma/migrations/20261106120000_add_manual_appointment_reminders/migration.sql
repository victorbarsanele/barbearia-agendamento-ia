CREATE TYPE "StatusLembreteAgendamentoEnvio" AS ENUM ('PENDENTE', 'ACEITO', 'FALHOU');

CREATE TABLE "lembretes_agendamento_envios" (
    "id" TEXT NOT NULL,
    "agendamentoId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "StatusLembreteAgendamentoEnvio" NOT NULL DEFAULT 'PENDENTE',
    "motivoFalha" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "aceitoEm" TIMESTAMPTZ(3),

    CONSTRAINT "lembretes_agendamento_envios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contextos_remarcacao" (
    "id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "agendamentoId" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,
    "consumidoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contextos_remarcacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lembretes_agendamento_envios_agendamentoId_ativo_key"
    ON "lembretes_agendamento_envios"("agendamentoId")
    WHERE "status" IN ('PENDENTE', 'ACEITO');

CREATE INDEX "lembretes_agendamento_envios_agendamentoId_criadoEm_idx"
    ON "lembretes_agendamento_envios"("agendamentoId", "criadoEm");

CREATE UNIQUE INDEX "contextos_remarcacao_telefone_key"
    ON "contextos_remarcacao"("telefone");

CREATE INDEX "contextos_remarcacao_expiraEm_idx"
    ON "contextos_remarcacao"("expiraEm");

ALTER TABLE "lembretes_agendamento_envios"
    ADD CONSTRAINT "lembretes_agendamento_envios_agendamentoId_fkey"
    FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contextos_remarcacao"
    ADD CONSTRAINT "contextos_remarcacao_agendamentoId_fkey"
    FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;