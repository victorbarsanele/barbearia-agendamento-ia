# Estratégia de Testes — Sistema de Agendamento Inteligente para Barbearia

## Princípio geral

Cobertura de testes proporcional ao risco e ao custo de bug silencioso, não cobertura total. Prioridade: regras de negócio > segurança > integração externa > UI.

## Ferramentas

- **Vitest**: testes unitários e de integração (backend).
- **Playwright**: testes E2E (fluxo crítico, quando aplicável).
- **GitHub Actions**: CI/CD, execução automática em push/PR.

## Camadas e prioridade

| Camada | Prioridade | Ferramenta | Justificativa |
|---|---|---|---|
| Services (regras de negócio) | Alta | Vitest (unitário) | Conflito de horário, antecedência mínima, horário de funcionamento — lógica crítica, fácil de isolar |
| Filtro anti-jailbreak (webhook) | Alta | Vitest (unitário) | Camada de segurança, função pura, barata de testar |
| Repositories | Baixa | — | Fina camada sobre Prisma, baixo valor de teste isolado |
| Function Calling (Gemini) | Baixa (por ora) | — | Dependência externa cara e frágil de mockar; revisitar pós-estabilização |
| Painel React (componentes) | Baixa (por ora) | — | UI ainda em iteração visual; testar cedo demais gera retrabalho |
| Fluxo E2E WhatsApp completo | Baixa (por ora) | Playwright | Alto custo de manutenção com API externa; adiar para pós-deploy |

## Regra de decisão

Antes de escrever um teste, perguntar:
1. Essa lógica tem regra de negócio real (cálculo, validação, decisão)? → testar.
2. É código de segurança (filtro, autenticação)? → testar.
3. É integração com serviço externo instável (Gemini, WhatsApp)? → não testar agora, ou testar só a interface/contrato.
4. É UI ainda em mudança frequente? → não testar agora.

## Abordagem incremental

Sem pausa dedicada a "cobertura de testes". Testes são escritos em paralelo às features, focados apenas nos itens de prioridade alta. Sem meta de percentual de cobertura — meta é: toda regra de negócio crítica tem ao menos um teste que falha se a regra quebrar.

## Revisão

Esta estratégia é revisada quando:
- O escopo funcional for congelado (pré-deploy).
- Novas regras de negócio críticas forem adicionadas.
- Bugs em produção expuserem lacunas de cobertura.
