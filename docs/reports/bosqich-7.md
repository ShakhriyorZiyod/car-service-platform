# Bosqich 7 — Ishga tushirish: hisobot

| | |
|---|---|
| Sana | 2026-11-19 |
| Holat | Kamchilik bilan: repoga tegishli hamma narsa tayyor va tekshirilgan (deploy fayllari, hujjatlar, xavfsizlik ko'rigi, tezlik o'lchovi, zaxira va tiklash sinovi). Production serverga o'rnatish va haqiqiy Telegram'dagi qabul ro'yxati qilinmadi: server va hosting hali yo'q (PLAN 21, 5-savol) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 7 |

## 1. Natija

Ilovani serverga o'rnatish, yangilash, zaxiralash va tiklash uchun hamma narsa repoda: systemd unit, nginx
namunasi, `deploy.sh`, `backup.sh`, `restore.sh` va bosqichma-bosqich `docs/DEPLOY.md`. Egasi va admin uchun
qisqa yo'riqnoma yozildi. Xavfsizlik ko'rigi ikkita haqiqiy kamchilik topdi (cheklanmagan `/media` va
`/health`, keshlanmaydigan foto havolalari), tezlik o'lchovi esa vaqt hisobidagi tor joyni topdi; uchalasi
tuzatildi. Zaxira va tiklash skriptlari haqiqiy PostgreSQL'da sinaldi. "Production'da ishlaydi" maqsadiga
hali erishilmadi: buning uchun server kerak.

## 2. Qilingan ish

| Qism | Nima qilindi | Asosiy fayllar |
|---|---|---|
| systemd | Bitta nusxa, `NoNewPrivileges`, `ProtectSystem=strict`, `MemoryMax=768M`, fotolar uchun `StateDirectory` (`0750`: fotolarni nginx emas, API beradi), Node 24 alohida papkada | `deploy/car-service.service` |
| nginx | Mini App `/`, panel `/admin/`, `/api` va `/media` proxy (`Host` uzatiladi — `Origin` tekshiruvi uchun shart), HSTS, `nosniff`, panelga CSP va `X-Frame-Options: DENY` (Mini App'ga emas: Telegram Web iframe), xeshli fayllarga `immutable`, logda so'rov parametrlari yo'q, `client_max_body_size 4m` | `deploy/nginx.example.conf` |
| Sozlama | Production `.env` namunasi; `.env.example` ga `COOKIE_SECURE` qo'shildi (PLAN 6 da bor edi) | `deploy/env.example`, `.env.example` |
| Yangilash | Zaxira → `git pull` → `npm ci` → build → `check:bundle` → migratsiya → qayta ishga tushirish → `/health` kutish | `deploy/deploy.sh` |
| Zaxira | `pg_dump` + fotolar; `.part` nomida yozilib tekshiriladi; kunlik 30 kun, oylik 1 yil (qattiq havola), `BACKUP_REMOTE` bo'lsa `rsync` | `deploy/backup.sh` |
| Tiklash | Ishchi bazani bitta tranzaksiyada almashtirish yoki `CHECK_DATABASE_URL` bilan chorak sinovi (alohida bazaga, qatorlarni sanaydi, ishchi bazani rad etadi) | `deploy/restore.sh` |
| Hujjatlar | Serverga o'rnatish, yangilash, zaxira, tiklash; egasi va admin uchun yo'riqnoma; README'dan havolalar | `docs/DEPLOY.md`, `docs/EGA_UCHUN.md`, `README.md` |
| Rate-limit | `/media` va `/health` endi cheklov ostida; fotolar o'z hisoblagichida (600/daq), API'niki (120/daq) bilan bo'linmaydi | `src/http/app.ts`, `modules/media/http/routes.ts` |
| Foto havolasi | Tugash vaqti 5 daqiqalik qadamga yaxlitlanadi: havola 10–15 daqiqa amal qiladi va 5 daqiqa bir xil, brauzer fotoni keshdan oladi | `modules/media/domain/signed-url.ts` |
| Vaqt hisobi | Toshkent mintaqasi siljishi chorak soat bo'yicha eslab qolinadi (tzdata'dan olinaveradi) | `src/lib/time.ts` |

## 3. Biznes-qoidalar va testlar

Server testlari: **1264 ta** (oldin 1262), hammasi o'tdi. 2 ta yangi test (`media/media-rules.test.ts`):

| Qoida | Natija |
|---|---|
| Foto havolasi kamida 10, ko'pi bilan 15 daqiqa amal qiladi | ✔ |
| 5 daqiqa ichida yaratilgan havolalar bir xil (yangilanadigan ekran fotoni qayta yuklamaydi) | ✔; eski kodda yiqilishi tekshirildi (`1 failed`) |

