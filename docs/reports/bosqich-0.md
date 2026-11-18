# Bosqich 0 — Poydevor: hisobot

| | |
|---|---|
| Sana | 2026-11-18 |
| Holat | Qabulga tayyor. Ikkita qo'lda tekshiruv qolgan (5-bo'lim) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 0 |

## 1. Natija

Ishlaydigan skelet tayyor. Server API bazaga ulanadi va `/health` beradi, bot `/start` ga javob beradi.
Mini App uchta qismi alohida yuklanadigan holda ochiladi, admin panel dizayndagi menyu va bo'limlar
yo'nalishlari bilan ochiladi. `npm run check` (typecheck, lint, 100 ta test, build, bundle byudjeti)
yashil. Qatlam va modul chegaralarini ESLint majburlaydi, bu ataylab buzilgan importlar bilan
tekshirildi. Git repo ochildi, commit qilinmadi (foydalanuvchi talabi).

## 2. Qilingan ish

| Qism | Nima qilindi | Asosiy fayllar |
|---|---|---|
| Repo | `git init` (commit'siz); npm workspaces; TypeScript strict; ESLint (type-aware, chegaralar); Prettier; `.gitignore`, `.gitattributes`; `.env.example`; `README.md` | `package.json`, `tsconfig.base.json`, `eslint.config.js` |
| Baza | `carservice` roli, `carservice` va `carservice_test` bazalari (Docker'dagi `postgres:18`); `0000_init` migratsiyasi: `btree_gist` | `apps/server/src/db/` |
| `packages/shared` | Marshrut jadvali va kontrakt mexanizmi (marshrutlarning o'zi 1-bosqichdan); xato kodlari, shell'lar; format: pul, sana, telefon, davlat raqami; tillar va tipli lug'at turi; dizayn tokenlari | `packages/shared/src/` |
| Server | `config.ts` (zod), `logger.ts` (redact, Drizzle xatosidan parametrlar olib tashlanadi, bot tokeni yashiriladi); `lib/time` (Toshkent vaqti), `lib/money` (foiz, yaxlitlash); `AppError`; baza (pool chegaralari, `ping`), migrator | `apps/server/src/` |
| HTTP | Fastify, bitta xato formati `{ error: { code } }`, `registerRoute` (kontraktni ulash, so'rovni tekshirish, dev/testda javobni tekshirish), `/health` (baza yo'q bo'lsa `503`), so'rov logi o'chirilgan | `apps/server/src/http/` |
| Bot | grammY, auto-retry, HTML parse mode, `/start` va boshqa xabarlarga javob (uz/ru, til Telegram'dan), menyu tugmasi, long polling, 409 konfliktda to'xtash, graceful shutdown | `apps/server/src/bot/`, `src/main.ts` |
| Mini App | `telegram.ts` (mavzu Telegram'dan, ranglar tokenlardan, Telegram ramkasi shu rangda), `client` / `master` / `staff` qismlari `React.lazy` bilan, tipli `api.ts`, uz/ru lug'at, raqam shrifti, `check-bundle.mjs` | `apps/tma/` |
| Admin | Chap menyu va yuqori panel (DESIGN 6), React Router (`/admin` basename), bo'limlar yo'nalishlari (hozircha "N-bosqichda" sahifasi), tipli `api.ts` (cookie bilan), uz/ru lug'at | `apps/admin/` |
| Hujjatlar | PLAN 0–3-bosqichlar haqiqatga moslandi, 22-bo'limga 10 ta qaror, 21-bo'limga 1 ta savol; DESIGN'da shrift va tokenlar joyi; CLAUDE.md buyruqlari | `docs/`, `CLAUDE.md` |

## 3. Biznes-qoidalar va testlar

| Qoida | Test fayli | Natija |
|---|---|---|
| Pul — butun, manfiy bo'lmagan so'm; foiz ikki xonagacha, so'mga yarmidan yuqoriga yaxlitlanadi (dizayndagi 5% × 3 400 000 = 170 000), suzuvchi nuqta xatosisiz | `test/lib/money.test.ts` | ✔ 28 |
| Vaqt Toshkent bo'yicha (UTC+5), kun chegarasi, DST yo'q; sana va vaqt qat'iy format (`24:00`, hafta va tartib raqamli sanalar rad etiladi); hafta kuni va kun qo'shish | `test/lib/time.test.ts` | ✔ 32 |
| Telefon `+998XXXXXXXXX` ga normallashadi; xorijiy raqam kod bilan qabul qilinadi; noto'g'ri uzunlik rad etiladi | `test/shared/phone.test.ts` | ✔ 19 |
| Davlat raqami: shaxsiy va yuridik format, 14 hudud kodi, kirill o'xshash harflar lotinga aylanadi, qolgani rad etiladi | `test/shared/plate.test.ts` | ✔ 21 |

Testlar soni: 100 ta, hammasi yashil. Test ishga tushishidan oldin migratsiyalar `carservice_test` bazasiga
qo'llanadi. Bazaning nomi `_test` bilan tugamasa, test ishga tushmaydi.

Bitta test birinchi ishga tushishda yiqildi va haqiqiy xatoni topdi: Luxon `2026-10-29 24:00` ni jimgina
ertangi kunning 00:00 i deb qabul qilardi. `instantAt`, `weekdayOf` va `addDays` endi kirishni qat'iy format
bilan tekshiradi. Shu qoida uchun qo'shimcha testlar yozildi (hafta sanasi, tartib raqamli sana, `9:00`,
`10:00:00`).

## 4. Tekshiruvlar

```
npm run typecheck    → 4 workspace, xatosiz
npm run lint         → xatosiz
npm test             → 4 fayl, 100 test, hammasi o'tdi
npm run build        → server dist/main.js 13.3 KB; tma va admin Vite build
npm run check:bundle → birinchi ochilish: client 84.9 KB, master 84.9 KB, staff 84.9 KB gzip
                       (byudjet 200); shrift woff2 22.4 KB (byudjet 24); OK
npm run check        → exit 0
npm run format:check → hamma fayl Prettier uslubida
```

Chegara qoidalari alohida tekshirildi. 8 ta vaqtinchalik faylga ataylab 22 ta taqiqlangan import yozildi,
ESLint hammasini ushladi:
- `domain` dan `drizzle-orm`, `platform`, `app`, boshqa modul;
- `app` dan `fastify`, `src/http`, boshqa modulning ichki fayli;
- `http` dan `pg` va `db`;
- `lib` dan `pino` va `db`;
- modul tashqarisidan modulning ichki fayli;
- Mini App'da boshqa qism yoki feature, `zod`, `@tma.js`, `@cs/shared` qiymati;
- admin'da boshqa feature va `@tma.js`;
- `shared` dan `apps`.

Ruxsat etilgan importlar o'tdi: boshqa modulning `index.ts`, `@cs/shared` dan type, `@cs/shared/format`.
Vaqtinchalik fayllar o'chirildi.

`npm audit`: production bog'liqliklarida 0 ta. Dev asboblarida 16 ta (12 high, 4 moderate): vite, vitest va
typescript-eslint orqali kelgan `picomatch`/`tinyglobby`/`fdir`, hamda drizzle-kit ichidagi eski
`@esbuild-kit`. Ular production'ga tushmaydi. Yangilash 7-bosqichdagi xavfsizlik ko'rigida.

## 5. Qo'lda tekshiruv

| Tekshiruv | Qayerda | Natija |
|---|---|---|
| API ishga tushadi, `/health` bazani tekshiradi | `dev:api`, curl | ✔ baza bor: `200 {"ok":true}`; yopiq bazaga ulangan nusxa: `503 {"ok":false}` |
| Xato formati, URL logga tushmaydi | curl | ✔ noma'lum yo'l: `404 {"error":{"code":"not_found"}}`; buzuq JSON: `400 validation`; `?phone=...` li so'rov logda yo'q |
| `npm start` bot tokenisiz | terminal | ✔ tushunarli xabar bilan to'xtaydi |
| Migratsiya baza egasi bilan (superuser'siz) | `db:migrate` | ✔ `btree_gist` yaratildi |
| Mini App va admin dev serverlari ochiladi | Vite, curl | ✔ `:5173` va `:5174/admin/orders` `200` |
| `npm run dev`: bot va API, test botda `/start` | Telegram | **Bajarilmadi**: `.env` da `TELEGRAM_BOT_TOKEN` yo'q |
| Mini App och va qorong'i mavzuda, admin panel ko'z bilan | Brauzer | **Bajarilmadi**: Chrome kengaytmasi ulanmagan edi |

Foydalanuvchi bajarishi uchun:
1. **Bot.** Test bot tokenini `.env` ga yozing, `npm run dev`, botga `/start` yuboring. `PUBLIC_URL`
   bo'lmasa, javob "Ilova hali sozlanmagan" bo'ladi. Tunnel bilan menyu tugmasi va "Ilovani ochish"
   paydo bo'ladi.
2. **Mini App.** `npm run dev:tma` → `http://localhost:5173`, `?theme=dark`, `?shell=master`, `?lang=ru`.
   Kartaning foni, chegarasi, urg'u rangi va pastdagi "3-bosqich" yozuvining tor shriftini tekshiring.
3. **Admin.** `npm run dev:admin` → `http://localhost:5174/admin/`. Chap menyuda faol bo'lim och
   to'q sariq fonda bo'ladi.

## 6. Rejadan chetga chiqishlar

PLAN 22-bo'limda batafsil:

- **Jadvallar va infratuzilma o'z bosqichiga ko'chdi.** 0-bosqichda bitta ham xabar turi va jadval
  kerak emas edi, shuning uchun o'lik kod yozilmadi:
  - outbox, rejalashtiruvchi, `Clock`, `dev:init-data`, factories → 1-bosqich;
  - `settings` → 2-bosqich;
  - `status_history` → 3-bosqich.
- **`fastify-type-provider-zod` ishlatilmadi.** Kontrakt `http/route.ts` da tekshiriladi.
- **Raqam shrifti byudjeti 20 KB dan 24 KB ga.** Kerakli lotin subset'i 22.4 KB.
- **`preload` yo'q.** DESIGN'da shrift `preload` bilan yozilgan edi, amalda `font-display: swap` ishlatildi.
- **Test papkasi.** `apps/server/test/shared/` qo'shildi (shared'dagi kiritish qoidalari uchun).

## 7. Ma'lum kamchiliklar va ochiq savollar

- Davlat raqami faqat ikki formatni qabul qiladi. Xorijiy, tranzit va boshqa raqamlar, hamda 14 hudud kodi
  ro'yxati buyurtmachi bilan tasdiqlanishi kerak (PLAN 21, 10).
- `packages/shared/src/routes` va `contract` hozircha bo'sh jadval. Mexanizm faqat typecheck orqali
  tekshirilgan, birinchi marshrutlar bilan 1-bosqichda ishlaydi.
- Bildirishnoma payload'i haqida: PLAN 4.8 da "render sof, payload'da nusxa" deb yozilgan. barbershop_bot
  esa payload'da faqat id saqlaydi va yuborish paytida joriy holatni o'qiydi: ariza bekor qilingan yoki
  ko'chirilgan bo'lsa, eskirgan xabar yuborilmaydi. 1-bosqichda outbox bilan birga shu ikkisidan biri
  tanlanadi va qarorlar jurnaliga yoziladi.
- Admin panel faqat och mavzuda, minimal kenglik 1024 px (TZ 15.5).

## 8. Keyingi bosqichga ta'sir

1-bosqich (kirish va rollar) quyidagilarga tayanadi:
- `registerRoute` va kontrakt;
- xato formati;
- `langFromCode`, `Dictionary`, `SHELLS`;
- `App.tsx` dagi shell tanlash (`resolveShell` `bootstrap.shell` bilan almashtiriladi);
- `api.ts`.

1-bosqichda yana qo'shiladi:
- 0-bosqichdan ko'chgan qismlar: outbox, rejalashtiruvchi, `Clock`, `dev:init-data`, factories;
- `@fastify/cookie`, `@fastify/rate-limit`, `@node-rs/argon2`, `uuid`.
