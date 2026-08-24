# Warp Generator

[![CI](https://github.com/QMahyar/warp-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/QMahyar/warp-generator/actions/workflows/ci.yml) ![v1.0.1 stable](https://img.shields.io/badge/version-1.0.2-blue) ![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange) ![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

> **اشتراک‌های خصوصی Warp خود را روی Cloudflare میزبانی کنید. بدون VPS، بدون دامنه، ۵ دقیقه.**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FQMahyar%2Fwarp-generator)

**سلامت سرویس:** `GET /healthz` → `{ok, version, kv_ms}` · **English:** [README.md](README.md)

> **نسخه v1.0.1 — اولین نسخه پایدار.** ۱۷ فرمت، Cache API + پاک‌سازی، بکاپ رمزنگاری‌شده `.wgenc`، گروه‌های اشتراک، کلاینت Warp مقاوم، ۲۴۱ تست. ببینید [CHANGELOG.md](CHANGELOG.md) · [SPEC.md](SPEC.md)

---

## چرا

Cloudflare Warp سریع و رایگان است — اما مدیر اشتراک ندارد. این Worker آن را حل می‌کند:

- **یک فایل = کل بک‌اند** — یک `_worker.js` (~۶۷۰۰ خط)، KV + Cache API، سازگار با پلن رایگان (۱۰۰k خواندن / ۱k نوشتن در روز)
- **۱۷ فرمت** — Clash (+Amnezia)، Sing-box (+legacy)، Xray، Throne (+Amnezia)، WireGuard ZIP (+Amnezia)، V2RayN، Surge، Loon، Surfboard، Egern
- **Obfuscation با Amnezia** جایی که فیلترینگ DPI لازم است — پیش‌فرض سراسری + Mild/Aggressive برای هر حساب
- **طراحی خصوصی** — کلیدها در KV خودتان می‌مانند، بدون درخواست third-party (بدون CDN)، پنل ادمین کاملاً خودکفا
- **v1.0.1 پایدار:** کلاینت Warp مقاوم (پوشش wrapper/casing/orphan)، ۲۴۱ تست سبز، Cache API + پاک‌سازی، بکاپ‌های `.wgenc` رمزنگاری‌شده، اشتراک گروهی

## استقرار در ۵ دقیقه

### گزینه A — یک‌کلیک (بدون ترمینال)

1. روی دکمه **Deploy to Cloudflare Workers** بالا کلیک کنید
2. GitHub و Cloudflare را متصل کنید → هنگام نصب یک KV به نام `WARP_KV` بسازید یا انتخاب کنید
3. `https://<your-worker>.workers.dev/admin/setup` را باز کنید → رمز (حداقل ۸ کاراکتر) بسازید → وارد شوید

### گزینه B — با Wrangler

```bash
git clone https://github.com/QMahyar/warp-generator && cd warp-generator
npm install
wrangler login
wrangler kv:namespace create WARP_KV
# مقدار id را در wrangler.toml قرار دهید: kv_namespaces = [{binding="WARP_KV", id="…"}]
wrangler deploy
# https://<worker>.workers.dev/admin/setup را باز کنید → رمز بسازید
```

> **قفل کردن Setup:** تا وقتی رمزی وجود ندارد، `/admin/setup` برای همه باز است:
> ```bash
> echo $(openssl rand -hex 16) | wrangler secret put ADMIN_SETUP_SECRET
> ```
> پس از آن فرم Setup تا زمان ساخت رمز به `secret=<value>` نیاز دارد.

### توسعه محلی

```bash
npm run dev        # معادل wrangler dev --local → http://localhost:8787/admin/setup
npm test           # ۲۴۱ تست node:test شامل Golden byte-contract ها
node --check _worker.js
npx wrangler deploy --dry-run --outdir=dist
```

## استفاده — ۴ قدم

1. **لاگین** در `/admin` با رمز خود
2. **ساخت حساب** → `Create Account` (از طریق Warp API با retry + حذف compensating) یا `Import` → کشیدن و رها کردن `.conf` / `wg://` / `wireguard://`
3. **کپی اشتراک** — هر یک از ۱۷ URL، مودال **QR** (داخل مرورگر، بدون کتابخانه)، یا دکمه **deep link**
4. **ایمپورت در کلاینت VPN** — Clash Verge (`Profiles → Import`)، Throne (`Add Subscription`)، sing-box/Hiddify (`Import Remote Profile`) → متصل می‌شود

## پنل مدیریت

داشبورد تیره مدرن (دسکتاپ + موبایل ۳۹۰px، کارت‌های شیشه‌ای، glow، بدون درخواست خارجی):

| | |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Account detail](docs/screenshots/detail.png) |
| ![Settings](docs/screenshots/settings.png) | ![Mobile](docs/screenshots/dashboard-mobile.png) |