`lib/time` o'zgarishi eski 113 ta vaqt, ish vaqti va slot testidan o'tdi. Rate-limit tuzatishiga test
yozilmadi (v1 da HTTP testlari yo'q, PLAN 16); u qo'lda `inject` bilan tekshirildi (5-bo'lim).

## 4. Tekshiruvlar

```
npm run check        → typecheck, lint, 1264 test (39 fayl), build, check:bundle: exit 0
npm run format:check → toza
check:bundle         → client 123.4 KB gzip (byudjet 200), master 120.7, staff 110.4; shrift 22.4 KB (24)
npm audit --omit=dev → found 0 vulnerabilities
npm audit (dev ham)  → 4 moderate: drizzle-kit ichidagi eski esbuild (GHSA-67mh-4wv8-2f99, esbuild dev-server).
                       drizzle-kit faqat migratsiya yaratishda ishlaydi, esbuild dev-server ishga tushmaydi;
                       "fix" drizzle-kit'ni 0.18 ga tushiradi — qilinmadi
bash -n deploy/*.sh  → sintaksis toza
```

## 5. Qo'lda tekshiruv

### Xavfsizlik ko'rigi (PLAN 15, 18)

| Tekshiruv | Qanday | Natija |
|---|---|---|
| Rate-limit | `inject`, bitta IP'dan 125 so'rov | `/api` ✔ (120 dan keyin 429). **`/health` va `/media` cheklanmagan edi** (125 × 200/404) → tuzatildi, endi 429; fotolar 600 dan keyin 429 va API hisobi o'zgarmaydi |
| Cookie | Kod | `HttpOnly`, `SameSite=Strict`, `Path=/api`, production'da `Secure` ✔ |
| `Origin` | `inject`: begona `Origin` bilan login | 403 ✔ |
| Imzolangan URL | Kod va testlar | HMAC-SHA256, `timingSafeEqual`, ≤ 15 daqiqa, noto'g'ri havola 404 ✔. **Havola har soniyada o'zgarib, kesh ishlamasdi** → tuzatildi |
| Log redact | Kod | telefon, ism, matn, token, `initData`, parol, kod, cookie redact; SQL xatosida parametrlar yo'q; bot tokeni URL'dan olinadi ✔ |
| Huquqlar matritsasi (PLAN 8) | Haqiqiy HTTP (`inject`), test bazada, 17 amal × 5 rol (admin, rahbar, egasi, usta, mijoz) | ✔ To'liq mos: rahbar faqat o'qiydi (har yozuv va hisobotlar 403), admin sozlamalar, xodimlar, audit, to'lov tuzatish va o'chirishga 403, egasi hammasiga; Mini App tokeni panelga 401; usta mijoz qismiga va mijoz usta qismiga 403 |
| `npm audit` | | 4-bo'lim |

### Tezlik (PLAN 3.2)

Test bazada 300 ta faol ariza va 67 foydalanuvchi; API production'dagidek (javob sxemasi tekshirilmaydi,
log `warn`); har so'rov boshqa `X-Forwarded-For` bilan (aks holda 120/daq cheklovi o'lchovni buzadi).
Noutbukda, server va baza bitta mashinada.

| So'rov | 1 parallel p95 | 10 parallel p95 | Byudjet |
|---|---|---|---|
| `GET /api/tma/bootstrap` | 12 ms | 34 ms | 300 |
| `GET /api/client/slots` | 24 ms | 75 ms (avval 109) | 300 |
| `GET /api/admin/orders` (Kanban, 442 KB) | **119 ms** (avval 256) | **795 ms** (avval 2160) | 300 |
| `GET /api/admin/today` | 101 ms (avval 220) | **560 ms** (avval 1937) | 300 |
| `POST /api/client/quote` (yozish) | 18 ms | 44 ms | 800 |

Profil Kanban vaqtining ~70% i luxon'ning mintaqa siljishiga ketayotganini ko'rsatdi; eslab qolish bilan
bitta so'rov 242 → 100 ms. Ustaxona sharoitida (bir necha panel oynasi, har 10 soniyada so'rov) Kanban va
"Bugun" byudjetda. **10 ta bir vaqtdagi so'rovda byudjetdan oshadi**: CPU'ga bog'liq, 300 ta ariza har
safar to'liq qaytariladi. O'lchov noutbukda; production serverda qayta o'lchash kerak.

### Zaxira va tiklash (PostgreSQL 18, Docker konteynerida, `_test` bazadan)

