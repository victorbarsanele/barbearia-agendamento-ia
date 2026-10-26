CREATE TYPE "StatusSincronizacaoGoogleAgenda" AS ENUM ('PENDENTE', 'SINCRONIZADO', 'ERRO');

CREATE TABLE "sincronizacoes_google_agenda" (
    "agendamentoId" TEXT NOT NULL,
    "status" "StatusSincronizacaoGoogleAgenda" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaTentativaEm" TIMESTAMPTZ(3) NOT NULL,
    "ultimoErro" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sincronizacoes_google_agenda_pkey" PRIMARY KEY ("agendamentoId")
);

CREATE INDEX "sincronizacoes_google_agenda_status_proximaTentativaEm_idx"
ON "sincronizacoes_google_agenda"("status", "proximaTentativaEm");