- هدر شیشه‌ای: چیپ‌های آمار (حساب‌ها / پریست‌ها / ۱۷ فرمت) + **چیپ وضعیت WARP** (`GET /api/settings/warpstatus` → سبز/قرمز + `lastError`)
- کارت حساب‌ها: آواتار، توکن قابل کپی، نشان Preset/Amnezia، چیپ چرخه عمر (`فعال | در حال انقضا | منقضی | لغو شده`) + `fetchCount`
- نمای جزئیات: همه URL های اشتراک با کپی/باز کردن/QR/دیپ‌لینک، تغییر نام، تغییر پریست، ادیتور Amnezia، بازسازی توکن، تگ گروه
- مسیریابی hash: `#/accounts`، `#/presets`، `#/settings` — دارای URL، مودال تأیید سفارشی، toast، بستن با `Esc`/کلیک بیرون، skeleton/empty
- ادیتور پریست: ردیف‌های داینامیک Endpoint، چسباندن گروهی (هر خط یک `ip:port`)، DNS برای هر پریست، `preferredOrder` اختیاری از طریق latency probe
- ادیتور Amnezia برای هر حساب: پریست‌های یک‌کلیک Mild/Aggressive با اعتبارسنجی آنی
- بنر چک‌لیست راه‌اندازی اولیه

## فرمت‌های اشتراک — ۱۷

`{token}` یا توکن یک حساب است یا توکن گروهی (`agg`). متد اشتباه → 405، فرمت ناشناخته → 404، منقضی/لغو → 410.

| فرمت | مسیر `/sub/{token}/…` | فایل | Amnezia | کلاینت‌ها | دیپ‌لینک |
|---|---|---|---|---|---|
| WireGuard .conf (ZIP) | `wireguard-conf` | `.zip` | نه | WireGuard, WireSock | — |
| WireGuard .conf Amnezia | `wireguard-conf-amnezia` | `.zip` | بله | WireSock (+Jc/Jmin/Jmax) | — |
| Throne wg:// | `throne` | `.txt` | نه | Throne | `throne://install-subscription?url=` |
| Throne wg:// Amnezia | `throne-amnezia` | `.txt` | بله | Throne | `throne://…` |
| wireguard:// URI | `wireguard-uri` | `.txt` | نه | V2RayN | — |
| Sing-box JSON (endpoint) | `singbox` | `.json` | نه | Throne, sing-box ≥1.11 | `singbox://import-remote-profile?url=` |
| Sing-box Amnezia | `singbox-amnezia` | `.json` | بله | sing-box-awg | `singbox://…` |
| Sing-box Legacy JSON | `singbox-legacy` | `.json` | نه | NekoBox, Hiddify | `hiddify://import/<url>` |
| Sing-box Legacy Amnezia | `singbox-legacy-amnezia` | `.json` | بله | Hiddify | `hiddify://…` |
| Xray JSON | `xray` | `.json` | نه | V2RayN, xray | — |
| Clash YAML | `clash` | `.yaml` | نه | Clash Verge/Meta | `clash://install-config?url=` |
| Clash Amnezia | `clash-amnezia` | `.yaml` | بله | Clash Meta | `clash://…` (`stash://…`, `loon://…`) |
| V2RayN Base64 | `v2rayn` | `.txt` | نه | V2RayN | — |
| Surge INI | `surge` | `.conf` | نه | Surge | `surge:///install-config?url=` |
| Loon INI | `loon` | `.conf` | نه | Loon | `loon://import?sub=` |
| Surfboard INI | `surfboard` | `.conf` | نه | Surfboard | `surfboard:///install-config?url=` |
| Egern YAML | `egern` | `.yaml` | نه | Egern | — |

الگو: `deepLinkUrl(scheme, subUrl) = scheme + encodeURIComponent(origin + "/sub/{token}/{format}")`

## انتخاب کلاینت، QR و دیپ‌لینک

در نمای جزئیات حساب:

