# Plan 003: Translate UI/API/meta to English

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 68b3da8..HEAD -- app components hooks lib config worker functions`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 001 (formats.ts gains new Russian descriptions this plan must also translate)
- **Category**: migration
- **Planned at**: commit `68b3da8`, 2026-08-15
- **Issue**: —

## Why this matters

The entire user-facing surface is in Russian while the app is deployed on
Vercel/Netlify/Docker/Cloudflare for a global audience. Russian text appears in
the page metadata and `<html lang="ru">`, the UI labels, the API error
messages, and the QR placeholder SVGs. This plan translates all of it to
English and sets `lang="en"` / `locale: 'en_US'` so the app is consistent,
indexable, and understandable to non-Russian speakers. It is a pure string
translation — no behavior change.

## Current state

The files containing Cyrillic (full inventory, confirmed by ripgrep):

| File | Russian strings (line:content) |
|------|-------------------------------|
| `app/layout.tsx` | 8 `description: 'Генератор конфигураций Cloudflare WARP'`, 9 keywords `'WARP, Cloudflare, конфигуратор, генератор, VPN, WireGuard, AmneziaWG'`, 12 og `description`, 14 `locale: 'ru_RU'`, 21 `<html lang="ru"` |
| `app/not-found.tsx` | 5 `Страница не найдена` |
| `app/api/generate/route.ts` | 40 `` `Ошибка генерации: ${err.message}` ``, 42 `` `Ошибка: ${err.message}` ``, 43 `'Произошла неизвестная ошибка.'` |
| `hooks/use-generator.ts` | 139 `error: data.message \|\| 'Ошибка генерации'`, 146 `error: 'Ошибка сети. Попробуйте ещё раз.'` |
| `config/endpoints.ts` | 13 `По умолчанию`, 18 `Альтернативный`, 23 `Указать свой адрес`, 28 `Германия`, 35 `Нидерланды`, 42 `Финляндия`, 49 `Польша`, 56 `Латвия` |
| `config/formats.ts` | 7, 14, 21 descriptions (plus 4 new ones added by plan 001) |
| `lib/qr-generator.ts` | 23 `` `${formatName} — QR не поддерживается` ``, 28 `QR код недоступен` |
| `worker/api-handler.js` | 400 `` `Ошибка: ${err.message}` `` |
| `functions/api/generate.js` | 404 `` `Ошибка: ${err.message}` `` |
| `components/home-client.tsx` | 39 `Настройки конфигурации`, 87 `Генерация...`, 92 `Сгенерировать конфигурацию`, 103 `Сгенерировать заново` |
| `components/layout/topbar.tsx` | 5 `Генератор`, 6 commented `// { id: 'formats', label: 'Форматы' },`, 7 `Приложения`, 8 `О проекте` |
| `components/layout/sidebar.tsx` | 60 `Проект`, 66 `Поставьте звезду на GitHub`, 72 `Серверы` |
| `components/generator/about-tab.tsx` | 26 `WireGuard-клиент с поддержкой AWG`, 27 `Официальный клиент AmneziaWG`, 28 `Полнофункциональный VPN-клиент`, 35 `Модифицированный клиент с AWG 1.5` + 36 note `Есть патч для Windows 7`, 36 `WireGuard-клиент для Windows`, 37 `Прокси-клиент с поддержкой WireGuard`, 38 `Полнофункциональный VPN-клиент`, 45 `Официальный клиент для iOS`, 46 `VPN-клиент с поддержкой AWG`, 47 `Clash для iOS`, 48 `Полнофункциональный клиент` + note `Недоступен в RU регионе`, 55 `Клиент для macOS`, 56 `Clash для macOS`, 60 `Роутеры`, 63 `Требуется entware или прошивка 5.1 alpha 3`, 104 `title="GitHub / Сайт"`, 113 `title="Скачать"`, 137 `О проекте`, 139-140 about paragraph, 154 `Совместимые клиенты`, 156 `Приложения с поддержкой AmneziaWG 1.5` |
| `components/generator/advanced-settings.tsx` | 33 `Дополнительные настройки`, 70 `Собственный I1`, 77 placeholder `Введите домен (например, google.com)` |
| `components/generator/result-panel.tsx` | 37 `Конфигурация {info.name} готова!`, 40 `Файл: {result.fileName}`, 52 `Скачать конфиг`, 61 `Скопировано`, 69 `Скопировать` |
| `components/generator/config-selectors.tsx` | 111 `Формат конфигурации`, 114 `Настройки соединения`, 123 `Конечная точка`, 126 `Тип конфигурации`, 128 `Все сайты`, 129 `Определенные сайты`, 139 placeholder `host:port (например 162.159.192.1:4500)`, 146 `Исключить LAN` |

