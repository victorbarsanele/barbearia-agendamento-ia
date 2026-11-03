# Variáveis de ambiente

Use defaults abaixo como comportamento do código quando variável estiver ausente. “Obrigatória” indica requisito de inicialização ou da integração descrita; segredo não deve ser versionado.

## Servidor

| Variável       | Obrigatória                  | Padrão                  | Faixa/regra                                                               | Descrição                                  |
| -------------- | ---------------------------- | ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| `DATABASE_URL` | Sim, para inicializar Prisma | Sem padrão              | URL de conexão PostgreSQL; sem validação de formato na aplicação          | Conexão do backend e dos testes com banco. |
| `PORT`         | Não                          | `3333`                  | Convertida com `Number`; sem validação de faixa na aplicação              | Porta HTTP do backend.                     |
| `CORS_ORIGINS` | Não                          | `http://localhost:5173` | Origens separadas por vírgula; espaços removidos e itens vazios ignorados | Allowlist de origens CORS.                 |

## Autenticação

| Variável               | Obrigatória           | Padrão     | Faixa/regra                                            | Descrição                                   |
| ---------------------- | --------------------- | ---------- | ------------------------------------------------------ | ------------------------------------------- |
| `JWT_SECRET`           | Sim, na inicialização | Sem padrão | Deve ser não vazia                                     | Segredo usado para assinar/verificar JWT.   |
| `ADMIN_USER`           | Não individualmente   | Sem padrão | Login habilitado somente com usuário e hash não vazios | Usuário administrativo.                     |
| `ADMIN_PASSWORD_HASH`  | Não individualmente   | Sem padrão | Login habilitado somente com usuário e hash não vazios | Hash bcrypt da senha administrativa.        |
| `BARBER_USER`          | Não individualmente   | Sem padrão | Login habilitado somente com usuário e hash não vazios | Usuário do barbeiro.                        |
| `BARBER_PASSWORD_HASH` | Não individualmente   | Sem padrão | Login habilitado somente com usuário e hash não vazios | Hash bcrypt da senha do barbeiro.           |
| `COOKIE_SECURE`        | Não                   | Desativado | Só valor exato `true` ativa atributo Secure            | Define atributo Secure do cookie de sessão. |

## Gemini e identidade