1. **انتخاب کلاینت** — اپ خود را انتخاب کنید (Clash/Hiddify/NekoBox/Throne/WireSock/WireGuard)؛ فرمت‌های پیشنهادی ستاره‌دار می‌شوند و بقیه پنهان
2. **مودال QR** — SVG داخل مرورگر با حاشیه سفید، بزرگ‌شونده با payload، بدون CDN — با گوشی اسکن کنید → `GET /sub/{token}/{format}`
3. **دیپ‌لینک‌ها** — یک ضربه: `clash://install-config?url=ENCODED_URL`، `singbox://import-remote-profile?url=…`، `hiddify://import/…`، `throne://install-subscription?url=…`، به‌علاوه `stash://`، `loon://`، `surge:///`

## بکاپ و بازگردانی — ۲ قدم

**فایل بکاپ همان اعتبارنامه‌های شماست.** همه کلیدهای خصوصی WireGuard داخل آن است و تنها محافظ آن رمز شماست (PBKDF2 → AES-GCM). هر کسی که فایل و رمز را داشته باشد، صاحب تانل‌های شماست. آفلاین نگه دارید، هرگز commit نکنید.

1. **خروجی:** تنظیمات → بکاپ → رمز (۸ تا ۱۲۸ کاراکتر) → دانلود `backup.wgenc` (جادوی `WGENC1`، سقف ۲ مگابایت)
2. **ورودی:** تنظیمات → بازگردانی → انتخاب `.wgenc` + رمز → `mode: skip | overwrite` → گزارش `{imported, skipped, errors}`

`skip` شناسه‌های موجود را نگه می‌دارد، `overwrite` با `id` جایگزین می‌کند (گزارش `replacedOldTokens`)، کلیدهای تنظیمات ناشناخته به `errors` می‌روند نه آلودگی KV.

## عملیات و پایش

- **سلامت:** `GET /healthz` (بدون احراز هویت) → `{"ok":true,"version":"1.0.2","kv_ms":8}` — مانیتور Uptime را اینجا بگذارید
- **چیپ وضعیت Warp:** `GET /api/settings/warpstatus` → `{ok, checkedAt, lastError}` — چیپ هدر؛ لاگ `warp_unexpected_structure` با کلیدهای سانسور شده روی payload عجیب
- **Cache API:** اشتراک‌ها روی `origin + /sub/{token}/{format}` کش می‌شوند (~۵ دقیقه از طریق `caches.default`)؛ `ctx.waitUntil(put)` بدون بلاک؛ پاک‌سازی روی هر تغییر حساب/پریست/تنظیمات/توکن/گروه — `purgeCachedSubscriptions` برای هر توکن + `purgeAllCachedSubscriptions` سراسری (شامل `agg:{token}`)
- **محدودیت پلن رایگان:** ۱۰۰k خواندن/روز، ۱k نوشتن/روز، ۱ گیگابایت — خطاها با `kvGet` → `null`، `kvPut` → `false` به آرامی مدیریت می‌شوند
- **Rate Limit:** لاگین `auth:fail:{ip}` → ۵ خطا / ۱۵ دقیقه → 429 (مبتنی بر KV، eventual consistency — برای سخت‌گیری بیشتر WAF اضافه کنید)
- **لاگ‌ها:** JSON ساختاریافته برای هر درخواست (`route`، `method`، `status`، `ms`) + رویدادهای دامنه (`agg_created`، `backup_exported`، `sub_generated`)

## عیب‌یابی

| کد | معنی | رفع |
|---|---|---|
| `404` | توکن اشتباه / حساب حذف شده / گروه خالی | URL را از جزئیات دوباره کپی کنید (بررسی کنید `agg:{token}` اعضای فعال با `group` + `tokenStatus: active` داشته باشد) |
| `410` | `expiresAt` گذشته یا `disabled:true` | در جزئیات حساب تاریخ انقضا را پاک یا دوباره فعال کنید؛ توکن‌های گروهی چرخه عمر جدا دارند |
| `405` | متد اشتباه روی مسیر شناخته‌شده | هدر `Allow` را ببینید — نسخه v1 کد 405 برمی‌گرداند (در v0 قبلی 404 بود) |
| `429` | لاگین محدود / Warp محدود | تا `Retry-After` صبر کنید؛ کلاینت Warp هدر `Retry-After` را با cooldown رعایت می‌کند |
| `500` | حساب بدون endpoint (پریست حذف شده) | بازگشت به `DEFAULT_PRESETS`؛ پریست را دوباره اختصاص دهید |
| `502 / 504` | Warp API خاموش / JSON نامعتبر / ساختار عجیب | چیپ را بررسی کنید → `GET /api/settings/warpstatus`؛ لاگ `warp_unexpected_structure` کلیدها را نشان می‌دهد؛ retry + حذف orphan خودکار است |
| خطای KV 500 | `Failed to save` / سهمیه | `wrangler kv:key list --namespace-id=<id> [--prefix account:]`؛ سهمیه نوشتن پلن رایگان را بررسی کنید |
| goldens روی Windows خراب | CRLF | بررسی کنید `.gitattributes` شامل `test/golden/*.txt -text` باشد و دوباره checkout کنید |

