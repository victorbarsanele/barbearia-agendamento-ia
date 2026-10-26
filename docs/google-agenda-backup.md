# Backup no Google Agenda

Espelho unidirecional dos agendamentos do painel para uma agenda dedicada. V1 inclui somente agendamentos, não bloqueios. Alterações feitas diretamente no Google Agenda não retornam ao sistema.

## Preparação manual

1. Crie uma service account no Google Cloud e baixe seu JSON de credenciais.
2. Ative Google Calendar API no projeto Google Cloud.
3. Com a service account, crie agenda dedicada, por exemplo, `Barbearia – Backup`; service account deve ser proprietária.
4. Compartilhe a agenda com o e-mail do barbeiro, com permissão para ver todos os detalhes dos eventos. O convite enviado por e-mail pode precisar ser aceito.
5. Nunca torne essa agenda pública: descrições dos eventos contêm telefones de clientes.

## Configuração

Defina `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` com o JSON da service account codificado em base64 e `GOOGLE_CALENDAR_ID` com o ID da agenda. Mantenha `GOOGLE_CALENDAR_SYNC_ENABLED=false` até migration e credenciais estarem prontas; use exatamente `true` para ativar.

Depois de aplicar a migration no ambiente desejado e reiniciar o backend, execute backfill inicial com:

```sh
npm run google-calendar:reconcile
```

A reconciliação também executa automaticamente cerca de dois minutos após o boot e a cada seis horas. O espelho depende do backend estar no ar; enquanto aplicação estiver parada, novas alterações não chegam ao Google até worker/reconciliação voltarem.
