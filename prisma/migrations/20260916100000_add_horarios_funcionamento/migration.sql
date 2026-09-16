-- CreateTable
CREATE TABLE "horarios_funcionamento" (
    "id" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaAberturaMinutos" INTEGER NOT NULL,
    "horaFechamentoMinutos" INTEGER NOT NULL,
    "limiteExtensaoMinutos" INTEGER,
    "ultimoInicioExtensaoMinutos" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "horarios_funcionamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "horarios_funcionamento_diaSemana_key" ON "horarios_funcionamento"("diaSemana");

-- Seed current opening hours: Monday-Friday 09:00-20:00, Saturday 08:00-17:00.
INSERT INTO "horarios_funcionamento" (
    "id",
    "diaSemana",
    "horaAberturaMinutos",
    "horaFechamentoMinutos",
    "limiteExtensaoMinutos",
    "ultimoInicioExtensaoMinutos",
    "updatedAt"
) VALUES
    ('horario-segunda', 1, 540, 1200, NULL, NULL, NOW()),
    ('horario-terca', 2, 540, 1200, NULL, NULL, NOW()),
    ('horario-quarta', 3, 540, 1200, NULL, NULL, NOW()),
    ('horario-quinta', 4, 540, 1200, 1230, 1170, NOW()),
    ('horario-sexta', 5, 540, 1200, 1230, 1170, NOW()),
    ('horario-sabado', 6, 480, 1020, NULL, NULL, NOW());
