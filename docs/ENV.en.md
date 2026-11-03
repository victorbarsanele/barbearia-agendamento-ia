# Environment variables

Defaults below describe code behavior when a variable is unset. “Required” means required at startup or for the stated integration; never commit secrets.

## Server

| Variable       | Required                  | Default                 | Range/rule                                                            | Description                                  |
| -------------- | ------------------------- | ----------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `DATABASE_URL` | Yes, to initialize Prisma | No default              | PostgreSQL connection URL; application does not validate its format   | Backend and database-backed test connection. |
| `PORT`         | No                        | `3333`                  | Converted with `Number`; no application-level range validation        | Backend HTTP port.                           |
| `CORS_ORIGINS` | No                        | `http://localhost:5173` | Comma-separated origins; whitespace trimmed and empty entries removed | CORS origin allowlist.                       |

## Authentication

| Variable               | Required         | Default    | Range/rule                                              | Description                              |
| ---------------------- | ---------------- | ---------- | ------------------------------------------------------- | ---------------------------------------- |
| `JWT_SECRET`           | Yes, at startup  | No default | Must be non-empty                                       | Secret used to sign and verify JWTs.     |
| `ADMIN_USER`           | Not individually | No default | Login enabled only when username and hash are non-empty | Administrator username.                  |
| `ADMIN_PASSWORD_HASH`  | Not individually | No default | Login enabled only when username and hash are non-empty | Bcrypt hash for administrator password.  |
| `BARBER_USER`          | Not individually | No default | Login enabled only when username and hash are non-empty | Barber username.                         |
| `BARBER_PASSWORD_HASH` | Not individually | No default | Login enabled only when username and hash are non-empty | Bcrypt hash for barber password.         |
| `COOKIE_SECURE`        | No               | Disabled   | Only exact value `true` enables Secure attribute        | Sets Secure attribute on session cookie. |

## Gemini and identity

| Variable         | Required                            | Default    | Range/rule                                                                                        | Description                                                                  |
| ---------------- | ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | For Gemini calls                    | No default | No format validation                                                                              | Primary Gemini API key.                                                      |
| `GOOGLE_API_KEY` | No                                  | No default | Fallback only when `GEMINI_API_KEY` is unset; not recommended                                     | Legacy compatibility fallback for Gemini key. Not present in `.env.example`. |
| `BARBER_PHONE`   | Yes when `WHATSAPP_PROVIDER=ycloud` | No default | Must be non-empty and differ from `YCLOUD_FROM_NUMBER`; no additional range in provider validator | Notification destination and barber contact.                                 |
| `BARBER_NAME`    | No                                  | No default | Trimmed name; no explicit length limit                                                            | Barber identity used in the prompt.                                          |
| `BARBER_ALIASES` | No                                  | No default | Comma-separated aliases; empty entries ignored                                                    | Accepted barber aliases.                                                     |

## Webhooks

| Variable                | Required                            | Default    | Range/rule                                                             | Description                                      |
| ----------------------- | ----------------------------------- | ---------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `WEBHOOK_SECRET`        | To accept Evolution webhook         | No default | `x-webhook-secret` header must match exactly; not validated at startup | Evolution webhook secret.                        |
| `YCLOUD_WEBHOOK_SECRET` | Yes when `WHATSAPP_PROVIDER=ycloud` | No default | Must be non-empty; HMAC-SHA256 timestamp must be within five minutes   | Secret used to validate raw YCloud webhook body. |

## WhatsApp, YCloud, and Evolution

| Variable                  | Required                             | Default                      | Range/rule                                                                                                                    | Description                                                                                 |
| ------------------------- | ------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `WHATSAPP_PROVIDER`       | Explicitly recommended in production | Code defaults to `evolution` | Only `evolution` or `ycloud`; production explicitly sets `ycloud`                                                             | Selects WhatsApp inbound/outbound provider.                                                 |
| `EVOLUTION_API_KEY`       | For Evolution outbound sending       | No default                   | No format validation at startup                                                                                               | Evolution API key.                                                                          |
| `EVOLUTION_API_URL`       | No                                   | `http://localhost:8080`      | Used as base URL; no dedicated validation                                                                                     | Evolution API base address.                                                                 |
| `EVOLUTION_INSTANCE_NAME` | No                                   | `barbearia`                  | No dedicated validation                                                                                                       | Evolution instance used for sending.                                                        |
| `YCLOUD_API_KEY`          | Yes when `WHATSAPP_PROVIDER=ycloud`  | No default                   | Must be non-empty                                                                                                             | YCloud API key.                                                                             |
| `YCLOUD_FROM_NUMBER`      | Yes when `WHATSAPP_PROVIDER=ycloud`  | No default                   | `+` followed by 8 to 15 digits                                                                                                | Number connected to YCloud.                                                                 |
| `WHATSAPP_ALLOWLIST`      | No                                   | Disabled                     | Comma-separated list; canonicalized phones must contain 8 to 15 digits. Non-empty input with no valid entries causes an error | Optional validation allowlist. Unset or empty disables filtering; not active in production. |

## Escalation and drafts