| Tekshiruv | Natija |
|---|---|
| `backup.sh`: dump va fotolar, `daily/` va `monthly/` (qattiq havola, 2 link), ikkinchi ishga tushirishda oylik takrorlanmaydi | ✔ |
| Chorak sinovi (`CHECK_DATABASE_URL`): alohida bazaga, sanoq 300 ariza, 67 foydalanuvchi, 10 migratsiya, 2 foto | ✔ |
| Chorak sinovi ishchi bazaning o'ziga yo'naltirilsa rad etadi | ✔ |
| Joyida tiklash: bo'sh bazaga, so'ng ma'lumot o'zgartirilib, ustidan qayta — o'zgarish qaytdi, jadvallar soni manba bilan bir xil (orders 300, users 67, bookings 300, audit 322); fotolar almashdi, `.restoring` qolmadi | ✔ |
| Buzilgan dump (kesilgan) hech narsaga tegmasdan rad etiladi | ✔ |
| `rsync` bilan tashqi nusxa | **Bajarilmadi** (konteynerda `rsync` yo'q) |
| `systemctl stop/start` bilan tiklash | **Bajarilmadi** (`SERVICE=` bo'sh, systemd yo'q) |

### Bajarilmagan (PLAN qabul ro'yxati)

| Tekshiruv | Sabab |
|---|---|
| Production: alohida bot, `.env`, migratsiya, `seed:reference`, `owner:create` | Server va hosting yo'q (PLAN 21, 5-savol) |
| `nginx -t` | nginx yo'q; Docker registry'ga ulanib bo'lmadi |
| `deploy.sh` to'liq ishga tushirish | Server yo'q; faqat `bash -n` |
| Butun yo'l haqiqiy Telegram'da iOS, Android va Desktop'da (bron → tasdiq → qabul → vazifa → hisobot → qabul qilish → checkout → baho), ikkala til | Production bot va qurilmalar kerak |
| 5- va 6-bosqichdan qolganlar: 10 foto bilan oflayn hisobot haqiqiy telefonda, planshetda qabul va aralash to'lov, botdagi tugmalar | Shu ro'yxatga kiradi |

## 6. Rejadan chetga chiqishlar

PLAN 22-bo'limda (2026-11-19, 5 qator):

- `/media` va `/health` cheklovga olindi, fotolarga alohida hisoblagich (600/daq).
- Foto havolasi 15 emas, 10–15 daqiqa amal qiladi (5 daqiqalik qadam).
- `lib/time` da mintaqa siljishini eslab qolish.
- Tezlik `autocannon` bilan emas, o'z skripti bilan o'lchandi (PLAN 3.2 yangilandi).
- Production yo'llari va zaxira saqlash tartibi.

## 7. Ma'lum kamchiliklar va ochiq savollar

1. **Ustaxona bitta IP'dan chiqadi.** API cheklovi IP bo'yicha daqiqasiga 120 (PLAN 13). Admin oynasi har
   10 soniyada 1–3 so'rov yuboradi (Kanban, "Bugun", yangi ariza kuzatuvchisi), ustalar ilovasi 15–20
   soniyada. 4–5 panel oynasi va bir necha usta Wi-Fi'da bo'lsa, 120 ga yaqinlashadi va xodimlar 429 olishi
   mumkin edi. **Hal qilindi (2026-11-19):** foydalanuvchi qarori bilan daqiqasiga 600 ga ko'tarildi
   (`src/http/app.ts`, PLAN 22).
2. Kanban 10 ta bir vaqtdagi so'rovda byudjetdan oshadi (5-bo'lim). Haqiqiy server va haqiqiy ma'lumot
   hajmida qayta o'lchanadi; kerak bo'lsa javobni yengillatish (tarixsiz) keyingi qadam.
3. Hosting tanlanmagan (PLAN 21, 5-savol): 7-bosqichni yopish shunga bog'liq.
4. Dev bog'liqliklardagi 4 ta moderate zaiflik (drizzle-kit ichidagi esbuild) — drizzle-kit yangilanishini
   kutish.
5. `BACKUP_REMOTE` qayerga (boshqa server, bulut) — buyurtmachi hal qiladi; bo'sh qolsa zaxira faqat shu
   serverda.

## 8. Keyingi qadam

v1 kodi tayyor. Qolgani serverda: hosting tanlanadi → `docs/DEPLOY.md` bo'yicha o'rnatish → `nginx -t`,
`deploy.sh` → qabul ro'yxati haqiqiy Telegram'da → tiklash sinovi production zaxirasida. Shundan keyin
bosqich "Qabul qilindi" bo'ladi.

## 9. Foydalanuvchi bajarishi uchun

1. Hosting va domenni tanlang (O'zbekistonda tavsiya qilinadi), production bot yarating.
2. ~~API cheklovi 120 qolsinmi yoki 600 ga ko'tarilsinmi?~~ Javob: 600 (2026-11-19).
3. Zaxiraning tashqi nusxasi qayerga borishini ayting (`BACKUP_REMOTE`).
4. Server tayyor bo'lsa, o'rnatishni birga qilamiz va qabul ro'yxatini haqiqiy Telegram'da o'tamiz.
