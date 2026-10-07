CREATE TABLE "mensagens_whatsapp_processadas" (
    "provedor" TEXT NOT NULL,
    "idMensagem" TEXT NOT NULL,
    "registradoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_whatsapp_processadas_pkey"
        PRIMARY KEY ("provedor", "idMensagem")
);
