CREATE TABLE "rascunhos_agendamento" (
    "telefoneSessao" TEXT NOT NULL,
    "nomeCliente" TEXT NOT NULL,
    "telefoneCliente" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "dataHoraInicio" TIMESTAMPTZ(3) NOT NULL,
    "mensagemCriacaoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rascunhos_agendamento_pkey" PRIMARY KEY ("telefoneSessao"),
    CONSTRAINT "rascunhos_agendamento_servicoId_fkey"
        FOREIGN KEY ("servicoId") REFERENCES "servicos"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "rascunhos_agendamento_expiraEm_idx"
    ON "rascunhos_agendamento"("expiraEm");

CREATE INDEX "rascunhos_agendamento_servicoId_idx"
    ON "rascunhos_agendamento"("servicoId");