| Variable                            | Required | Default   | Range/rule                                                                                                                                      | Description                                               |
| ----------------------------------- | -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `ESCALATION_COOLDOWN_MS`            | No       | `900000`  | No global range: Gemini flow converts with `Number`; YCloud notice for users without a phone accepts finite values `>= 0`, otherwise falls back | Cooldown between escalation/notice messages.              |
| `HUMAN_TAKEOVER_TTL_MS`             | No       | `1800000` | Finite number `> 0`; invalid values use fallback                                                                                                | Human takeover TTL, sliding from barber's latest message. |
| `PENDING_BOOKING_TTL_MS`            | No       | `1800000` | Finite number `> 0`; invalid values use fallback                                                                                                | Booking draft TTL.                                        |
| `PENDING_BOOKING_REMINDER_DELAY_MS` | No       | `600000`  | Finite number `> 0`; invalid values use fallback                                                                                                | Delay before draft reminder.                              |

## Scheduling and lead time

| Variable                         | Required | Default | Range/rule                                               | Description                                                              |
| -------------------------------- | -------- | ------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `MIN_ANTECEDENCIA_MINUTOS`       | No       | `60`    | Integer from `0` to `1440`; invalid value aborts startup | Minimum lead time for creating/changing appointments.                    |
| `OFERTA_FOLGA_MINUTOS`           | No       | `0`     | Integer from `0` to `120`; invalid value aborts startup  | Additional buffer only when offering WhatsApp time slots.                |
| `CONFIRMACAO_TOLERANCIA_MINUTOS` | No       | `0`     | Integer from `0` to `60`; invalid value aborts startup   | Tolerance at draft confirmation; does not change dashboard/API creation. |
| `AVISO_CURTO_PRAZO_MINUTOS`      | No       | `60`    | Integer from `0` to `1440`; invalid value aborts startup | Adds a summary notice when appointment is sooner than this threshold.    |

## Media and audio

| Variable                      | Required | Default  | Range/rule                                                       | Description                                      |
| ----------------------------- | -------- | -------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `MEDIA_NOTICE_COOLDOWN_MS`    | No       | `600000` | Finite number `>= 0`; invalid values use fallback                | Minimum interval between non-text media notices. |
| `AUDIO_TRANSCRIPTION_ENABLED` | No       | Disabled | Only exact value `true` enables transcription                    | Enables transcription of received audio.         |
| `AUDIO_MAX_BYTES`             | No       | `600000` | Finite number `> 0`; invalid values use fallback; no upper bound | Maximum downloaded audio size in bytes.          |
| `AUDIO_DOWNLOAD_TIMEOUT_MS`   | No       | `10000`  | Finite number `> 0`; invalid values use fallback                 | Audio download timeout in milliseconds.          |
| `AUDIO_TRANSCRIBE_TIMEOUT_MS` | No       | `30000`  | Finite number `> 0`; invalid values use fallback                 | Transcription timeout in milliseconds.           |
| `AUDIO_MAX_CONCURRENCY`       | No       | `3`      | Finite number `> 0`; invalid values use fallback                 | Maximum concurrent transcriptions.               |
| `AUDIO_MAX_QUEUE`             | No       | `10`     | Finite number `> 0`; invalid values use fallback                 | Maximum queued audio items.                      |

Numeric `AUDIO_*` values have no upper bound and are not required to be integers.

## Google Calendar

| Variable                             | Required                 | Default    | Range/rule                                                                                    | Description                                 |
| ------------------------------------ | ------------------------ | ---------- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `GOOGLE_CALENDAR_SYNC_ENABLED`       | No                       | Disabled   | Only exact value `true` enables synchronization                                               | Enables one-way appointment mirroring.      |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Yes when sync is enabled | No default | Strict Base64 round-trip; JSON must contain `client_email` with `@` and a valid `private_key` | Base64-encoded service account credentials. |
| `GOOGLE_CALENDAR_ID`                 | Yes when sync is enabled | No default | Must be non-empty after trimming; no additional range                                         | Dedicated calendar ID.                      |

## Control and development

| Variable            | Required                  | Default                    | Range/rule                                                              | Description                                                                                                                                 |
| ------------------- | ------------------------- | -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `SIMULACAO_WEBHOOK` | No                        | Disabled                   | Only exact value `true` enables                                         | Evolution ignores simulation under `NODE_ENV=production`; YCloud outbound path suppresses sending when enabled, without a production guard. |
| `NODE_ENV`          | No                        | Set by runtime environment | Code compares exact values `production` and `test`                      | Controls simulation and repository behavior.                                                                                                |
| `VITEST`            | No                        | Unset outside Vitest       | Any truthy value disables automatic dotenv loading                      | Test-runner marker.                                                                                                                         |
| `CI`                | No                        | Unset outside CI           | Truthy value changes Playwright workers/retries and rejects `test.only` | Playwright CI mode.                                                                                                                         |
| `E2E_USER`          | Yes for default E2E setup | No default                 | Must be non-empty                                                       | E2E login username; may be loaded from `painel/.env.e2e`.                                                                                   |
| `E2E_PASSWORD`      | Yes for default E2E setup | No default                 | Must be non-empty                                                       | E2E login password; may be loaded from `painel/.env.e2e`.                                                                                   |