**دیباگ KV:**
```bash
wrangler kv:key get --namespace-id=<id> "settings:password"
wrangler kv:key list --namespace-id=<id> --prefix="account:"
```

## مشارکت — برای توسعه‌دهندگان

### استک و محدودیت‌ها

- **ران‌تایم:** Cloudflare Workers (ES2022, ES Module, `nodejs_compat`)؛ بدون API های Node در ران‌تایم (فقط fetch، crypto.subtle، streams؛ `node:test` فقط dev)
- **ذخیره‌سازی:** KV (`WARP_KV`) + Cache API (`caches.default`)؛ تک فایل `_worker.js` (~۶۷۰۰ خط)، بدون Build
- **وابستگی‌ها:** `bcryptjs`، `@noble/curves` (Curve25519)، `fflate` (ZIP)، `js-yaml` (خط YAML نامحدود)
- **محدودیت‌ها:** CPU ۱۰-۵۰ میلی‌ثانیه؛ عدم export نام‌دار غیرتابعی (workerd رد می‌کند — از `testHooks()` استفاده کنید)

```bash
node --check _worker.js
npm test                          # ۲۴۱ تست، ۱۴ فایل، شامل Golden byte-contract ها
npm run goldens:update            # فقط بعد از تغییر عمدی generator؛ diff را بازبینی کنید
npx wrangler deploy --dry-run --outdir=dist
npm run dev                       # wrangler dev --local
```

CI (`.github/workflows/ci.yml`) روی PR/master: سینتکس → نسخه → تست → dry-run؛ انتشار `release.yml` روی تگ `v*.*.*`: تأیید → انتشار گیت‌هاب → استقرار → بررسی `GET /healthz`.

### معماری

```
کاربر → ‎/admin/login → نشست (bcrypt/pbkdf2 + HttpOnly Secure SameSite=Strict, ۲۴ ساعت) → ‎/admin (hash router, بدون CDN)
           ↓ POST /api/account/generate → کلاینت Warp (retry/Retry-After/cooldown + حذف compensating)
           ↓                            → تولید keypair → KV account:{uuid} + token:{token}
           ↓ GET /sub/{token}/{format} → caches.default.match؟ hit : resolveToken (حساب|گروه، بررسی 410)
                                      → expandEndpoints (حذف تکراری CIDR/tag/DNS) → FORMATS[format].gen
                                      → ‎+X-WG-Version → ctx.waitUntil(cache.put) → پاک‌سازی پس از تغییر
```

### اسکچ KV

| کلید | مقدار |
|---|---|
| `account:{uuid}` | حساب (افزودنی: `dns`، `group`، `tokenMeta`، `fetchCount`) |
| `token:{token}` | `token → uuid` |
| `agg:{token}` | `{token, groups[], label?, tokenMeta?}` |
| `session:{token}` | نشست با TTL |
| `auth:fail:{ip}` | شمارنده محدودیت |
| `settings:password` | هش PBKDF2/bcrypt |
| `settings:global` | `{amnezia}` |
| `settings:warpstatus` | `{ok, checkedAt, lastError}` |
| `presets` | آرایه پریست |

## اعتبارسنجی ورودی

| فیلد | قانون |
|---|---|
| نام | ۱ تا ۱۰۰ کاراکتر، بدون کنترل |
| کانفیگ | ۱۰۰ بایت تا ۱۰ کیلوبایت |
| کلید خصوصی | Base64 با ۳۲ بایت، بدون فضای خالی |
| IP | IPv4/IPv6 سخت‌گیرانه یا دامنه (۲۵۳ کاراکتر) |
| Port | ۱ تا ۶۵۵۳۵ |
| DNS | IP/دامنه معتبر |
| Label توکن | ۱ تا ۱۰۰ کاراکتر |
| expiresAt | تاریخ ISO آینده |
| Group | رشته پاک‌سازی‌شده ۱ تا ۵۰ |

## لایسنس

MIT — ببینید [LICENSE](LICENSE). مشخصات: [SPEC.md](SPEC.md) · طراحی: [DESIGN.md](DESIGN.md) · تغییرات: [CHANGELOG.md]
