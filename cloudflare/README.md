# AutoJournal QR Sync Relay

Одноразовый relay для передачи зашифрованного AutoJournal между устройствами без аккаунтов.

## Что хранит сервер

Worker/D1 не получает ключ расшифровки содержимого журнала. В D1 временно хранятся:

- случайный ID сеанса;
- SHA-256 verifier одноразового секрета;
- направление обмена;
- AES-GCM ciphertext, разбитый на чанки;
- технические timestamps.

Сеанс создаётся максимум на 15 минут (клиент AutoJournal использует 10 минут). После успешного получения чанки удаляются, а запись сеанса остаётся ещё примерно на минуту только для подтверждения отправителю.

## Развёртывание

Требуется Node.js и бесплатный Cloudflare account.

1. Установить/запустить Wrangler:

   `npx wrangler@latest login`

2. Создать D1:

   `npx wrangler@latest d1 create autojournal-sync`

3. Скопировать `cloudflare/wrangler.toml.example` в `cloudflare/wrangler.toml`.

4. Вставить выданный Cloudflare `database_id` в `cloudflare/wrangler.toml`.

5. Создать таблицы:

   `npx wrangler@latest d1 execute autojournal-sync --remote --file=cloudflare/schema.sql`

6. Развернуть Worker:

   `npx wrangler@latest deploy --config cloudflare/wrangler.toml`

7. Скопировать HTTPS URL Worker, например:

   `https://autojournal-sync.<subdomain>.workers.dev`

8. В `sync-config.js` задать:

   `export const SYNC_API_URL = 'https://autojournal-sync.<subdomain>.workers.dev';`

9. Закоммитить только `sync-config.js`. В репозиторий не нужны Cloudflare API tokens или другие секреты.

## Проверка

Открыть:

`https://<worker-url>/health`

Ответ должен содержать:

`{"ok":true,"service":"autojournal-sync",...}`

Затем в AutoJournal:

Настройки → Передача данных по QR → Показать QR на одном устройстве.

На телефоне выбрать:

- **Передача данных** — телефон отправляет свой журнал устройству с QR.
- **Получение данных** — телефон запрашивает журнал устройства с QR.

## Безопасность

- QR одноразовый.
- Секрет имеет 256 бит случайности.
- Payload шифруется AES-GCM на клиенте.
- В качестве AAD используется ID сеанса.
- Worker проверяет SHA-256 verifier секрета.
- Сервер не получает открытый AutoJournal.
- Данные удаляются после завершения обмена.
