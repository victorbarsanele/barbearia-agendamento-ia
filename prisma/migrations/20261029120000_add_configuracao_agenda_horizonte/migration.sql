CREATE TABLE "configuracoes_agenda" (
    "id" INTEGER NOT NULL,
    "horizonteDias" INTEGER,
    "limiteAte" DATE,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "configuracoes_agenda_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "configuracoes_agenda_id_check" CHECK ("id" = 1)
);