Recon note: no i18n framework is present and the app is single-language; the
recommended approach is hardcoded English, not next-intl. `README.md` and
`README_ru.md` both exist and are intentionally left as-is (docs, not UI).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc --noEmit`) | exit 0 |
| Build     | `npm run build`          | exit 0              |
| Cyrillic scan | `rg -n "[А-Яа-яЁё]" -g '!node_modules' -g '!.next' -g '!README*' -g '!package-lock.json' app components hooks lib config worker functions` | no matches in those dirs |

## Scope

**In scope** (translate the Cyrillic in these files only):
- `app/layout.tsx`, `app/not-found.tsx`, `app/api/generate/route.ts`
- `hooks/use-generator.ts`
- `config/endpoints.ts`, `config/formats.ts`
- `lib/qr-generator.ts`
- `worker/api-handler.js`, `functions/api/generate.js`
- `components/home-client.tsx`, `components/layout/topbar.tsx`,
  `components/layout/sidebar.tsx`, `components/generator/about-tab.tsx`,
  `components/generator/advanced-settings.tsx`,
  `components/generator/result-panel.tsx`,
  `components/generator/config-selectors.tsx`

**Out of scope** (do NOT touch):
- `README.md`, `README_ru.md` — docs, intentionally kept.
- `config/services/*.json` — data, no UI strings.
- `lib/builders/wiresock.ts` — `MASKING_DOMAINS` (ozon.ru, etc.) are intentional
  Russian service data, not UI text.
- Any behavior/logic change — translation only.
- `package.json`, lockfile — plans 002/005.

## Git workflow

- Branch: `advisor/003-english-translation`
- Commit message style (conventional, matches repo): `i18n: translate UI, metadata and API messages to English`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Translate metadata and document language

`app/layout.tsx`:
- `description`: 'Cloudflare WARP configuration generator'
- `keywords`: 'WARP, Cloudflare, configurator, generator, VPN, WireGuard, AmneziaWG'
- og `description`: same as description
- `locale: 'en_US'`
- `<html lang="en"`

`app/not-found.tsx:5`: `Page not found`.

**Verify**: `rg -n "[А-Яа-яЁё]" app/layout.tsx app/not-found.tsx` → no matches.

### Step 2: Translate API error messages

`app/api/generate/route.ts`:
- 40: `` `Generation failed: ${err.message}` ``
- 42: `` `Error: ${err.message}` ``
- 43: `'An unknown error occurred.'`

`worker/api-handler.js:400` and `functions/api/generate.js:404`:
- `` `Error: ${err.message}` ``

`hooks/use-generator.ts`:
- 139: `data.message || 'Generation failed'`
- 146: `'Network error. Please try again.'`

**Verify**: `rg -n "Ошибк|Ошибка|Произошла" app/api hooks worker functions` → no matches.

### Step 3: Translate config labels and format descriptions

`config/endpoints.ts`:
- `По умолчанию` → `Default`
- `Альтернативный` → `Alternative`
- `Указать свой адрес` → `Custom address`
- `Германия` → `Germany`
- `Нидерланды` → `Netherlands`
- `Финляндия` → `Finland`
- `Польша` → `Poland`
- `Латвия` → `Latvia`

`config/formats.ts` — translate every `description` (the 3 original + the 4
added by plan 001). Suggested (match existing style):
- `AmneziaWG`: `Standard WireGuard format (.conf)`
- `Clash`: `Configuration for Clash Meta (.yaml)`
- `WireSock`: `WireGuard with protocol masking (.conf)`
- `Throne`: `WireGuard configuration for Throne (wg://)`
- `NekoRay`: `Configuration for NekoRay (.json)`
- `Husi`: `Configuration for Husi (.json)`
- `Karing`: `Configuration for Karing (.json)`

`lib/qr-generator.ts`:
- 23: `` `${formatName} — QR not supported` ``
- 28: `QR code unavailable`

**Verify**: `rg -n "[А-Яа-яЁё]" config lib/qr-generator.ts` → no matches.

### Step 4: Translate the UI components

`components/home-client.tsx`:
- `Настройки конфигурации` → `Configuration settings`
- `Генерация...` → `Generating...`
- `Сгенерировать конфигурацию` → `Generate configuration`
- `Сгенерировать заново` → `Regenerate`

`components/layout/topbar.tsx`:
- `Генератор` → `Generator`
- commented `// { id: 'formats', label: 'Форматы' },` → `// { id: 'formats', label: 'Formats' },`
- `Приложения` → `Applications`
- `О проекте` → `About`

`components/layout/sidebar.tsx`:
- `Проект` → `Project`
- `Поставьте звезду на GitHub` → `Star on GitHub`
- `Серверы` → `Servers`

`components/generator/advanced-settings.tsx`:
- `Дополнительные настройки` → `Additional settings`
- `Собственный I1` → `Custom I1`
- placeholder `Введите домен (например, google.com)` → `Enter a domain (e.g. google.com)`

`components/generator/result-panel.tsx`:
- `Конфигурация {info.name} готова!` → `Your {info.name} configuration is ready!`
- `Файл: {result.fileName}` → `File: {result.fileName}`
- `Скачать конфиг` → `Download config`
- `Скопировано` → `Copied`
- `Скопировать` → `Copy`

`components/generator/config-selectors.tsx`:
- `Формат конфигурации` → `Config format`
- `Настройки соединения` → `Connection settings`
- `Конечная точка` → `Endpoint`
- `Тип конфигурации` → `Config type`
- `Все сайты` → `All sites`
- `Определенные сайты` → `Specific sites`
- placeholder `host:port (например 162.159.192.1:4500)` → `host:port (e.g. 162.159.192.1:4500)`
- `Исключить LAN` → `Exclude LAN`

**Verify**: `rg -n "[А-Яа-яЁё]" components` → no matches.

### Step 5: Translate the About tab

`components/generator/about-tab.tsx` — translate every string from the table in
"Current state" (apps descriptions, platform labels, notes, title attributes,
headings, about paragraph). Suggested:

- `WireGuard-клиент с поддержкой AWG` → `WireGuard client with AWG support`
- `Официальный клиент AmneziaWG` → `Official AmneziaWG client`
- `Полнофункциональный VPN-клиент` → `Full-featured VPN client`
- `Модифицированный клиент с AWG 1.5` → `Modified client with AWG 1.5`
- `Есть патч для Windows 7` → `Has a patch for Windows 7`
- `WireGuard-клиент для Windows` → `WireGuard client for Windows`
- `Прокси-клиент с поддержкой WireGuard` → `Proxy client with WireGuard support`
- `Официальный клиент для iOS` → `Official client for iOS`
- `VPN-клиент с поддержкой AWG` → `VPN client with AWG support`
- `Clash для iOS` → `Clash for iOS`
- `Полнофункциональный клиент` → `Full-featured client`
- `Недоступен в RU регионе` → `Not available in the RU region`
- `Клиент для macOS` → `Client for macOS`
- `Clash для macOS` → `Clash for macOS`
- `Роутеры` → `Routers`
- `Требуется entware или прошивка 5.1 alpha 3` → `Requires entware or firmware 5.1 alpha 3`
- `title="GitHub / Сайт"` → `title="GitHub / Website"`
- `title="Скачать"` → `title="Download"`
- `О проекте` → `About`
- About paragraph → `Cloudflare WARP configuration generator. Create configs to optimize your network connection, improve security, and protect your traffic. Supports multiple formats and platforms.`
- `Совместимые клиенты` → `Compatible clients`
- `Приложения с поддержкой AmneziaWG 1.5` → `Apps with AmneziaWG 1.5 support`

Read the file fully first — there may be additional short strings (headings,
buttons) not listed above; translate any Cyrillic you find using the same
style. This is the one place where the executor may need judgment; if a string
is ambiguous, translate it literally and continue.

**Verify**: `rg -n "[А-Яа-яЁё]" components/generator/about-tab.tsx` → no matches.

### Step 6: Final verification

**Verify**:
- `npm run typecheck` → exit 0
- `npm run build` → exit 0
- `rg -rn "[А-Яа-яЁё]" -g '!node_modules' -g '!.next' -g '!README*' -g '!package-lock.json' app components hooks lib config worker functions` → no matches

## Test plan

No test runner exists; verification is the typecheck/build/Cyrillic-scan gates
above. The regression risk is minimal because all changes are string literals;
the build gate catches any syntax break.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `rg "[А-Яа-яЁё]" app components hooks lib config worker functions` returns nothing
- [ ] `app/layout.tsx` uses `lang="en"` and `locale: 'en_US'`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 003 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- `npm run build` fails for a reason other than a string-literal syntax issue.
- You find Cyrillic in a file NOT listed in scope (report it; do not expand scope).
- You find a Cyrillic string that is clearly functional (e.g. an API value the
  client matches on) rather than display text — stop and report.

## Maintenance notes

- The QR placeholder text lives in `lib/qr-generator.ts` SVG templates; plan 004
  rewrites `generateQR` but must keep these (now-English) strings.
- WireSock masking domains in `lib/builders/wiresock.ts` are intentional data —
  do not translate them later either.
- If the app ever adopts next-intl, these literals become the default locale
  strings.