| Variável         | Obrigatória                           | Padrão     | Faixa/regra                                                                                       | Descrição                                                               |
| ---------------- | ------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GEMINI_API_KEY` | Para chamadas Gemini                  | Sem padrão | Sem validação de formato                                                                          | Chave principal da API Gemini.                                          |
| `GOOGLE_API_KEY` | Não                                   | Sem padrão | Fallback usado somente quando `GEMINI_API_KEY` está ausente; não recomendado                      | Compatibilidade legada para chave Gemini. Não consta em `.env.example`. |
| `BARBER_PHONE`   | Sim quando `WHATSAPP_PROVIDER=ycloud` | Sem padrão | Obrigatória e não pode equivaler a `YCLOUD_FROM_NUMBER`; sem faixa própria adicional no validador | Destino de notificações e referência do barbeiro.                       |
| `BARBER_NAME`    | Não                                   | Sem padrão | Nome trimado; sem limite explícito                                                                | Nome usado na identidade do barbeiro no prompt.                         |
| `BARBER_ALIASES` | Não                                   | Sem padrão | Apelidos separados por vírgula; entradas vazias ignoradas                                         | Apelidos aceitos para identificar o barbeiro.                           |

## Webhooks

| Variável                | Obrigatória                           | Padrão     | Faixa/regra                                                                           | Descrição                                                  |
| ----------------------- | ------------------------------------- | ---------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `WEBHOOK_SECRET`        | Para aceitar webhook Evolution        | Sem padrão | Header `x-webhook-secret` deve corresponder exatamente; não validada na inicialização | Segredo do webhook Evolution.                              |
| `YCLOUD_WEBHOOK_SECRET` | Sim quando `WHATSAPP_PROVIDER=ycloud` | Sem padrão | Não vazia; assinatura HMAC-SHA256 com timestamp dentro de cinco minutos               | Segredo usado para validar corpo bruto recebido da YCloud. |

## WhatsApp, YCloud e Evolution

| Variável                  | Obrigatória                           | Padrão                  | Faixa/regra                                                                                                               | Descrição                                                                                        |
| ------------------------- | ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `WHATSAPP_PROVIDER`       | Recomendada explícita em produção     | `evolution` no código   | Somente `evolution` ou `ycloud`; produção define `ycloud` explicitamente                                                  | Seleciona provedor de entrada/saída.                                                             |
| `EVOLUTION_API_KEY`       | Para envio Evolution                  | Sem padrão              | Sem validação de formato na inicialização                                                                                 | Chave de acesso Evolution.                                                                       |
| `EVOLUTION_API_URL`       | Não                                   | `http://localhost:8080` | URL usada como base; sem validação própria                                                                                | Endereço base da API Evolution.                                                                  |
| `EVOLUTION_INSTANCE_NAME` | Não                                   | `barbearia`             | Sem validação própria                                                                                                     | Instância Evolution usada no envio.                                                              |
| `YCLOUD_API_KEY`          | Sim quando `WHATSAPP_PROVIDER=ycloud` | Sem padrão              | Não vazia                                                                                                                 | Chave de API YCloud.                                                                             |
| `YCLOUD_FROM_NUMBER`      | Sim quando `WHATSAPP_PROVIDER=ycloud` | Sem padrão              | Formato `+` seguido por 8 a 15 dígitos                                                                                    | Número conectado à YCloud.                                                                       |
| `WHATSAPP_ALLOWLIST`      | Não                                   | Desativada              | Lista separada por vírgula; telefones canonicalizados, 8 a 15 dígitos. Conteúdo não vazio sem entradas válidas causa erro | Allowlist opcional para validação. Ausente ou vazia desativa filtro; não está ativa em produção. |

## Escalonamento e rascunho

| Variável                            | Obrigatória | Padrão    | Faixa/regra                                                                                                                                | Descrição                                                             |
| ----------------------------------- | ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `ESCALATION_COOLDOWN_MS`            | Não         | `900000`  | Sem faixa global: fluxo Gemini converte com `Number`; aviso YCloud de usuário sem telefone aceita número finito `>= 0`, senão usa fallback | Cooldown entre avisos/escalonamentos.                                 |
| `HUMAN_TAKEOVER_TTL_MS`             | Não         | `1800000` | Número finito `> 0`; valor inválido usa fallback                                                                                           | TTL do takeover humano, deslizante desde última mensagem do barbeiro. |
| `PENDING_BOOKING_TTL_MS`            | Não         | `1800000` | Número finito `> 0`; valor inválido usa fallback                                                                                           | TTL de rascunho de agendamento.                                       |
| `PENDING_BOOKING_REMINDER_DELAY_MS` | Não         | `600000`  | Número finito `> 0`; valor inválido usa fallback                                                                                           | Atraso antes do lembrete de rascunho.                                 |

## Agendamento e antecedência

| Variável                         | Obrigatória | Padrão | Faixa/regra                                                         | Descrição                                                                           |
| -------------------------------- | ----------- | ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `MIN_ANTECEDENCIA_MINUTOS`       | Não         | `60`   | Inteiro entre `0` e `1440`; valor inválido interrompe inicialização | Antecedência mínima para criar/alterar agendamento.                                 |
| `OFERTA_FOLGA_MINUTOS`           | Não         | `0`    | Inteiro entre `0` e `120`; valor inválido interrompe inicialização  | Folga adicional somente ao oferecer horários pelo WhatsApp.                         |
| `CONFIRMACAO_TOLERANCIA_MINUTOS` | Não         | `0`    | Inteiro entre `0` e `60`; valor inválido interrompe inicialização   | Tolerância aplicada à confirmação de rascunho, sem alterar criação pelo painel/API. |
| `AVISO_CURTO_PRAZO_MINUTOS`      | Não         | `60`   | Inteiro entre `0` e `1440`; valor inválido interrompe inicialização | Inclui aviso no resumo quando horário está mais próximo que o limite.               |

