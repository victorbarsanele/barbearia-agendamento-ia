# Plano de Testes — Futuro (pós-deploy / escopo estabilizado)

Referência: ESTRATEGIA_TESTES.md. Itens aqui só entram em execução quando o escopo funcional estiver congelado e o produto estável em produção.

## 1. Integração com Gemini (Function Calling)

- [ ] Teste de contrato: dado um input conhecido, a função correta é chamada com os parâmetros esperados (mock do Gemini, não chamada real).
- [ ] Teste de fallback: comportamento quando a API do Gemini falha ou tem timeout.
- [ ] Teste de quota: comportamento ao atingir limite de RPD/RPM (fila, erro tratado, mensagem ao usuário).
- [ ] Teste de integração do loop completo de function calling com múltiplas chamadas encadeadas no mesmo turno (mock de SDK).

## 2. E2E — Fluxo WhatsApp (Playwright ou script de integração)

- [ ] Simular mensagem de cliente → resposta do bot → criação de agendamento → confirmação.
- [ ] Simular tentativa de agendamento em horário indisponível → resposta correta do bot.
- [ ] Simular cancelamento via WhatsApp garantindo isolamento de sessão por `remoteJid` entre clientes diferentes.

## 3. Painel React (Vitest + Testing Library)

- [ ] DateTimePicker: seleção de data/hora reflete corretamente no estado do formulário.
- [ ] CalendarGrid: navegação entre meses, seleção de dia fora do mês atual.
- [ ] SkeletonCard: renderiza durante loading, some ao carregar dados.
- [ ] Fluxo de criação de agendamento (formulário completo).
- [ ] Fluxo de cancelamento com modal de confirmação.

## 4. Autenticação (JWT)

- [ ] Login com credenciais válidas retorna token.
- [ ] Login com credenciais inválidas é rejeitado.
- [ ] Rotas protegidas rejeitam acesso sem token válido.

## 5. CI/CD

- [ ] Pipeline GitHub Actions rodando testes unitários em todo PR.
- [ ] Pipeline rodando E2E antes de deploy em produção (se e quando E2E for implementado).
- [ ] Relatório de cobertura visível (sem meta de percentual obrigatório, só visibilidade).

## 6. Funcionalidades futuras (quando implementadas)

- [ ] Interpretação de áudio no WhatsApp: testes de transcrição/interpretação (escopo a definir quando a feature for especificada).
- [ ] Agendamentos em massa (pacotes mensais): testes de criação em lote, validação de conflitos múltiplos.

## Gatilho de revisão

Revisitar este documento quando:

- Deploy em produção estiver estável há pelo menos 2-4 semanas.
- Uma das features futuras entrar em desenvolvimento ativo.
