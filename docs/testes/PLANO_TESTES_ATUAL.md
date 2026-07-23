# Plano de Testes — Escopo Atual

Referência: ESTRATEGIA_TESTES.md. Este documento lista o que deve ser testado agora, antes do deploy.

## 1. agendamento.service (Vitest — unitário)

- [ ] Rejeita agendamento com conflito de horário (mesmo horário, mesmo barbeiro).
- [ ] Aceita agendamento em horário livre.
- [ ] Rejeita agendamento fora do horário de funcionamento (antes das 9h, depois das 19h).
- [ ] Rejeita agendamento em domingo (fechado).
- [ ] Rejeita agendamento com antecedência menor que o mínimo permitido.
- [ ] Aceita agendamento com antecedência exatamente no limite mínimo (edge case).
- [ ] Cancelamento altera status para CANCELADO (não deleta fisicamente).
- [ ] Reagendamento dispara notificação (verificar chamada da função de envio, não o envio real).

## 2. cliente.service (Vitest — unitário)

- [ ] Não permite criar cliente duplicado (mesmo telefone).
- [ ] Validações básicas de campos obrigatórios.

## 3. Filtro anti-jailbreak (webhook) (Vitest — unitário)

- [ ] Bloqueia mensagem acima de 500 caracteres.
- [ ] Bloqueia mensagem contendo URL.
- [ ] Bloqueia padrões suspeitos conhecidos (ex: tentativas de prompt injection).
- [ ] Permite mensagem normal dentro do limite, sem URL, sem padrão suspeito.
- [ ] Filtra mensagens de grupo corretamente (não processa).

## 4. Conversão de timezone (date-fns-tz)

- [ ] Data salva em UTC é convertida corretamente para horário de Brasília na exibição.
- [ ] Data recebida em horário de Brasília é convertida corretamente para UTC no armazenamento.

## 5. gemini.service (Vitest — unitário)

- [x] consultarAgendamento usa somente telefone de sessão (contexto WhatsApp), ignorando telefone vindo em args/texto.
- [x] consultarAgendamento retorna agendamentos do próprio cliente quando existem.
- [x] consultarAgendamento não expõe dados de outro cliente via telefone informado pelo modelo.
- [x] atualizarAgendamento e cancelarAgendamento atuam apenas sobre agendamento ativo do telefone da sessão.
- [x] Retry 429 aplica backoff e erro tratado após esgotar tentativas.

## Fora de escopo por ora

- Chamada real da API Gemini: fora de escopo; manter validação local com mocks.
- Componentes React (DateTimePicker, SkeletonCard, CalendarGrid): sem teste automatizado enquanto o visual estiver em iteração.
- E2E completo do fluxo WhatsApp: fora de escopo atual.

## Critério de conclusão desta fase

Todos os itens marcados acima implementados e passando no CI (GitHub Actions) antes do deploy em produção.