## Mídia e áudio

| Variável                      | Obrigatória | Padrão     | Faixa/regra                                                     | Descrição                                           |
| ----------------------------- | ----------- | ---------- | --------------------------------------------------------------- | --------------------------------------------------- |
| `MEDIA_NOTICE_COOLDOWN_MS`    | Não         | `600000`   | Número finito `>= 0`; inválido usa fallback                     | Intervalo mínimo entre avisos de mídia não textual. |
| `AUDIO_TRANSCRIPTION_ENABLED` | Não         | Desativada | Só valor exato `true` ativa                                     | Habilita transcrição de áudio recebido.             |
| `AUDIO_MAX_BYTES`             | Não         | `600000`   | Número finito `> 0`; inválido usa fallback, sem máximo definido | Limite de bytes do áudio baixado.                   |
| `AUDIO_DOWNLOAD_TIMEOUT_MS`   | Não         | `10000`    | Número finito `> 0`; inválido usa fallback                      | Timeout para download de áudio, em milissegundos.   |
| `AUDIO_TRANSCRIBE_TIMEOUT_MS` | Não         | `30000`    | Número finito `> 0`; inválido usa fallback                      | Timeout de transcrição, em milissegundos.           |
| `AUDIO_MAX_CONCURRENCY`       | Não         | `3`        | Número finito `> 0`; inválido usa fallback                      | Máximo de transcrições simultâneas.                 |
| `AUDIO_MAX_QUEUE`             | Não         | `10`       | Número finito `> 0`; inválido usa fallback                      | Máximo de áudios aguardando processamento.          |

Os valores numéricos de `AUDIO_*` não têm limite superior e o código não exige inteiros.

## Google Agenda

| Variável                             | Obrigatória           | Padrão     | Faixa/regra                                                                                   | Descrição                                           |
| ------------------------------------ | --------------------- | ---------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `GOOGLE_CALENDAR_SYNC_ENABLED`       | Não                   | Desativada | Só valor exato `true` ativa sincronização                                                     | Ativa espelho unidirecional de agendamentos.        |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Sim quando sync ativa | Sem padrão | Base64 estrito com round-trip; JSON deve conter `client_email` com `@` e `private_key` válida | Credencial da service account codificada em Base64. |
| `GOOGLE_CALENDAR_ID`                 | Sim quando sync ativa | Sem padrão | Não vazia após trim; sem faixa adicional                                                      | ID da agenda dedicada.                              |

## Controle e desenvolvimento

| Variável            | Obrigatória         | Padrão                             | Faixa/regra                                                              | Descrição                                                                                                               |
| ------------------- | ------------------- | ---------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `SIMULACAO_WEBHOOK` | Não                 | Desativada                         | Só valor exato `true` ativa                                              | Evolution ignora simulação em `NODE_ENV=production`; caminho YCloud suprime envio quando ativa, sem guarda de produção. |
| `NODE_ENV`          | Não                 | Definido pelo ambiente de execução | Código compara valores exatos `production` e `test`                      | Ajusta comportamento de simulação e repositórios.                                                                       |
| `VITEST`            | Não                 | Ausente fora do Vitest             | Qualquer valor truthy impede carregamento automático de dotenv           | Marcador de execução de testes.                                                                                         |
| `CI`                | Não                 | Ausente fora de CI                 | Valor truthy altera workers/retries e bloqueia `test.only` no Playwright | Modo de execução de CI do Playwright.                                                                                   |
| `E2E_USER`          | Sim para E2E padrão | Sem padrão                         | Deve ser não vazia                                                       | Usuário de login E2E; pode vir de `painel/.env.e2e`.                                                                    |
| `E2E_PASSWORD`      | Sim para E2E padrão | Sem padrão                         | Deve ser não vazia                                                       | Senha de login E2E; pode vir de `painel/.env.e2e`.                                                                      |
