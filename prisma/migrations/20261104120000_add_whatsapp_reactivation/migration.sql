CREATE TYPE "StatusReativacaoEnvio" AS ENUM ('PENDENTE', 'ACEITA', 'ENTREGUE', 'FALHOU');

ALTER TABLE "clientes"
ADD COLUMN "optOutMarketingEm" TIMESTAMPTZ(3);

CREATE TABLE "reativacoes_envios" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "ycloudMessageId" TEXT,
    "status" "StatusReativacaoEnvio" NOT NULL DEFAULT 'PENDENTE',
    "motivoFalha" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reativacoes_envios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reativacoes_envios_clienteId_fkey"
        FOREIGN KEY ("clienteId") REFERENCES "clientes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "reativacoes_envios_ycloudMessageId_idx"
ON "reativacoes_envios"("ycloudMessageId");

CREATE INDEX "reativacoes_envios_clienteId_criadoEm_idx"
ON "reativacoes_envios"("clienteId", "criadoEm");