-- CreateTable
CREATE TABLE "bloqueios_horario" (
    "id" TEXT NOT NULL,
    "dataHoraInicio" TIMESTAMPTZ(3) NOT NULL,
    "dataHoraFim" TIMESTAMPTZ(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueios_horario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bloqueios_horario_dataHoraInicio_dataHoraFim_idx" ON "bloqueios_horario"("dataHoraInicio", "dataHoraFim");
