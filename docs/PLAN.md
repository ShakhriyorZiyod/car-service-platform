# CarService: v1 reja

| | |
|---|---|
| Holat | Reja tayyor. Kod yozilmagan, 0-bosqich kutilmoqda |
| Sana | 2026-11-18 |
| Talab | `docs/tz/ТЗ v2.0 — CarService & Detailing Ecosystem.pdf` (keyin "TZ") |
| Dizayn | `docs/design/*.pdf`, undan olingan tizim: `docs/DESIGN.md` |
| Ish qoidalari | `CLAUDE.md` |
| Bosqich hisobotlari | `docs/reports/` |

**Mundarija:** 0. Foydalanish · 1. Maqsad va chegara · 2. O'zgarmas qoidalar · 3. Stek ·
4. Arxitektura · 5. Papka tuzilmasi · 6. Muhit o'zgaruvchilari · 7. Ma'lumotlar modeli ·
8. Rollar va huquqlar · 9. Holat mashinalari · 10. Bron va slotlar · 11. Narx va to'lov ·
12. Bot va xabarlar · 13. HTTP API · 14. Ekranlar · 15. Xavfsizlik · 16. Testlar · 17. Deploy ·
18. Bosqichlar · 19. v2 va kengaytirish · 20. Yangi funksiya qo'shish · 21. Ochiq savollar ·
22. Qarorlar jurnali

---

## 0. Hujjatdan foydalanish

- Bu hujjat loyihaning yagona manbai. Kod faqat shu yerda yozilganini qiladi. Bu yerda yozilgan
  narsa o'z bosqichi kelganda kodda albatta paydo bo'ladi.
- Yangi talab avval shu hujjatga kiritiladi (20-bo'lim tartibi), keyin kodga.
- Bosqich tugaganda uch narsa qilinadi: `docs/reports/bosqich-N.md` hisoboti yoziladi, 18-bo'limdagi
  holat ustuni yangilanadi, qabul qilingan qarorlar 22-bo'limga yoziladi.
- TZ va dizayndan qilingan har bir ongli farq 1.3-bo'limda va `docs/DESIGN.md` ning 8-bo'limida.

---

## 1. Maqsad va chegara

### 1.1 Mahsulot

Bitta avtoservis va detailing studiyasi uchun tizim.

- **Mijoz** Telegram'da botni ochadi va Mini App'da narxni zonalar bo'yicha ko'radi, vaqtni o'zi
  tanlab bron qiladi.
- **Administrator** mijozga qo'ng'iroq qilib arizani tasdiqlaydi. Mashinani nuqsonlari va fotolari
  bilan qabul qiladi, ishni ustalarga taqsimlaydi.
- **Usta** o'sha botdagi Mini App'da vazifani ko'radi, ishni boshlaydi va foto hisobot topshiradi.
- **Admin** hisobotni tekshiradi, mashinani topshiradi, to'lovni va fiskal chekni qayd etadi.
- Mijoz har bosqichni botdagi xabarlarda va ilovada ko'rib boradi.

Natija: qog'oz jurnal ham, "mashinam qachon tayyor?" degan qo'ng'iroqlar ham kerak bo'lmaydi.

### 1.2 v1 tarkibi

v1 bitta ustaxonada to'liq servis siklini qamraydi: bron → tasdiq → qabul → ish → topshirish → to'lov.

| Qism | v1 da | v2 ga qoladi |
|---|---|---|
| Mijoz Mini App | Kirish (til, rozilik, telefon), garaj, 5 qadamli bron, buyurtmalarim, ariza kuzatuvi, qo'shimcha ishni tasdiqlash, natija va baho, profil | Do'kon, savat, "mashina bilan birga" tovar |
| Usta (Mini App, o'sha bot) | Vazifalar, ishni boshlash, "oldin/keyin" foto (oflayn navbat bilan), tekshiruvga yuborish, qayta ishlash | Materiallar sarfi, ovozli izoh, ko'rsatkichlar, PWA |
| Admin panel | Bugun, Kanban, ariza ichida, qo'ng'iroq natijasi, yangi ariza, kunlik jadval va bloklash, qabul dalolatnomasi, vazifalar va hisobotlar, topshirish va to'lov, mijozlar | Do'kon buyurtmalari, ombor, haftalik jadval, sudrab ko'chirish |
| Sozlamalar (egasi) | Ustaxona ma'lumoti va qoidalar, prays-matritsa, bokslar, ish vaqti va bayramlar, markalar va modellar, xodimlar, audit jurnali | Xabar shablonlari, bekor qilish sabablarini tahrirlash, materiallar me'yori, huquqlarni sozlash |
| Rahbar | Bugun, arizalar, jadval, mijozlar (o'qish) | R1–R4 analitika, Excel eksport |
| Bot | Bitta bot: mijoz va xodim xabarlari, tugmali tasdiqlar, 2-qadam kodi | Webhook, shablonlarni tahrirlash |
| To'lov | Naqd, terminal, o'tkazma, aralash; chegirma; fiskal chek raqami qo'lda | Kassa API, onlayn to'lov, oldindan to'lov, qaytarish |
| Hujjatlar | Dalolatnoma ma'lumoti va fotolari bazada, mijoz botda tasdiqlaydi | Imzo, PDF |

### 1.3 TZ dan ongli farqlar

| TZ | v1 | Sabab | v2 yo'li |
|---|---|---|---|
| NestJS + Prisma | Fastify + Drizzle | Tezlik, yengillik; `EXCLUDE` uchun o'z SQL; barbershop_bot tajribasi | — |
| Turborepo + pnpm | npm workspaces | Yetarli, asbob kam | Kerak bo'lsa `turbo` ustiga qo'shiladi |
| Admin: Next.js | Vite + React SPA | Ichki panelga SSR kerak emas; hamma frontendda bitta tool zanjiri | — |
| BullMQ + Redis | Postgres'dagi outbox va rejalashtiruvchi | Bitta jarayon, bitta baza; xabar o'zgarish bilan bitta tranzaksiyada | 19-bo'lim |
| Socket.IO | Admin panel 10 soniyada so'raydi (polling) va ovoz chiqaradi | Kam kod | SSE/WebSocket adapteri |
| Ikkita bot | Bitta bot, bitta Mini App manzili, rol serverdan | Foydalanuvchi qarori | — |
| Usta PWA (PIN, push) | O'sha botdagi Mini App | Foydalanuvchi qarori | 19-bo'lim |
| Hamma joyda `branch_id` | Filial tushunchasi yo'q | Bitta ustaxona (foydalanuvchi qarori) | 19-bo'lim |
| JWT access/refresh | Bazadagi sessiya, httpOnly cookie | Bekor qilish oson, kod kam | — |
| Presigned URL, S3 | API orqali lokal diskka; ko'rish imzolangan URL bilan | Bitta server | `FileStore` S3 implementatsiyasi |
| Imzo va PDF dalolatnoma | Mijoz botda tasdiqlaydi | Foydalanuvchi qarori; imzo biometriyami degan savol (TZ 15.3) | `DocumentRenderer` porti |
| Fiskal: kassa API | Chek raqami qo'lda kiritiladi | Provayder tanlanmagan (TZ 17) | `FiscalProvider` porti |
| Ketma-ket bokslar | Ariza bitta boksni egallaydi | Soddalik | `bookings` allaqachon ko'p qatorli |
| Shablonlarni egasi tahrirlaydi | Matnlar kodda (uz/ru) | Kam kod | `notification_templates` |
| Qoralama serverda 24 soat | Qoralama Telegram CloudStorage'da | Server kodi kerak emas | — |
| Docker Compose | systemd + nginx | barbershop_bot tajribasi | — |
| Sentry, Prometheus, Grafana | pino logi va `/health` | Kichik yuklama | 19-bo'lim |
| OpenAPI | Umumiy TypeScript kontrakti | Klientlar o'zimizniki | zod sxemalaridan avtomatik yaratiladi |

---

## 2. O'zgarmas qoidalar

Bularni buzadigan kod yozilmaydi. Ulardan voz kechish kerak bo'lsa, avval 22-bo'limga yangi qaror
yoziladi.

1. **Bitta ustaxona.** Kodda tenant yoki filial tushunchasi yo'q. Ustaxona ma'lumotlari `settings` da.
2. **Bitta bot, bitta Mini App manzili.** Qaysi qism (mijoz, usta, xodim) ochilishini faqat server
   aytadi (`bootstrap.shell`). Klient rolni o'zi aniqlamaydi.
3. **Huquq har so'rovda serverda tekshiriladi.** Usta faqat o'z vazifalarini oladi, va bu SQL
   so'rovining shartida yozilgan, UI filtrida emas. Birovning yozuviga murojaat qilinsa `404`.
4. **Holat faqat ruxsat etilgan o'tish bilan o'zgaradi** (`domain/*-status.ts`). `UPDATE ... WHERE
   status = <kutilgan>` ishlatiladi, o'tish o'sha tranzaksiyada `status_history` ga yoziladi.
5. **Bitta boksda ikkita faol bron kesishmaydi.** Buni kod emas, baza kafolatlaydi (`EXCLUDE USING gist`).
   Bu cheklovni chetlab o'tadigan kod yozilmaydi.
6. **Narx, nom va davomiylik arizaga nusxalanadi.** Prays o'zgarsa, ochiq arizalar o'zgarmaydi.
7. **Pul so'mda butun son** (`bigint`), tiyinsiz. Kasr faqat foizli chegirmada paydo bo'ladi va so'mga
   yaxlitlanadi (11-bo'lim).
8. **Vaqt bazada `timestamptz` (UTC)da saqlanadi.** Hisob serverda `Asia/Tashkent` bo'yicha. Klient vaqt
   zonasini hisoblamaydi: server tayyor mahalliy sana va vaqtni yuboradi.
9. **Hech qachon o'chirilmaydi:** arizalar, to'lovlar, status tarixi, audit. Ma'lumotnomalar
   `is_active` yoki `archived_at` bilan yashiriladi.
10. **Telefon raqam odamni faqat Telegram tasdiqlagan bo'lsa bog'laydi** (7.2-bo'lim). Qo'lda
    kiritilgan raqam bo'yicha hisoblar birlashtirilmaydi.
11. **Boshqa odamga ketadigan xabar faqat outbox orqali** yuboriladi va o'zgarish bilan bitta
    tranzaksiyada yoziladi.
12. **Muhim mutatsiyalar idempotent:** ariza yaratish, foto yuklash, checkout. Klient `requestId` yoki
    `mediaId` yuboradi, takroriy so'rov o'sha natijani qaytaradi.
13. **Biznes-qoida faqat serverda.** Klient serverdan kelgan natijani ko'rsatadi: narx, davomiylik, slot,
    mumkin bo'lgan amallar. Har bir biznes-qoidaning testi bor (16-bo'lim).
14. **Logga yozilmaydi:** telefon, ism, token, `initData`, parol, 2FA kodi.

---

## 3. Stek

| Qism | Tanlov |
|---|---|
| Runtime | Node.js 24 LTS, TypeScript `strict`, ESM |
| Monorepo | npm workspaces: `apps/server`, `apps/tma`, `apps/admin`, `packages/shared` |
| HTTP | Fastify 5; `@fastify/cookie` va `@fastify/rate-limit` 1-bosqichda. So'rov va javobni umumiy zod kontrakti bo'yicha `http/route.ts` tekshiradi (Fastify'ning sxema tizimi ishlatilmaydi) |
| Bot | grammY, `@grammyjs/auto-retry`, `@grammyjs/runner` (long polling, bitta nusxa) |
| Baza | PostgreSQL 14+ (14 va 18 da sinalgan), `drizzle-orm` (`pg`), `drizzle-kit`, `btree_gist` |
| Tekshiruv, vaqt, log | zod 4, luxon, pino |
| Parol | `@node-rs/argon2` (Argon2id, Windows uchun ham tayyor binar) |
| ID | UUID v7 (`uuid` paketi, ilovada yaratiladi). Arizaning odam o'qiydigan raqami sequence'dan |
| Mini App | React 19, Vite, `@tma.js/sdk-react`, TanStack Query, `lucide-react`, oddiy CSS va tokenlar |
| Admin | React 19, Vite, React Router, TanStack Query, `lucide-react`, oddiy CSS va tokenlar |
| Test | Vitest, haqiqiy PostgreSQL (`_test` baza) |
| Sifat | ESLint (type-aware, qatlam va modul chegaralari), Prettier |
| Deploy | systemd, nginx, `pg_dump` (Docker yo'q) |

Kutubxona API'si versiyadan versiyaga o'zgaradi. Ishlatishdan oldin `node_modules` dagi type'lar
tekshiriladi, xotiradan taxmin qilinmaydi.

### 3.1 Nega Fastify

- Node'dagi eng tez framework. barbershop_bot'dagi o'lchovda Hono'dan 5.8% tezroq chiqqan. Bu
  yuklamada framework tor joy emas, lekin talab "tez" edi va boshqa narxi yo'q.
- Modullar Fastify plugin'i sifatida ro'yxatdan o'tadi. Har guruhning (`/api/client`, `/api/master`,
  `/api/admin`) o'z auth hook'i bor.
- Cookie va rate-limit uchun rasmiy plugin'lar bor. `app.inject()` ishlatish mumkin, lekin v1 da HTTP
  testlari yo'q (16-bo'lim).
- Fastify faqat `src/http/` va `modules/*/http/` ichida ishlatiladi. Almashtirish kerak bo'lsa, faqat
  shu qatlam o'zgaradi.

### 3.2 Tezlik byudjeti

| Nima | Chegara | Qanday tekshiriladi |
|---|---|---|
| Mini App, birinchi ochilish (gzip) | 200 KB, har shell uchun alohida (TZ: 250 KB) | `npm run check:bundle` |
| Raqam shrifti | ≤ 24 KB woff2 (DESIGN 3; hozir 22.4 KB) | `check:bundle` |
| Birinchi ekran | 1 ta so'rov (`/api/tma/bootstrap`) | Kod ko'rib chiqishda |
| API javobi | p95 o'qish ≤ 300 ms, yozish ≤ 800 ms (TZ 15.1) | 7-bosqichda yuklama skripti bilan (22-bo'lim; natija `reports/bosqich-7.md`) |
| Statik fayllar | Xeshli nom, `immutable` kesh, gzip/brotli | nginx sozlamasi |

---

## 4. Arxitektura

### 4.1 Umumiy ko'rinish

```
     Telegram                                     Brauzer (noutbuk, planshet)
  ┌─────────────┐  menyu tugmasi, web_app         ┌─────────────────┐
  │  Bot chati  │────────────┐                    │   Admin panel   │  PUBLIC_URL/admin/
  └──────┬──────┘            ▼                    └────────┬────────┘
         │           ┌──────────────────┐                  │  sessiya cookie
         │           │     Mini App     │  PUBLIC_URL/     │
         │           │ client│master│staff│                │
         │           └────────┬─────────┘                  │
         │ long polling       │ initData (HMAC)            │
  ┌──────▼────────────────────▼────────────────────────────▼──────┐
  │  apps/server — bitta Node.js 24 jarayoni                       │
  │  bot (grammY) · http (Fastify) · jobs (outbox, rejalashtiruvchi)│
  │  modules: identity, workshop, catalog, garage, booking, orders,  │
  │           reception, tasks, payments, media, clients,           │
  │           dashboard, audit                                       │
  └──────────────┬──────────────────────────────────┬───────────────┘
           PostgreSQL 16                     UPLOADS_DIR (fotolar)
```

Ilova bitta jarayonda ishlaydigan modulli monolit. Klientlar bazaga va diskka to'g'ridan-to'g'ri
murojaat qilmaydi: hammasi API orqali o'tadi.

### 4.2 Modullar

| Modul | Vazifasi | Egalik qiladigan jadvallar | Qaysi modullarga bog'liq |
|---|---|---|---|
| `identity` | Foydalanuvchilar, rollar, `initData`, onboarding, telefonni bog'lash, xodim logini, sessiya, 2FA, huquqlar, xodimlar | `users`, `user_roles`, `sessions`, `login_challenges` | `audit`, `workshop` (rozilik versiyasi va `bootstrap` dagi ustaxona ma'lumoti) |
| `audit` | O'zgarishni yozish, jurnalni o'qish | `audit_log` | — |
| `workshop` | Ustaxona sozlamalari, ish vaqti, bayramlar, bokslar, ish vaqti hisobi | `settings`, `work_hours`, `holidays`, `boxes`, `box_service_types` | `audit` |
| `catalog` | Markalar va modellar, xizmat turlari va zonalari, prays-matritsa, bekor qilish sabablari | `car_brands`, `car_models`, `service_types`, `services`, `service_excludes`, `service_prices`, `cancel_reasons` | `audit` |
| `garage` | Mijoz mashinalari | `cars` | `catalog` |
| `booking` | Slot hisobi, boks band qilish, bloklash, kunlik jadval | `bookings` | `workshop`, `catalog` |
| `orders` | Ariza, uning bandlari, holat mashinasi, qo'ng'iroq natijalari, qo'shimcha ish, bekor qilish, baho | `orders`, `order_items`, `order_calls`, `reviews` | `booking`, `catalog`, `garage`, `workshop`, `audit` |
| `media` | Foto saqlash, tur va hajm tekshiruvi, imzolangan URL | `media` | — |
| `reception` | Qabul dalolatnomasi, nuqsonlar, mijoz tasdig'i, ishga topshirish | `reception_acts`, `reception_defects` | `orders`, `media` |
| `tasks` | Usta vazifalari, hisobot, tekshiruv, qayta ishlash | `tasks`, `task_reports` | `orders`, `media` |
| `payments` | Chegirma, checkout, to'lovlar, fiskal chek | `payments`, `fiscal_receipts` | `orders`, `audit` |
| `clients` | Admin uchun mijozlar ro'yxati, kartasi, anonimlashtirish | — (o'qiydi, yozishni `identity` va `garage` orqali qiladi) | `identity`, `garage` |
| `dashboard` | "Bugun" ekrani | — (faqat o'qiydi) | — |

Umumiy infratuzilma modul emas, `src/platform/` da turadi: outbox, rejalashtiruvchi, `status_history`,
`Clock`, tranzaksiya yordamchisi, xato turlari, portlar.

### 4.3 Modul ichidagi qatlamlar

```
modules/<nom>/
  domain/   sof logika: holat mashinasi, qoidalar, hisob. I/O yo'q, `now` parametr bilan keladi
  app/      use-case'lar: huquq tekshiruvi, tranzaksiya, outbox, audit. Transportni bilmaydi
  http/     Fastify route'lari: kontraktni servisga ulaydi. Bazaga tegmaydi
  bot/      callback tugmalari (zarur bo'lsa). Bazaga tegmaydi
  index.ts  modulning ochiq API'si: servis fabrikasi, tiplar, route va bot handler'larini ro'yxatdan o'tkazish
```

Bog'liqlik faqat bir yo'nalishda: `http`/`bot` → `app` → `domain`. Chegaralarni ESLint majburlaydi:

| Fayllar | Nimani import qila olmaydi |
|---|---|
| `packages/shared/**` | Repo'dagi boshqa hech narsani |
| `server/src/lib/**` | `db`, `platform`, `modules`, `http`, `bot`, `jobs`, fastify, grammy, pg, drizzle |
| `server/src/modules/*/domain/**` | Yuqoridagilarning hammasi; o'z modulining `app`, `http`, `bot` qatlamlari |
| `server/src/modules/*/app/**` | fastify, grammy, `src/http`, `src/bot`, `src/jobs`, o'z modulining `http` va `bot` qatlamlari |
| `server/src/modules/*/{http,bot}/**` | pg, drizzle, `src/db` |
| `modules/A/**` dan `modules/B/**` ga | Faqat `modules/B/index.ts` orqali |
| `apps/tma/src/**` | `zod`; `@cs/shared` dan faqat type, qiymatlar esa `/routes`, `/format`, `/i18n`, `/vocabulary` dan; `@tma.js/*` faqat `telegram.ts` da |
| `apps/tma/src/shells/client/**` ↔ `shells/master/**` | Bir-birini |
| `apps/admin/src/features/X/**` → `features/Y/**` | Bir-birini (umumiy narsa `ui/`, `lib/`, `api.ts` da) |

**Ataylab qilinmaydi:** har jadvalga repository qatlami (Drizzle o'zi abstraksiya), DI konteyner, CQRS,
event bus, mikroservislar. Bitta jarayon va bitta baza uchun ular foyda bermaydi, faqat kod ko'payadi.

### 4.4 Modullararo qoidalar

- Har jadvalga faqat egasi bo'lgan modul **yozadi** (4.2-jadval). O'qish uchun modul boshqa
  modulning jadvaliga ham murojaat qila oladi (masalan, `dashboard` va `booking`ning jadval ko'rinishi).
- Bir modul boshqasining servisini fabrikaga argument sifatida oladi:
  `createOrdersService({ db, clock, outbox, booking, catalog, audit })`.
- Bitta tranzaksiyada bir necha modul ishlasa, ichki metodlar birinchi argument sifatida `tx` oladi
  (`booking.reserve(tx, ...)`). Tashqariga ochiq metodlar tranzaksiyani o'zi ochadi.
- Bog'liqlik grafi tsiklsiz: `identity`, `audit`, `workshop`, `catalog`, `media` → `garage` →
  `booking` → `orders` → `reception`, `tasks`, `payments` → `clients`, `dashboard`. Teskari chaqiruv
  kerak bo'lsa (vazifa qabul qilindi → ariza tayyor), quyi modul yuqorisining metodini chaqiradi:
  `tasks` → `orders.onTasksChanged(tx, orderId)`.

### 4.5 Kompozitsiya, tranzaksiya, xato

- `src/composition.ts` hamma servisni yig'adi (`createServices(deps)`). `src/main.ts` HTTP, bot va
  fon ishlarini ishga tushiradi va to'xtatadi (graceful shutdown).
- Global holat yo'q. Kesh ham servis ichida.
- `db.transaction` ichida faqat `tx` ishlatiladi. Sozlama kabi yangi ulanish talab qiladigan narsa
  tranzaksiyadan oldin o'qiladi, aks holda pool to'lganda xizmat osilib qoladi (barbershop_bot'da
  topilgan xato).
- Xato `AppError(code)`, kodlar `packages/shared/src/vocabulary/errors.ts` da. HTTP qatlami kodni
  statusga aylantiradi: `validation` → 400, `unauthorized` → 401, `forbidden` → 403, `not_found` → 404,
  holat va slot ziddiyatlari → 409, biznes-qoida buzilishi → 422, `rate_limited` → 429. Javob shakli:
  `{ error: { code, details? } }`.

### 4.6 Kontrakt

- `packages/shared/src/routes/{auth,tma,client,master,admin}.ts`: har endpoint'ning yo'li va metodi.
  Bog'liqligi yo'q, shuning uchun klientlar import qila oladi.
- `packages/shared/src/contract/*.ts`: so'rov va javobning zod sxemalari. Ularni server ishlatadi, admin
  panel formalarni tekshirish uchun ham ishlatishi mumkin. Mini App ishlatmaydi (bundle hajmi).
- Har modul o'z guruhining handler'larini xarita sifatida beradi (`tmaRoutes(...)`, `staffAdminRoutes(...)`),
  `src/http/app.ts` ularni `registerGroup` bilan guruhning auth hook'i ostida ro'yxatdan o'tkazadi.
  Handler'i yo'q route yoki noto'g'ri javob shakli kompilyatsiyadan o'tmaydi (`GroupRoutes` tipi).
- Klient chaqiruvi tipli: `api.call('client.createOrder', input)`. Klient kirish tipi `RequestOf`
  (zod `input`), handler oladigani `ParsedRequestOf` (default va coerce'dan keyin).
- Javob `camelCase`. Pul `number` (so'm, butun). Vaqt ISO UTC shaklida, yonida tayyor mahalliy ko'rinishi:
  `{ at: '2026-10-29T05:00:00Z', local: { date: '2026-10-29', time: '10:00', label: '29-oktabr, payshanba' } }`.

### 4.7 Rolga qarab ochilish (bitta bot, bitta Mini App)

1. Botning menyu tugmasi va har bir `web_app` tugmasi bitta manzilni ochadi: `PUBLIC_URL/`. Tugma
   xabarga bog'liq bo'lsa, manzilga parametr qo'shiladi: `?order=<id>` yoki `?task=<id>`.
2. Mini App `GET /api/tma/bootstrap` ni chaqiradi. Server `initData` imzosini tekshiradi
   (HMAC-SHA256, 24 soat), foydalanuvchini `telegram_id` bo'yicha topadi yoki yaratadi va quyidagini
   qaytaradi:
   ```ts
   { user: { id, fullName, lang, phone /* Telegram tasdiqlagan yoki null */, consentGiven },
     shell: 'client' | 'master' | 'staff',
     roles: Role[],
     links: { admin: string | null } }
   // keyin qo'shiladi: workshop (2-bosqich), start (3- va 5-bosqich)
   ```
3. `shell` qoidasi (`identity/domain/roles.ts`, `shellOf`):
   - `master` roli bor → `master`;
   - `admin`, `director` yoki `owner` roli bor (usta emas) → `staff`;
   - qolgan hamma → `client`.
4. Klient tegishli shell'ni `React.lazy` bilan yuklaydi. Shunda mijoz usta kodini yuklamaydi va
   aksincha.
5. Rozilik berilmagan bo'lsa, client shell avval T0 ni ko'rsatadi. Telefonsiz katalogni ko'rish mumkin,
   lekin garaj va bron telefon so'raydi.
6. Usta avval oddiy foydalanuvchi bo'lib kiradi. U telefonini ulashganda raqam egasi qo'shib qo'ygan
   xodim yozuviga mos keladi va hisoblar bog'lanadi (7.2-bo'lim). Keyingi `bootstrap` `master` qaytaradi.
7. `staff` shell'i rolni ko'rsatadi va admin panel havolasini beradi (`PUBLIC_URL/admin/`). Bot
   xabarlari xodimga shu chatga keladi.
8. Xodimning o'z mashinasini bron qilishi (rolni almashtirish) v2 da.

### 4.8 Fon ishlari: outbox va rejalashtiruvchi

- **Outbox.** `outbox.enqueue(tx, notification)` xabarni o'zgarish bilan bitta tranzaksiyada yozadi.
  `jobs/outbox-worker.ts` uni yetkazadi: qayta urinish, backoff va `dedupe_key` bilan. Telegram
  `403` yoki `chat not found` qaytarsa, `users.bot_access = blocked` bo'ladi va admin panelda
  "Telegram'da aloqa yo'q" belgisi chiqadi.
- **Xabar turlari** `src/notifications/types.ts` da (zod discriminated union). Matnlar
  `src/notifications/render/{uz,ru}.ts` da. Payload'da render uchun kerakli hamma ma'lumot nusxa
  sifatida bo'ladi, shuning uchun render sof funksiya. Til yozish paytida qabul qiluvchidan olinadi.
- **Rejalashtiruvchi** har daqiqada ro'yxatdagi `ScheduledTask` larni ishga tushiradi (`platform/scheduler.ts`).
  Har vazifa nima qilishni holatdan hisoblaydi. "Qachon" degan savolga `domain/` dagi sof funksiya
  javob beradi. Takrorlanmaslikni outbox'ning `dedupe_key`i kafolatlaydi.

| Vazifa | Modul | Nima qiladi |
|---|---|---|
| `expire-holds` | `orders` | Muddati o'tgan `new` arizani bekor qiladi (10.4) |
| `call-sla` | `orders` | Ish vaqtida 30 daqiqa qo'ng'iroqsiz qolgan ariza haqida rahbar va egasiga xabar beradi |
| `reminders` | `orders` | 24 va 2 soat oldin eslatma yuboradi (12-bo'lim) |

### 4.9 Fayllar (fotolar)

- `FileStore` porti (`platform/ports.ts`). v1 implementatsiyasi `storage/local-file-store.ts`
  (`UPLOADS_DIR`).
- Yuklash: `PUT .../photos/:mediaId` xom baytlar bilan. `mediaId`ni klient yaratadi, shuning uchun
  takroriy yuklash xavfsiz. Tur baytlardan aniqlanadi (JPEG, PNG, WebP; SVG va boshqalar rad etiladi),
  hajm ≤ 3 MB. Klient fotoni yuklashdan oldin ≈ 2 Mp gacha siqadi.
- Ko'rish: `GET /media/:id?exp=&sig=`, HMAC bilan imzolangan va 15 daqiqa amal qiladi (TZ 15.2).
  Imzolangan URL faqat huquqi bor odamga beriladi. Diskdagi fayl nomi tasodifiy UUID.

### 4.10 Frontend arxitekturasi

- **Mini App (`apps/tma`):** `main.tsx` → `telegram.ts` (SDK faqat shu yerda) → bootstrap → shell. Har
  shell o'z `features` papkalariga bo'lingan, ular bir-birini import qilmaydi. Umumiy komponentlar
  `ui/` da (DESIGN 5). Matnlar `i18n/{uz,ru}.ts` da, tipli: kalit yetishmasa kompilyatsiya xatosi
  beradi.
- **Admin (`apps/admin`):** React Router, har bo'lim `features/<nom>` da, sozlamalar `React.lazy` bilan.
  Sessiya `auth/` da. Komponentlar `ui/` da (DESIGN 6).
- Server holati TanStack Query'da. Mutatsiyadan keyin tegishli kalitlar yangilanadi. Admin panelda
  ro'yxatlar har 10 soniyada yangilanadi, yangi ariza kelsa ovoz chiqadi.
- Klientda biznes-qoida yo'q (2-bo'lim, 13-qoida). Masalan, bronning 3-qadamida "To'liq kuzov"
  tanlanganda boshqa zonalar o'chishi serverdan kelgan `excludes` ro'yxati bo'yicha ko'rsatiladi,
  yakuniy tekshiruv esa serverda.

---

## 5. Papka tuzilmasi

Papkalar yaratilgan. Hozircha ichida faqat `.gitkeep`, fayllar bosqichma-bosqich qo'shiladi.

```
car-service-platform/
├── CLAUDE.md                     ish qoidalari
├── README.md                     o'rnatish va buyruqlar (0-bosqich)
├── package.json                  npm workspaces, umumiy skriptlar (0-bosqich)
├── tsconfig.base.json, eslint.config.js, .prettierrc.json, .env.example (0-bosqich)
├── docs/
│   ├── PLAN.md                   shu hujjat
│   ├── DESIGN.md                 dizayn tizimi (PDF'lardan)
│   ├── reports/                  bosqich hisobotlari: README.md, _shablon.md, bosqich-N.md
│   ├── tz/                       TZ v2.0 (PDF)
│   └── design/                   UI dizayn (5 ta PDF)
├── packages/shared/src/          @cs/shared — bog'liqliksiz, server va klientlar uchun umumiy
│   ├── routes/                   auth, tma, client, master, admin: yo'l va metod
│   ├── contract/                 zod sxemalari (server; admin formalari)
│   ├── vocabulary/               holatlar, rollar, xato kodlari, enum'lar
│   ├── format/                   pul, sana, telefon (+998), davlat raqami
│   ├── i18n/                     tillar, tipli lug'at turi, umumiy yorliqlar uz/ru
│   └── styles/tokens.css         dizayn tokenlari (DESIGN 2–4): Mini App va admin bitta manbadan oladi
├── apps/server/
│   ├── scripts/                  build, dev-api, dev-init-data, dev-token, owner-create, telegram-signing
│   ├── src/
│   │   ├── main.ts, composition.ts, config.ts, logger.ts
│   │   ├── lib/                  sof yordamchilar: vaqt, pul, id
│   │   ├── platform/             outbox, scheduler, status-history, clock, ports, errors, tx
│   │   ├── db/
│   │   │   ├── schema/           har modulning jadvallari alohida faylda, index.ts eksport qiladi
│   │   │   ├── migrations/       drizzle-kit + qo'lda yozilgan SQL (EXCLUDE, triggerlar)
│   │   │   └── seeds/            reference (production'da ham), demo (faqat dev)
│   │   ├── modules/
│   │   │   ├── identity/         domain, app, http, bot
│   │   │   ├── audit/            app, http
│   │   │   ├── workshop/         domain, app, http
│   │   │   ├── catalog/          domain, app, http
│   │   │   ├── garage/           domain, app, http
│   │   │   ├── booking/          domain, app, http
│   │   │   ├── orders/           domain, app, http, bot
│   │   │   ├── clients/          app, http
│   │   │   ├── media/            domain, app, http
│   │   │   ├── reception/        domain, app, http, bot
│   │   │   ├── tasks/            domain, app, http
│   │   │   ├── payments/         domain, app, http, bot
│   │   │   └── dashboard/        app, http
│   │   ├── notifications/        types.ts (zod union), render/uz.ts, render/ru.ts
│   │   ├── http/                 app.ts, server.ts, route.ts (registerRoute), plugins/ (errors; auth-tma, auth-staff, rate-limit)
│   │   ├── bot/                  bot.ts (+ menyu tugmasi), polling.ts, texts.ts, keyboards.ts
│   │   ├── jobs/                 loop.ts, outbox-worker.ts, scheduler.ts
│   │   └── storage/              local-file-store.ts
│   └── test/                     faqat biznes-qoidalar (16-bo'lim)
│       ├── helpers/              test bazasi, factories, fake clock
│       ├── lib/                  pul va vaqt qoidalari
│       ├── shared/               packages/shared dagi kiritish qoidalari: telefon, davlat raqami
│       ├── db/                   baza kafolatlari: EXCLUDE, CHECK, audit trigger
│       └── modules/<nom>/        domain.test.ts, app.test.ts
├── apps/tma/                     @cs/tma — Mini App (mijoz va usta)
│   ├── public/                   ikonka (shrift @fontsource paketidan Vite orqali keladi)
│   ├── scripts/                  check-bundle.mjs
│   └── src/
│       ├── main.tsx, App.tsx (shell tanlash), telegram.ts, api.ts, bootstrap.tsx
│       ├── styles/               base.css (tokenlar @cs/shared/tokens.css dan)
│       ├── ui/                   DESIGN 5 komponentlari
│       ├── lib/                  draft (CloudStorage), photo-compress
│       ├── i18n/                 uz.ts, ru.ts
│       ├── onboarding/           T0
│       └── shells/
│           ├── client/           home, garage, booking, orders, profile
│           ├── master/           tasks, task, photo-queue
│           └── staff/            "Panelni brauzerda oching"
├── apps/admin/                   @cs/admin — veb-panel (PUBLIC_URL/admin/)
│   ├── public/
│   └── src/
│       ├── main.tsx, router.tsx, api.ts
│       ├── styles/, ui/, lib/, i18n/
│       ├── auth/                 login, 2FA, sessiya
│       ├── layout/               Sidebar, Topbar
│       └── features/             today, orders, order, new-order, reception, tasks, handover,
│                                 schedule, clients, settings
└── deploy/                       systemd unit, nginx namunasi, deploy.sh, backup.sh, restore.sh (7-bosqich)
```

Paket nomlari: `@cs/server`, `@cs/shared`, `@cs/tma`, `@cs/admin`. Buyruqlar repo ildizidan ishga
tushiriladi.

---

## 6. Muhit o'zgaruvchilari

```
NODE_ENV=development
LOG_LEVEL=info
PUBLIC_URL=                    # https://..., Mini App: PUBLIC_URL/, admin: PUBLIC_URL/admin/
TELEGRAM_BOT_TOKEN=            # ishlab chiqishda alohida TEST bot
DATABASE_URL=postgres://carservice:...@localhost:5432/carservice
TEST_DATABASE_URL=postgres://carservice:...@localhost:5432/carservice_test   # nomi _test bilan tugaydi
HTTP_HOST=127.0.0.1
HTTP_PORT=3000
UPLOADS_DIR=./data/uploads
MEDIA_URL_SECRET=              # imzolangan foto URL'lari uchun, ≥ 32 bayt
COOKIE_SECURE=true             # lokal http ishlab chiqishda false
```

`config.ts` hammasini zod bilan tekshiradi. Xato bo'lsa jarayon tushunarli xabar bilan to'xtaydi.
Telegram'siz ishlab chiqish uchun `npm run dev:init-data -- --user=<telegram_id>` test bot tokeni bilan
imzolangan `initData` ni `apps/tma/.env.local` ga yozadi. Bu faqat `import.meta.env.DEV` da ishlaydi.

---

## 7. Ma'lumotlar modeli

### 7.1 Umumiy qoidalar

- `id` — UUID v7. `created_at` va `updated_at` — `timestamptz`.
- Pul `bigint` va so'mda saqlanadi. Drizzle'da `mode: 'number'` (Number.MAX_SAFE_INTEGER so'm yetarli).
- Enum'lar PostgreSQL enum turida, qiymatlari `packages/shared/src/vocabulary` dagi bilan bir xil.
- Ma'lumotnomalar o'chirilmaydi, `is_active` bilan yashiriladi. Ariza, to'lov, tarix va audit hech
  qachon o'chirilmaydi.
- Drizzle bilmaydigan narsalar (`EXCLUDE`, trigger, sequence boshlang'ich qiymati) qo'lda yozilgan
  migratsiya bilan qo'shiladi (`drizzle-kit generate --custom`). Qo'llangan migratsiya tahrirlanmaydi.

### 7.2 identity

**users** — har bir odam: mijoz ham, xodim ham.

| Maydon | Turi | Izoh |
|---|---|---|
| `telegram_id` | bigint unique null | Qo'lda yaratilgan mijoz yoki hali bog'lanmagan xodimda null |
| `phone` | text unique null | `+998XXXXXXXXX` |
| `phone_verified` | boolean | Telegram tasdiqlagan bo'lsa true. Admin kiritgan raqamda false |
| `full_name` | text | |
| `lang` | enum(`uz`, `ru`) | |
| `bot_access` | enum(`unknown`, `allowed`, `blocked`) | |
| `reminders_enabled` | boolean default true | T13 |
| `consent_version`, `consent_at` | text null, timestamptz null | Rozilik (TZ 15.3) |
| `login` | text unique null | Panelga kiradigan xodimlar uchun |
| `password_hash` | text null | Argon2id |
| `specialization` | text null | Usta: "Plyonka, keramika" |
| `internal_note` | text null | Admin uchun, mijoz ko'rmaydi (A10) |
| `is_blocked` | boolean | Xodimni o'chirish |
| `deletion_requested_at`, `anonymized_at` | timestamptz null | |
| `last_seen_at`, `created_by` | | |

**Telefon orqali bog'lash.** Telegram foydalanuvchisi raqamini ulashganda Telegram uni tasdiqlagan
bo'ladi. Shu raqamli, lekin `telegram_id` siz yozuv bor bo'lsa (admin yaratgan mijoz yoki egasi qo'shgan
xodim), yangi hisob o'sha yozuvga qo'shiladi: `telegram_id`, til va rozilik ko'chadi, bo'sh yangi yozuv
o'chadi. Telefonsiz foydalanuvchida mashina yoki ariza bo'lmaydi, shuning uchun ko'chiriladigan boshqa
ma'lumot yo'q. Raqam boshqa `telegram_id` ga bog'langan bo'lsa, bog'lash rad etiladi va
"Servisga murojaat qiling" deyiladi. Raqamning manbai: Mini App `requestContactComplete` dan olgan xom
javob (`raw`). Server uning imzosini bot tokeni bilan `initData` kabi tekshiradi, `contact.user_id`
so'rov yuborgan foydalanuvchiga teng bo'lishi shart, javob 1 soatdan eski bo'lmasligi kerak
(`identity/domain/telegram-data.ts`, 22-bo'lim). Bog'lash faqat hali raqami yo'q foydalanuvchi uchun:
raqami bor odamning o'z tarixi bor, uni avtomatik qo'shib bo'lmaydi.

Keyin qo'shiladigan ustunlar: `reminders_enabled` (3-bosqich), `internal_note`, `deletion_requested_at`,
`anonymized_at` (4-bosqich).

**user_roles** — `(user_id, role)` asosiy kalit; `role` enum(`master`, `admin`, `director`, `owner`);
`granted_by`, `granted_at`. Mijoz roli yo'q: rolsiz har kim mijoz.

**sessions** — `id` (tokenning sha256 xeshi, token o'zi faqat cookie'da), `user_id`, `created_at`,
`last_seen_at`, `expires_at` (30 kun), `ip`, `user_agent`. 12 soat faollik bo'lmasa sessiya tugaydi.

**login_challenges** — 2FA: `user_id`, `code_hash` (`sha256(challengeId:kod)`), `created_at`,
`expires_at` (5 daqiqa), `attempts` (≤ 5), `consumed_at`. Yangi kod oldingilarini bekor qiladi, kod
daqiqasiga bir martadan ko'p yuborilmaydi.

**login_failures** — noto'g'ri parollar: `subject`, `ip`, `at`. `subject` odam topilsa `user:<id>`
(login va telefon bitta hisobga tushadi), topilmasa yozilgan matn. Oxirgi 15 daqiqada 10 ta bo'lsa
kirish to'xtaydi; muvaffaqiyatli kirish hisobni tozalaydi.

### 7.3 audit

**audit_log** — `actor_id` null, `action`, `entity`, `entity_id`, `before` jsonb, `after` jsonb, `ip`,
`at`. Trigger `UPDATE` va `DELETE` ni rad etadi. Yoziladi: narx va prays o'zgarishi, chegirma, to'lov va
uni tuzatish, fiskal chek, rol va xodim o'zgarishi, sozlamalar, anonimlashtirish, ariza bandlarini
tahrirlash.

### 7.4 workshop

**settings** — bitta qator (`id = 1`), `data` jsonb, `updated_at`, `updated_by`. O'qishda
`DEFAULT_SETTINGS` bilan birlashtiriladi va zod bilan tekshiriladi, shuning uchun yangi sozlama
migratsiya talab qilmaydi.

```ts
workshop: { name, address, phone, mapUrl, policyUrl, policyVersion }
rules: {
  slotStepMin: 30, minLeadMin: 120, horizonDays: 30, bufferMin: 15,
  holdNewWorkMin: 120, holdNoAnswerHours: 24,
  callWarnMin: 15, callEscalateMin: 30,
  reminderHours: [24, 2],
  adminDiscountLimitPct: 5,
}
```

**work_hours** — `weekday` (1–7) asosiy kalit, `open`, `close`, `break_start` null, `break_end` null.
Qatori yo'q kun dam olish kuni. CHECK: tugash boshlanishdan keyin, tanaffus ish vaqti ichida.

**holidays** — `date` asosiy kalit, `name`.

**boxes** — `name`, `sort`, `is_active`, `note`. **box_service_types** — `(box_id, service_type_id)`.
Boks vaqtincha ta'mirda bo'lsa, bloklash bilan yopiladi (`bookings.kind = block`).

### 7.5 catalog

- **car_brands** — `name`, `sort`, `is_active`.
- **car_models** — `brand_id`, `name`, `body_class` enum(`S`, `M`, `L`, `XL`), `sort`, `is_active`;
  unique(`brand_id`, lower(`name`)).
- **service_types** — `code` unique, `name_uz`, `name_ru`, `icon`, `sort`, `is_active`.
- **services** (zonalar) — `service_type_id`, `name_uz`, `name_ru`, `group` enum(`body`, `glass`,
  `interior`, `other`), `is_custom` ("Boshqa": narxi kelishiladi), `sort`, `is_active`.
- **service_excludes** — `(service_id, excluded_service_id)`: "To'liq kuzov" tanlansa olib tashlanadigan
  zonalar. Ikkalasi bir xil xizmat turida bo'lishi kerak (app tekshiradi).
- **service_prices** — `(service_id, body_class)` asosiy kalit, `price` bigint null (null — kelishiladi),
  `duration_min` int > 0 (ish daqiqalari, ko'p kunli ish uchun ham). Katak yo'q bo'lsa, zona shu sinfga taklif qilinmaydi. "Boshqa" (`is_custom`) zonaning narxi doim `null`.
- **cancel_reasons** — `code` unique, `name_uz`, `name_ru`, `applies_to` enum(`client`, `staff`,
  `system`), `requires_text`, `sort`, `is_active`. `applies_to`: `client` — mijoz ham, xodim ham tanlay oladi; `staff` — faqat xodim; `system` — faqat tizim. Boshlang'ich ro'yxat TZ 14.4 dan, `system` turida
  `no_contact` ("Aloqa bo'lmadi").

### 7.6 garage

**cars** — `client_id`, `model_id` null, `custom_model_text` null, `body_class`, `year`, `plate`
(normallashtirilgan: katta harf, bo'shliqsiz), `color` null, `archived_at` null.
- CHECK: `model_id` yoki `custom_model_text` dan biri bo'lishi shart.
- Partial unique (`client_id`, `plate`) where `archived_at is null`.
- `body_class` modeldan olinadi. "Boshqa" modelda mijoz rasmli tavsif bo'yicha tanlaydi, admin keyin
  modelga bog'lab, sinfni to'g'rilashi mumkin.

### 7.7 booking

**bookings** — `kind` enum(`order`, `block`), `order_id` null, `box_id`, `starts_at`, `ends_at`,
`released_at` null, `release_reason` null, `note` null (bloklash sababi), `created_by`.

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (box_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (released_at IS NULL);
CREATE UNIQUE INDEX bookings_one_active_per_order ON bookings (order_id)
  WHERE released_at IS NULL AND kind = 'order';
```

- CHECK: `ends_at > starts_at`; `kind = 'order'` bo'lsa va faqat shunda `order_id` bor.
- `[)` tufayli ketma-ket vaqtlar (10:00–12:00 va 12:00–13:00) kesishmaydi.
- Ko'p kunli ish bitta qator: mashina tunda ham boksda turadi (10.2).
- `bookings_one_active_per_order` v1 qoidasi: ariza bitta boksni egallaydi. v2 da ketma-ket bokslar
  uchun shu indeks olib tashlanadi, sxemaning boshqa joyi o'zgarmaydi.

### 7.8 orders

**orders**

| Maydon | Izoh |
|---|---|
| `number` | int unique, `order_number_seq` 1001 dan; ekranda "№1042" |
| `status` | enum(`new`, `confirmed`, `in_work`, `ready_for_pickup`, `completed`, `cancelled`, `no_show`) |
| `source` | enum(`tma`, `phone`, `walk_in`, `instagram`, `other`) |
| `client_id`, `car_id` | |
| `car_snapshot` | jsonb: marka, model, yil, raqam, rang, sinf |
| `body_class` | Narx hisobi uchun nusxa |
| `client_comment` | null |
| `subtotal`, `discount_amount`, `discount_percent` null, `discount_reason` null, `discount_by` null, `total` | CHECK: `total = subtotal - discount_amount`, `0 ≤ discount_amount ≤ subtotal` |
| `hold_until` | null; faqat `new` holatida |
| `reschedule_requested_at` | null; mijoz ko'chirishni so'raganda |
| `confirmed_at`, `confirmed_by`, `work_started_at`, `ready_at`, `completed_at` | |
| `cancelled_at`, `cancelled_by`, `cancel_reason_id`, `cancel_note` | |
| `client_request_id` | uuid null; unique(`client_id`, `client_request_id`), takroriy yuborishdan himoya |
| `created_by` | null (mijoz o'zi yaratgan bo'lsa) |

**order_items** — `order_id`, `service_id`, `service_type_id`, `name_uz`, `name_ru`, `type_name_uz`,
`type_name_ru` (nusxa), `body_class`, `price` null (kelishiladi), `duration_min`, `comment` null,
`kind` enum(`booked`, `extra`), `approval` enum(`not_required`, `pending`, `approved`, `rejected`),
`approval_via` enum(`tma`, `bot`, `phone`) null, `approval_at` null, `task_id` null, `created_by`.

**order_calls** — `order_id`, `admin_id`, `outcome` enum(`confirmed`, `no_answer`, `rejected`),
`note`, `at`. v2 dagi "qo'ng'iroqqacha vaqt" ko'rsatkichi shundan olinadi.

**reviews** — `order_id` asosiy kalit, `client_id`, `rating` 1–5, `text` null, `created_at`.

**status_history** (`platform`) — `entity` enum(`order`, `task`), `entity_id`, `from_status` null,
`to_status`, `actor_id` null (tizim), `reason_id` null, `comment` null, `at`.

### 7.9 reception

**reception_acts** — `order_id` unique, `status` enum(`draft`, `sent`, `confirmed`), `mileage_km`,
`fuel_level` 0–4, `checklist` jsonb (`spareWheel`, `jack`, `mats`, `documents`), `personal_items` null,
`sent_at`, `confirmed_at`, `confirmed_via` enum(`bot`, `tma`, `verbal`), `confirmed_by` null (og'zaki
tasdiqni yozgan admin), `created_by`.

**reception_defects** — `act_id`, `view` enum(`top`, `left`, `right`, `front`, `back`, `interior`),
`x`, `y` (0–1, ko'rinish rasmiga nisbatan), `kind` enum(`scratch`, `chip`, `dent`, `crack`, `other`),
`note`, `media_id` null, `sort`.

### 7.10 tasks

**tasks** — `order_id`, `master_id`, `assistant_id` null, `status` enum(`assigned`, `in_progress`,
`on_review`, `rework`, `accepted`), `instruction`, `norm_minutes` (bandlar yig'indisi), `started_at`,
`submitted_at`, `accepted_at`, `rework_count`, `last_remark`, `created_by`. Indeks: (`master_id`,
`status`). Bitta vazifa arizaning bir yoki bir nechta bandini qamraydi (`order_items.task_id`).

**task_reports** — `task_id`, `attempt`, `comment`, `submitted_at`, `decision` enum(`accepted`,
`rework`) null, `remark` null, `decided_by`, `decided_at`; unique(`task_id`, `attempt`).

### 7.11 media

**media** — `id` (klient yaratadi), `purpose` enum(`reception_side`, `reception_defect`, `task_before`,
`task_after`), `side` enum(`front`, `back`, `left`, `right`) null, `reception_act_id` null, `task_id`
null, `attempt` null, `storage_key`, `mime`, `bytes`, `width`, `height`, `uploaded_by`, `created_at`.
CHECK: `num_nonnulls(reception_act_id, task_id) = 1`. v2 da `product_id` qo'shiladi.

### 7.12 payments

**payments** — `order_id`, `method` enum(`cash`, `card_terminal`, `transfer`), `amount` > 0,
`received_by`, `received_at`.

**fiscal_receipts** — `order_id` unique, `provider` enum(`manual`), `status` enum(`done`),
`receipt_no`, `fiscal_sign` null, `receipt_url` null, `amount`, `request_id` unique (checkout
idempotentligi), `created_by`, `created_at`. v2 da `provider` ga kassa nomi, `status` ga `pending` va
`failed` qo'shiladi.

### 7.13 platform

**outbox** — `payload` jsonb, `dedupe_key` unique null, `status`, `attempts`, `next_attempt_at`,
`last_error`, `sent_at`, `created_at`.

---

## 8. Rollar va huquqlar

Huquqlar kodda qat'iy: `identity/domain/roles.ts` (`permissionsOf`). Admin route guruhi faqat sessiyani
talab qiladi; ruxsatni har use-case o'zi tekshiradi (`requirePermission(actor, '...')`,
`platform/actors.ts`), shuning uchun huquq qoidasi testda use-case darajasida sinaladi. Ustaning har bir
so'rovi `master_id = actor.id` sharti bilan bajariladi.

| Amal | Mijoz | Usta | Admin | Rahbar | Egasi |
|---|---|---|---|---|---|
| O'z garaji, bron, arizasini bekor qilish (`in_work` gacha), qo'shimcha ish va dalolatnomani tasdiqlash, baho | ✔ | — | — | — | — |
| O'z vazifalari: ko'rish, boshlash, foto, topshirish | — | ✔ | — | — | — |
| Bugun, arizalar, jadval, mijozlar: ko'rish | — | — | ✔ | ✔ | ✔ |
| Ariza: yaratish, qo'ng'iroq natijasi, bandlar va narxlar (`in_work` gacha), ko'chirish, bekor qilish, "kelmadi" | — | — | ✔ | — | ✔ |
| Bloklash, qabul dalolatnomasi, vazifa berish, hisobotni tekshirish, qo'shimcha ish qo'shish | — | — | ✔ | — | ✔ |
| Chegirma (limitgacha) va checkout | — | — | ✔ | — | ✔ |
| Mijoz yaratish, tahrirlash, ichki izoh | — | — | ✔ | — | ✔ |
| `in_work` dan bekor qilish, limitdan katta chegirma, to'lov usulini tuzatish, anonimlashtirish | — | — | — | — | ✔ |
| Sozlamalar, prays, ma'lumotnomalar, xodimlar, audit jurnali | — | — | — | — | ✔ |

- Mijoz faqat Telegram orqali kiradi.
- Xodim panelga login va parol bilan kiradi. Rahbar va egasi uchun 2-qadam majburiy: kod xodimning
  Telegram chatiga bot orqali keladi.
- Ustaga mijoz telefoni, narxlar va boshqa ustalarning vazifalari ko'rsatilmaydi. Bu javob sxemasida
  yo'q, ya'ni UI'da yashirilgan emas.
- Bitta odamning bir nechta roli bo'lishi mumkin, huquqlar qo'shiladi.

---

## 9. Holat mashinalari

### 9.1 Ariza (`orders/domain/order-status.ts`)

| Qayerdan | Qayerga | Kim | Shart va natija |
|---|---|---|---|
| — | `new` | Mijoz (TMA) yoki admin | Slot band, `hold_until` qo'yiladi |
| — | `confirmed` | Admin | Qo'lda ariza, "Mijoz telefonda tasdiqladi" belgilangan |
| `new` | `confirmed` | Admin ("Tasdiqladi") | `hold_until` tozalanadi; mijozga xabar |
| `new` | `cancelled` | Admin ("Rad etdi", sabab majburiy), mijoz (sabab), tizim (`no_contact`) | Slot bo'shaydi |
| `confirmed` | `cancelled` | Admin yoki mijoz, sabab bilan | Slot bo'shaydi |
| `confirmed` | `no_show` | Admin | Faqat slot boshlangandan keyin; slot bo'shaydi |
| `confirmed` | `in_work` | Admin ("Ishga topshirish") | Dalolatnoma `confirmed` bo'lishi shart (10-bo'lim, 5-bosqich) |
| `in_work` | `ready_for_pickup` | Tizim | Barcha tasdiqlangan bandlar qabul qilingan vazifalarda va `pending` band yo'q |
| `in_work` | `cancelled` | Faqat egasi, sabab bilan | Mijoz mashinani ish tugamasdan olib ketdi |
| `ready_for_pickup` | `completed` | Admin (checkout) | To'lovlar yig'indisi = `total`, fiskal chek kiritilgan |

- Ko'chirish holatni o'zgartirmaydi, faqat slotni (`new`, `confirmed` da).
- `in_work` dan bekor qilganda bajarilgan qism uchun to'lov olish v1 da majburlanmaydi, sabab va audit
  bilan qayd etiladi.
- Ariza `ready_for_pickup` bo'lganda bron qisqartiriladi: hali boshlanmagan bo'lsa butunlay bo'shatiladi,
  boshlangan bo'lsa `ends_at = now` bo'ladi. Shunda bo'sh qolgan vaqt boshqa mijozga ochiladi.

### 9.2 Vazifa (`tasks/domain/task-status.ts`)

| Qayerdan | Qayerga | Kim | Shart |
|---|---|---|---|
| — | `assigned` | Admin | Ariza `in_work`, bandlar tasdiqlangan va boshqa vazifada emas |
| `assigned`, `in_progress` | `assigned` | Admin | Boshqa ustaga berish |
| `assigned` | `in_progress` | Usta ("Ishni boshlash") | `started_at` qo'yiladi |
| `in_progress` | `on_review` | Usta | Joriy urinishda kamida 1 ta "keyin" fotosi |
| `on_review` | `accepted` | Admin | — |
| `on_review` | `rework` | Admin | Izoh majburiy; `rework_count + 1` |
| `rework` | `on_review` | Usta | Yangi urinishda kamida 1 ta "keyin" fotosi |

Oxirgi vazifa `accepted` bo'lganda o'sha tranzaksiyada `orders.onTasksChanged` chaqiriladi (9.1).

### 9.3 Qo'shimcha ish bandi

`pending` (admin qo'shdi, mijozga so'rov ketdi) → `approved` yoki `rejected`. Mijoz botda yoki ilovada
javob beradi, admin esa "telefon orqali" deb belgilashi mumkin. `pending` va `rejected` bandlar
`subtotal` ga kirmaydi. `approved` bandga vazifa beriladi.

### 9.4 Qabul dalolatnomasi

`draft` → `sent` (mijozga yuborildi) → `confirmed` (mijoz botda yoki ilovada tasdiqladi, yoki admin
"og'zaki tasdiqladi" deb belgiladi). Yuborish shartlari: probeg, yoqilg'i darajasi va to'rt tomondan
fotolar (old, orqa, chap, o'ng).

---

## 10. Bron va slotlar

Hisob faqat `booking/domain/` va `workshop/domain/` da. Klient tanlagan vaqt ham server tomonidan shu
funksiyalar orqali qayta tekshiriladi.

### 10.1 Ish vaqti (`workshop/domain/working-time.ts`)

- `workIntervals(date)` — kunning ish oraliqlari: tanaffus chiqarib tashlanadi, dam olish kuni va
  bayramda bo'sh ro'yxat.
- `addWorkMinutes(start, minutes)` — ish oraliqlari bo'ylab vaqt qo'shadi, tanaffus, kechqurun va dam
  olish kunlarini o'tkazib yuboradi.
- `workMinutesBetween(a, b)` — 15 va 30 daqiqalik qo'ng'iroq taymerlari, `hold_until` uchun.

### 10.2 Ish davomiyligi va egallanadigan vaqt

- `W = Σ duration_min (bandlar, avtomobil sinfi bo'yicha) + bufferMin (15)`.
- Kerakli xizmat turlari `T` — bandlar turlari to'plami. Mos bokslar — faol va `T` dagi hamma turni
  qo'llaydigan bokslar.
- `W` kunning ish daqiqalariga sig'sa, bu **bir kunlik ish**: boshlanish `slotStepMin` qadamlari bilan,
  `addWorkMinutes(start, W)` o'sha kunning yopilishidan oshmasligi kerak.
- Aks holda bu **ko'p kunli ish**: boshlanish faqat kunning ochilish vaqti. Mijoz faqat topshirish
  kunini tanlaydi, tizim taxminiy tayyor bo'lish vaqtini ko'rsatadi (TZ 7.2).
- Boks egallanadigan oraliq: `[start, addWorkMinutes(start, W))`, uzluksiz. Tanaffus va tun ham ichida,
  chunki mashina boksda turadi.

### 10.3 Bo'sh vaqtlar

- **Kunlar** (`availability`): bugundan `horizonDays` gacha. Har kun `free`, `full` yoki `closed`
  (sababi: dam olish kuni yoki bayram).
- **Vaqtlar** (`slots`): tanlangan kun uchun boshlanish vaqtlari. Har biriga `free` belgisi, boks nomi va
  "tayyor bo'ladi" vaqti. Bir xil vaqtda bir necha boks bo'sh bo'lsa, `sort` bo'yicha birinchisi
  ko'rsatiladi.
- `now + minLeadMin` dan oldingi vaqtlar `free: false`.
- Tanlangan kun to'liq band bo'lsa, server eng yaqin 3 ta bo'sh vaqtni qaytaradi (mijoz PDF, 18-sahifa).
- Mijozga kim yoki nima band qilgani aytilmaydi, faqat `free`.

### 10.4 Yaratish, ushlab turish, ko'chirish

- **Yaratish.** Bitta tranzaksiyada: narx va davomiylik qayta hisoblanadi, mos bokslar ketma-ket
  sinaladi (`INSERT ... ON CONFLICT DO NOTHING RETURNING`). Bo'sh natija keyingi boksga o'tishni
  bildiradi, hammasi band bo'lsa `slot_taken`. Shu tranzaksiyada ariza, bandlar, `status_history` va
  outbox ham yoziladi.
- **Ushlab turish.** `hold_until = addWorkMinutes(created_at, holdNewWorkMin)`. Ish vaqti bo'yicha
  hisoblanadi, shuning uchun tunda qilingan bron ertalab admin kelmasidan bekor bo'lib qolmaydi.
- **"Javobsiz"** bosilganda: `hold_until = max(hold_until, now + holdNoAnswerHours)`.
- **Avto-bekor.** `now ≥ hold_until` va `hold_until < starts_at` bo'lsa, ariza `cancelled` bo'ladi,
  sababi `no_contact`, mijozga xabar ketadi. `hold_until ≥ starts_at` bo'lsa, ariza avto-bekor
  qilinmaydi: u slot vaqtigacha "Yangi" bo'lib turadi va admin vaziyatni joyida hal qiladi.
- **Ko'chirish** (admin, `new` yoki `confirmed` da) bron qatorini `UPDATE` qiladi. `23P01` xatosi
  `slot_taken` ga aylanadi va eski vaqt saqlanib qoladi.
- **Bandlar o'zgarsa** (admin, `in_work` gacha) davomiylik qayta hisoblanadi va bron o'sha boshlanish
  vaqtidan uzaytiriladi yoki qisqartiriladi. Ziddiyat chiqsa `slot_taken`: admin avval arizani ko'chiradi.
- **Bloklash** (admin): `kind = block`, istalgan oraliq, sabab bilan. Mavjud bron bilan kesishsa
  `slot_taken`.

---

## 11. Narx, chegirma, to'lov, fiskal

- `subtotal` — narxi bor va `approval ∈ {not_required, approved}` bo'lgan bandlar narxlari yig'indisi.
  Narxi yo'q band ("kelishiladi") dastlabki chekda alohida ko'rsatiladi va yig'indiga kirmaydi.
- **Chegirma** — butun arizaga, foiz yoki summa sifatida, sabab majburiy. Foiz:
  `amount = round_half_up(subtotal × p / 100)`. Admin uchun chegara:
  `amount ≤ round_half_up(subtotal × adminDiscountLimitPct / 100)`. Egasi uchun chegara yo'q, faqat
  `amount ≤ subtotal`. Chegirma bandlar o'zgarganda qayta hisoblanadi: foizli bo'lsa foizdan, summali
  bo'lsa `min(amount, subtotal)`.
- **Checkout** — bitta atomar so'rov: to'lovlar ro'yxati (usul va summa), fiskal chek raqami,
  `requestId`. Shartlar:
  - holat `ready_for_pickup`;
  - barcha faol bandlarda narx bor (`unpriced_items`);
  - to'lovlar yig'indisi `total` ga teng (`payment_mismatch`);
  - chek raqami bo'sh emas va 64 belgidan oshmaydi.
  Natijada to'lovlar, chek va `completed` holati bitta tranzaksiyada yoziladi, mijozga xabar ketadi.
  Bir xil `requestId` bilan takroriy so'rov o'sha natijani qaytaradi.
- Oldindan to'lov va qisman to'lov v1 da yo'q. Arizaning to'lovlari faqat checkout'da yoziladi.
- **To'lov usulini tuzatish** — faqat egasi, summa o'zgarmaydi, audit bilan. Pulni qaytarish v2 da.
- **Fiskal chek.** `FiscalProvider` porti; v1 implementatsiyasi `manual`: admin mavjud onlayn-KKM yoki
  virtual kassada chek chiqaradi va raqamini kiritadi. Interfeys v2 dagi asinxron kassa API'ga mos
  (`pending`, `failed`, qayta urinish).

---

## 12. Bot va xabarlar

Bitta bot. `/start` salomlashadi va "Ilovani ochish" tugmasini beradi. Menyu tugmasi ishga tushganda bir
marta umumiy qilib o'rnatiladi (`setChatMenuButton`, `PUBLIC_URL`). Xabar qabul qiluvchining tilida
yoziladi. Tugmalar:
- `web_app` — Mini App'ni kerakli ekranda ochadi (`?order=` yoki `?task=`);
- `web_app` (xodimga) — admin panelni Telegram ichida arizaning sahifasida ochadi (PLAN 22, 2026-11-20);
- `callback` — tasdiqlar. Callback'dan kelgan id'larga ishonilmaydi: egalik serverda tekshiriladi.

| Kod | Kimga | Qachon | Tugmalar |
|---|---|---|---|
| `order.created` | Mijoz | Ariza yaratildi (TMA) | Arizani ochish |
| `order.confirmed` | Mijoz | Tasdiqlandi | Arizani ochish |
| `order.reminder` | Mijoz | 24 va 2 soat oldin (`confirmed`, `reminders_enabled`) | Arizani ochish |
| `order.rescheduled` | Mijoz | Admin ko'chirdi | Arizani ochish |
| `order.cancelled` | Mijoz | Admin yoki tizim bekor qildi | — (servis telefoni matnda) |
| `act.confirm_request` | Mijoz | Dalolatnoma yuborildi: probeg, yoqilg'i, N ta nuqson, N ta foto | Tasdiqlayman, Arizani ochish |
| `extra.approval_request` | Mijoz | Qo'shimcha ish qo'shildi, yangi jami | Roziman, Kerak emas |
| `order.ready` | Mijoz | `ready_for_pickup`: summa, yopilish vaqti | Arizani ochish |
| `order.completed` | Mijoz | `completed`: rahmat va baho so'rovi | 1–5 yulduz |
| `staff.order_new` | Adminlar | Yangi ariza | Panelda ochish |
| `staff.order_unanswered` | Rahbar, egasi | 30 daqiqa ish vaqtida qo'ng'iroqsiz | Panelda ochish |
| `staff.client_cancelled` | Adminlar | Mijoz bekor qildi | Panelda ochish |
| `staff.reschedule_requested` | Adminlar | Mijoz ko'chirishni so'radi | Panelda ochish |
| `staff.extra_decided` | Adminlar | Mijoz qo'shimcha ishga javob berdi | Panelda ochish |
| `staff.task_assigned` | Usta | Vazifa berildi yoki unga o'tkazildi | Vazifani ochish |
| `staff.task_rework` | Usta | Qayta ishlashga qaytarildi, izoh bilan | Vazifani ochish |
| `staff.report_submitted` | Adminlar | Usta hisobot topshirdi | Panelda ochish |
| `staff.login_code` | Xodim | 2-qadam kodi. Outbox orqali emas, darhol yuboriladi: odam ekranda kutib turadi, 5 daqiqadan keyin kod keraksiz | — |
| `staff.deletion_requested` | Egasi | Mijoz ma'lumotlarini o'chirishni so'radi | Panelda ochish |

**Eslatma qoidasi** (`orders/domain/reminders.ts`): 24 soatlik eslatma ariza 24 soatlik oyna
boshlanishidan oldin tasdiqlangan bo'lsa ketadi; 2 soatlik ham xuddi shunday. `dedupe_key =
reminder:<orderId>:<24|2>:<starts_at>`, shuning uchun ko'chirilgan arizaga yangi eslatma ketadi.

---

## 13. HTTP API

Yo'llar `packages/shared/src/routes`, sxemalar `contract` da. Guruhlar va autentifikatsiya:

| Prefiks | Auth | Kim |
|---|---|---|
| `/api/tma/*` | `Authorization: tma <initData>` | Har qanday Telegram foydalanuvchisi |
| `/api/client/*` | initData | Mijoz (bron va garaj uchun telefon talab qilinadi: `phone_required`) |
| `/api/master/*` | initData + `master` roli | Usta |
| `/api/auth/*` | — / sessiya | Xodim logini |
| `/api/admin/*` | Sessiya cookie + route'ning `permission` qiymati | Admin, rahbar, egasi |
| `/media/:id` | Imzolangan URL | Huquqi bor odam |
| `/health` | — | Monitoring |

**TMA va mijoz**

| Yo'l | Vazifa |
|---|---|
| `GET /api/tma/bootstrap` | 4.7-bo'lim |
| `PUT /api/tma/me/onboarding` | Til, ism, rozilik |
| `PATCH /api/tma/me` | Til (3-bosqichda ism va `remindersEnabled` ham) |
| `POST /api/tma/me/phone` | Telegram imzolagan kontakt (`requestContactComplete` ning `raw` javobi) |
| `POST /api/tma/me/deletion-request` | Ma'lumotlarni o'chirish so'rovi (4-bosqich) |
| `GET /api/client/catalog` | Markalar va modellar, xizmat turlari, zonalar (kesh) |
| `GET, POST /api/client/cars`, `PATCH /api/client/cars/:id`, `POST .../:id/archive` | Garaj |
| `POST /api/client/quote` | `carId`, `serviceIds`: bandlar, narxlar, jami, davomiylik, ko'p kunlimi |
| `GET /api/client/availability` | `carId`, `serviceIds`: 30 kun |
| `GET /api/client/slots` | `carId`, `serviceIds`, `date`: vaqtlar, boks, tayyor bo'lish vaqti, eng yaqin bo'sh vaqtlar |
| `POST /api/client/orders` | `requestId`, `carId`, `serviceIds`, `startsAt`, `comment` |
| `GET /api/client/orders?tab=active\|history`, `GET .../:id` | Ro'yxat, kuzatuv (zonalar holati bilan) |
| `POST /api/client/orders/:id/cancel` | Sabab (`client` turidagi) |
| `POST /api/client/orders/:id/reschedule-request` | Adminlarga so'rov |
| `GET /api/client/orders/:id/act` | Yuborilgan dalolatnomani ko'rish (`canConfirm` serverdan) |
| `POST /api/client/orders/:id/act/confirm` | Dalolatnomani tasdiqlash |
| `POST /api/client/orders/:id/extra/:itemId` | `approve` yoki `reject` |
| `POST /api/client/orders/:id/review` | 1–5 va izoh (yulduz bir marta; botdagi yulduzga izoh keyin ilovada) |
| `GET /api/client/orders/:id/result` | T12: ish fotolari (oldin va qabul qilingan urinishning keyin), to'lov usullari, chek raqami (22-bo'lim) |

**Usta**

| Yo'l | Vazifa |
|---|---|
| `GET /api/master/tasks?tab=today\|rework\|done`, `GET .../:id` | Faqat o'z vazifalari |
| `POST /api/master/tasks/:id/start` | Boshlash |
| `PUT /api/master/tasks/:id/photos/:mediaId?purpose=before\|after` | Foto (xom baytlar, idempotent) |
| `DELETE /api/master/tasks/:id/photos/:mediaId` | Topshirishdan oldin o'chirish |
| `POST /api/master/tasks/:id/submit` | Izoh bilan tekshiruvga yuborish |

**Xodim kirishi:** `POST /api/auth/login` (`{ login, password }`, login o'rniga telefon ham bo'ladi →
`signed_in` + `me` yoki `code_sent` + `challengeId`), `POST /api/auth/code`, `POST /api/auth/logout`,
`GET, PATCH /api/auth/me` (til). Sessiya cookie'si `cs_session`: `HttpOnly`, `SameSite=Strict`,
`Path=/api`, production'da `Secure`.

**Admin**

| Yo'l | Vazifa |
|---|---|
| `GET /api/admin/today` | Hisoblagichlar, bugungi kelishlar, tekshiruvdagi hisobotlar, bugungi kassa |
| `GET /api/admin/orders?from&to&serviceTypeId&q` | Kanban uchun |
| `GET /api/admin/orders/:id` | Ariza ichida: bandlar, mijoz, mashina, bron, qo'ng'iroqlar, tarix, dalolatnoma, vazifalar, to'lov |
| `POST /api/admin/orders` | Qo'lda ariza (mijoz, mashina, bandlar, vaqt, manba, "tasdiqladi") |
| `POST /api/admin/orders/:id/call` | `confirmed`, `no_answer` yoki `rejected` (sabab) |
| `PUT /api/admin/orders/:id/items` | Bandlar va narxlar (`in_work` gacha) |
| `POST /api/admin/orders/:id/reschedule`, `.../cancel`, `.../no-show` | |
| `GET /api/admin/availability`, `GET /api/admin/slots` | Mijozniki bilan bir xil algoritm; xodimga eng yaqin bron qoidasi qo'llanmaydi (22-bo'lim) |
| `GET /api/admin/catalog`, `GET /api/admin/cancel-reasons` | Ariza yaratish va tahrirlash uchun zonalar, markalar va sabablar |
| `GET /api/admin/schedule?date`, `POST /api/admin/blocks`, `DELETE /api/admin/blocks/:id` | Jadval va bloklash |
| `GET, PUT /api/admin/orders/:id/act`, `PUT .../act/photos/:mediaId`, `POST .../act/send`, `POST .../act/confirm-verbal`, `POST /api/admin/orders/:id/start-work` | Qabul |
| `POST /api/admin/orders/:id/tasks`, `PATCH /api/admin/tasks/:id`, `POST .../accept`, `POST .../rework` | Vazifalar |
| `GET /api/admin/tasks?tab&orderId`, `GET /api/admin/tasks/:id`, `GET /api/admin/masters` | Tekshiruv sahifasi (A3), vazifa kartasi va ustalar ro'yxati (22-bo'lim) |
| `POST /api/admin/orders/:id/extra-items`, `POST .../extra-items/:itemId/decision` | Qo'shimcha ish |
| `PUT /api/admin/orders/:id/discount`, `POST /api/admin/orders/:id/checkout`, `PATCH /api/admin/payments/:id/method` | To'lov |
| `GET /api/admin/orders/:id/handover`, `PUT /api/admin/orders/:id/items/:itemId/price` | A8: topshirish ma'lumoti; ish boshlangach "kelishiladi" bandga narx (22-bo'lim) |
| `GET, POST /api/admin/clients`, `GET, PATCH .../:id`, `POST .../:id/cars`, `POST .../:id/anonymize` | Mijozlar |
| `GET, PUT /api/admin/settings` | Ustaxona va qoidalar |
| `GET, PUT /api/admin/work-hours`, `POST, DELETE /api/admin/holidays` | Ish vaqti |
| `GET, POST, PATCH /api/admin/boxes` | Bokslar va ularning xizmat turlari |
| `GET, POST, PATCH /api/admin/brands`, `POST, PATCH .../models` (modellar markaning ichida keladi) | Markalar va modellar |
| `GET /api/admin/cars/unmapped`, `POST .../map` | "Boshqa" model bilan qo'shilgan mashinalar (4-bosqichda, mijoz kartasi bilan birga) |
| `GET /api/admin/workshop` | Ustaxona nomi, manzili, telefoni: hamma panel roli o'qiydi |
| `GET, PUT /api/admin/prices/:serviceTypeId`, `POST, PATCH /api/admin/services` | Prays-matritsa va zonalar (`GET /api/admin/service-types` ro'yxat uchun) |
| `GET, POST, PATCH /api/admin/service-types`, `.../services`, `PUT /api/admin/prices/:serviceTypeId` | Xizmatlar va prays-matritsa |
| `GET, POST, PATCH /api/admin/staff`, `PUT .../:id/password` | Xodimlar |
| `GET /api/admin/audit?cursor` | Audit jurnali |

Ro'yxatlar `cursor` bilan sahifalanadi. Cheklovlar: hamma `/api` ga IP bo'yicha daqiqasiga 600 so'rov (2026-11-19 gacha 120 edi, 22-bo'lim)
(`@fastify/rate-limit`, oqimdan himoya). Kirishga biznes-qoida: bir odamga 15 daqiqada 10 ta noto'g'ri
parol, 2-qadam kodiga 5 urinish. TZ'dagi "Mini App mijoziga daqiqasiga 60" alohida qilinmadi (22-bo'lim).

---

## 14. Ekranlar

Ekranlar ro'yxati, PDF sahifalari, komponentlar va dizayndan farqlar `docs/DESIGN.md` ning 7- va
8-bo'limlarida. Har ekran bosqichi 18-bo'limda.

Har ekranda bo'lishi shart: skelet (300 ms dan keyin), bo'sh holat, xato holati, och va qorong'i mavzu
(Mini App), Telegram Desktop o'lchami, telefonda bir qo'l bilan ishlatish.

---

## 15. Xavfsizlik va shaxsiy ma'lumotlar

- HTTPS va HSTS nginx'da. Admin uchun CSP. Cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api`.
  Admin'ning o'zgartiruvchi so'rovlarida `Origin` tekshiriladi.
- `initData`: HMAC-SHA256, bot tokenidan olingan kalit bilan; 24 soatdan eski bo'lsa rad etiladi.
- Parol Argon2id bilan saqlanadi. Login va 2FA'da rate-limit bor. 2FA kodi 6 xonali, 5 daqiqa amal
  qiladi, 5 urinishgacha.
- Huquq har so'rovda tekshiriladi (8-bo'lim). Birovning yozuviga murojaat `404`.
- Foto fayllari ochiq emas: imzolangan URL 15 daqiqa amal qiladi, tur baytlar bo'yicha tekshiriladi,
  nom tasodifiy.
- Audit jurnali tahrirlanmaydi (trigger bilan).
- Logda telefon, ism, token, `initData`, parol va kod yozilmaydi (pino redact). Drizzle xatosida
  parametrlar yozilmaydi, faqat SQL va kod. nginx so'rov parametrlarini logga yozmaydi.
- **Shaxsiy ma'lumotlar (TZ 15.3):**
  - Birinchi kirishda rozilik versiyasi va sanasi bilan yoziladi.
  - O'chirish so'rovi egasiga boradi. Anonimlashtirish ism, telefon, `telegram_id` va mashina raqamini
    tozalaydi, ariza va to'lovlar saqlanadi.
  - Hosting O'zbekistonda tavsiya qilinadi (21-bo'lim).

---

## 16. Testlar

**Qoida: v1 da faqat biznes-qoidalar testlanadi** (foydalanuvchi qarori, 22-bo'lim). Biznes-qoida
faqat serverda yashaydi (2-bo'lim, 13-qoida), shuning uchun testlar ham faqat `apps/server/test` da.

| Daraja | Nima | Qanday |
|---|---|---|
| Sof qoidalar | `modules/*/domain`, `lib`: holat o'tishlari, slot va ish vaqti, narx va chegirma, eslatma, ushlab turish, shell, huquqlar matritsasi | Vitest, jadval ko'rinishidagi testlar (`it.each`), `now` parametr bilan |
| Use-case qoidalari | `modules/*/app`: bazada amalga oshadigan qoidalar — ikki marta bron yo'q, idempotentlik, egalik va rol, tranzaksiya (holat, tarix, outbox birga), avtomatik o'tishlar | Haqiqiy PostgreSQL (`TEST_DATABASE_URL`, nomi `_test` bilan tugaydi, har testdan oldin `TRUNCATE`), soxta `Clock` |
| Baza kafolatlari | `EXCLUDE`, `CHECK`, unique indekslar, audit trigger'i | Haqiqiy PostgreSQL, to'g'ridan-to'g'ri SQL |

**Yozilmaydi (v1):** HTTP route testlari, bot render testlari, frontend komponent va e2e testlari,
infratuzilma testlari (logger, config, outbox worker). Ularning o'rnini har bosqichning qo'lda
tekshiruv ro'yxati bosadi (18-bo'lim) va kontrakt tiplari kompilyatorda tekshiriladi.

**Qachon test qo'shiladi:**
- har yangi biznes-qoida bilan birga;
- biznes-qoidadagi har bir xato tuzatilganda, avval xatoni qayta hosil qiladigan test yoziladi.

Infratuzilma testlari v2 da yoki shu qatlamda real xato topilganda qo'shiladi.

Har bosqichda yashil bo'lishi shart:
`npm run typecheck && npm run lint && npm test && npm run build && npm run check:bundle`
(qisqasi `npm run check`).

---

## 17. Deploy

Docker yo'q, barbershop_bot bilan bir xil yondashuv:

- Node.js 24 alohida papkada, systemd unit, `MemoryMax`.
- nginx quyidagilarni beradi:
  - `/` — Mini App statikasi;
  - `/admin/` — admin statikasi;
  - `/api` va `/media` — API'ga proxy, `proxy_set_header Host $host` bilan (aks holda `Origin`
    tekshiruvi panelning har bir o'zgartiruvchi so'rovini rad etadi) va `X-Forwarded-For`;
  - gzip/brotli, `immutable` kesh, xavfsizlik sarlavhalari; so'rov parametrlari logga yozilmaydi.
- `deploy.sh` yangilashdan oldin zaxira oladi, migratsiya qiladi va qayta ishga tushiradi.
- `backup.sh`: har kuni `pg_dump` va `UPLOADS_DIR`. Kunlik nusxalar 30 kun, oylik 12 oy saqlanadi,
  boshqa joyga ham ko'chiriladi.
- `restore.sh` bitta tranzaksiyada tiklaydi va har chorakda sinab ko'riladi.
- Faqat bitta instance (long polling).

---

## 18. Bosqichlar

**Ish tartibi:**
- Har bosqich oxirida `npm run check` yashil bo'lishi va qo'lda tekshiruv o'tishi shart.
- Keyin `docs/reports/bosqich-N.md` yoziladi.
- Foydalanuvchi qabul qilmaguncha keyingi bosqichga o'tilmaydi.

| № | Bosqich | Holat | Hisobot |
|---|---|---|---|
| 0 | Poydevor | Qabul qilindi | [bosqich-0.md](reports/bosqich-0.md) |
| 1 | Kirish, rollar va rolga qarab ochilish | Qabul qilindi | [bosqich-1.md](reports/bosqich-1.md) |
| 2 | Ma'lumotnomalar va sozlamalar | Qabul qilindi | [bosqich-2.md](reports/bosqich-2.md) |
| 3 | Garaj va bron (mijoz) | Qabul qilindi | [bosqich-3.md](reports/bosqich-3.md) |
| 4 | Arizalarni boshqarish (admin) | Qabul qilindi | [bosqich-4.md](reports/bosqich-4.md) |
| 5 | Qabul va ustalar ishi | Qabul qilindi | [bosqich-5.md](reports/bosqich-5.md) |
| 6 | Topshirish va to'lov | Qabul qilindi | [bosqich-6.md](reports/bosqich-6.md) |
| 7 | Ishga tushirish | Kamchilik bilan: repo qismi tayyor, production server kutilmoqda | [bosqich-7.md](reports/bosqich-7.md) |

### Bosqich 0 — Poydevor

**Maqsad:** ishlaydigan skelet. Sifat tekshiruvlari yashil, server, bot va ikkala frontend ishga tushadi.

- **Repo:**
  - `git init`, npm workspaces;
  - `tsconfig.base.json`, ESLint (4.3-bo'lim chegaralari), Prettier, `.env.example`, `README.md`.
- **`packages/shared`:**
  - `routes`, `contract` mexanizmi (marshrutlar 1-bosqichdan), `vocabulary` (xato kodlari, shell'lar);
  - `format`: pul (`1 400 000 so‘m`), sana, `phone` (+998), `plate` (O'zbekiston formatlari);
  - `i18n`: tillar va tipli lug'at turi; `styles/tokens.css` (DESIGN 2–4, ikkala ilova uchun).
- **Server:**
  - `config.ts` (zod), `logger.ts` (pino, redact), `lib/time`, `lib/money`, `platform/errors`;
  - `db` (pool chegaralari, `ping`), migrator;
  - `http`: Fastify, `route.ts` (`registerRoute`, kontraktni ulash), xato plugin'i, `/health` (bazani tekshiradi);
  - `bot`: `/start`, menyu tugmasi, uz/ru matnlar, polling; graceful shutdown.
- **Baza:** `0000_init` — faqat `btree_gist`. Jadvallar o'zidan foydalanadigan bosqichda keladi (22-bo'lim).
- **Mini App:**
  - Vite, `telegram.ts` (mavzu Telegram'dan, ranglar tokenlardan), `api.ts` (tipli), `i18n`;
  - raqam shrifti, `check-bundle.mjs`, `client` / `master` / `staff` shell'lari alohida lazy chunk.
- **Admin:** Vite, React Router, `api.ts`, `i18n`, `layout` (Sidebar, Topbar, DESIGN 6), bo'limlar yo'nalishlari.
- **Test infratuzilmasi:** Vitest, `_test` baza himoyasi, migratsiyalar test bazasida, `TRUNCATE` helper.
- **Testlar (biznes-qoidalar):** `lib/money` (yaxlitlash), `lib/time` (Toshkent vaqti, kun chegarasi,
  qat'iy format), `format/phone` va `format/plate` (kiritish qoidalari).
- **Qo'lda:**
  - `npm run dev` bot va API'ni ishga tushiradi, test botda `/start` ishlaydi;
  - Mini App va admin dev serverda ochiladi, tokenlar och va qorong'i mavzuda ko'rinadi.
- **Qabul:** `npm run check` yashil, README'dagi o'rnatish yo'riqnomasi toza mashinada ishlaydi.

Rejadan 1-bosqichga o'tdi: outbox va uning worker'i, rejalashtiruvchi, `jobs/loop`, `Clock`,
`dev:init-data`, test factories va soxta `Clock`. 2-bosqichga: `settings` jadvali. 3-bosqichga:
`status_history`. Sabab: 22-bo'lim.

### Bosqich 1 — Kirish, rollar va rolga qarab ochilish

**Maqsad:** har kim o'z interfeysiga kiradi. Botdagi Mini App rolga mos qismni ochadi, xodim panelga
login, parol va (rahbar va egasi uchun) 2-qadam kodi bilan kiradi.

- **Baza:** `users`, `user_roles`, `sessions`, `login_challenges`, `login_failures`, `audit_log` va
  uning trigger'i.
- **Platforma:** `Clock`, aktyorlar va `requirePermission`, `npm run dev:init-data`, test factories va
  soxta `Clock`. `/start` handler'i `identity/bot` ga ko'chdi. Outbox, rejalashtiruvchi va `jobs`
  3-bosqichga o'tdi: 2-qadam kodi outbox'siz yuboriladi va 1-bosqichda ulardan foydalanadigan narsa yo'q
  (22-bo'lim).
- **`identity`:**
  - `initData` tekshiruvi, foydalanuvchini topish yoki yaratish, `bootstrap` va `shell` (4.7);
  - onboarding (til, ism, rozilik versiyasi), Telegram imzolagan raqamni tekshirish va bog'lash (7.2);
  - login yoki telefon va parol, Argon2id, 2-qadam kodi bot orqali, sessiya, logout, rate-limit;
  - huquqlar matritsasi (8-bo'lim), xodimlar: qo'shish, tahrirlash, rollar, parol, bloklash.
- **`audit`:** `record(tx, ...)`, jurnalni o'qish.
- **Skript:** `npm run owner:create -- --phone=... --login=... --name=...` (parolni so'raydi).
- **Mini App:** T0 (DESIGN 7.1), shell tanlash, `staff` ekrani, xato ekrani. T13 ning til qismi 3-bosqichda
  profil bilan (endpoint tayyor).
- **Admin:** A0 (login va 2FA), rolga qarab menyu, A13 (xodimlar), audit jurnali, til almashtirish.
- **Bot:** `/start` va `my_chat_member` (botga yozish ruxsati), 2-qadam kodi.
- **Testlar:**
  - `shell` jadvali: rollar → shell;
  - huquqlar matritsasi: har rol × har amal (8-bo'lim);
  - `initData` muddati va imzosi;
  - telefon bog'lash: admin yaratgan mijoz, egasi qo'shgan xodim (bog'langach `master` shell), boshqa
    `telegram_id` dagi raqam rad etiladi, tasdiqlanmagan raqam bog'lamaydi;
  - login: noto'g'ri parol, bloklangan xodim, 15 daqiqada 10 urinish;
  - 2FA: eskirgan, 5 urinish, bir marta ishlatish;
  - sessiya faolsizlikdan tugashi;
  - audit yozuvini o'zgartirib yoki o'chirib bo'lmaydi;
  - rahbar va egasi 2FA'siz kira olmaydi.
- **Qo'lda:**
  - Haqiqiy Telegram'da yangi foydalanuvchi T0 ni o'tadi va client shell'ga tushadi.
  - Egasi qo'shgan usta raqamini ulashganda usta shell'iga tushadi, admin `staff` ekranini ko'radi.
  - Egasi panelga 2FA bilan kiradi.

### Bosqich 2 — Ma'lumotnomalar va sozlamalar

**Maqsad:** egasi ustaxonani dasturchisiz sozlaydi. Bron uchun kerakli hamma ma'lumot bor.

- **Baza:** `settings`, `work_hours`, `holidays`, `boxes`, `box_service_types`, `car_brands`,
  `car_models`, `service_types`, `services`, `service_excludes`, `service_prices`, `cancel_reasons`.
- **`workshop`:** sozlamalar (ustaxona, qoidalar), ish vaqti, bayramlar, bokslar va ularning turlari,
  `working-time.ts` (10.1).
- **`catalog`:**
  - markalar va modellar, xizmat turlari va zonalar, `excludes`;
  - prays-matritsa: bitta xizmat turining hamma kataklari birga saqlanadi va audit qilinadi.
- **Seed:**
  - `npm run seed:reference` — TZ 14.1, 14.2, 14.4; bo'sh bazaga, idempotent, production'da ham;
  - `npm run seed:demo` — faqat dev: bokslar, ish vaqti, dizayndagi narxlar, demo xodimlar.
- **Admin (egasi):** A12 prays va me'yorlar; bokslar; ish jadvali va bayramlar; markalar va modellar;
  ustaxona ma'lumoti va qoidalar (DESIGN 8: materiallar va shablonlar yo'q).
- **Testlar:**
  - `working-time`: tanaffus, dam olish kuni, bayram, kun chegarasini kesib o'tish, `addWorkMinutes` bir
    necha kunga;
  - prays-matritsa qoidalari: 4 sinf, narx ≥ 0 yoki null, davomiylik > 0;
  - `excludes` faqat bir xil turda;
  - ish vaqti `CHECK` lari;
  - `seed:reference` ikki marta ishga tushsa ham bir xil natija;
  - faqat egasi yozadi;
  - prays o'zgarishi auditga tushadi.
- **Qo'lda:** egasi bo'sh bazadan boshlab hammasini paneldan to'ldiradi; jadvallar dizayndagidek ko'rinadi.

### Bosqich 3 — Garaj va bron (mijoz)

**Maqsad:** mijoz mashinasini qo'shadi va narxni ko'rib bron qiladi. Slot himoyalangan, adminlar xabar
oladi, ariza belgilangan muddatda javobsiz qolsa o'zi bekor bo'ladi.

- **Platforma (1-bosqichdan ko'chdi):** outbox va `jobs/outbox-worker`, rejalashtiruvchi va
  `jobs/scheduler`, `jobs/loop`. Bildirishnoma payload'i (nusxa yoki faqat id) shu yerda tanlanadi.
- **Baza:** `outbox`, `status_history`, `cars`, `orders` (+ `order_number_seq`), `order_items`, `order_calls`, `bookings` (+ `EXCLUDE`
  va indeks qo'lda yozilgan migratsiyada).
- **`garage`:** CRUD, raqam normallashtirish va mijoz ichida unique, arxivlash (faol arizasi bo'lsa rad),
  "Boshqa" model.
- **`booking`:** `daySlots`, `availability`, eng yaqin bo'sh vaqtlar (10.2–10.3), `reserve(tx)` (10.4).
- **`orders`:**
  - `quote` — narx, `excludes`, davomiylik;
  - TMA'dan yaratish: `requestId`, telefon va rozilik talab qilinadi, narx nusxasi, `hold_until`;
  - mijoz ro'yxati va kuzatuvi;
  - mijoz bekor qilishi (sabab bilan), ko'chirish so'rovi;
  - `expire-holds` vazifasi.
- **Xabarlar:** `order.created`, `order.cancelled` (tizim), `staff.order_new`, `staff.client_cancelled`,
  `staff.reschedule_requested`.
- **Mini App:**
  - T1, bo'sh garaj, T2, T3, T4 (bo'sh vaqt yo'q holati bilan), T5, T8, T9, T6 (asosiy qismi), T13 (qolgan qismi);
  - xato va oflayn holat, skelet;
  - qoralama CloudStorage'da.
- **Testlar:**
  - **slotlar** (jadval testlari): qadam, `minLead`, ufq, tanaffusni kesib o'tish, yopilishgacha
    ulgurmaslik, ko'p kunli ish dam olish kuni va bayramni o'tkazib yuborishi, boks turlari mos
    kelmasligi, bir necha boksdan birinchisini tanlash;
  - **narx:** `excludes`, "kelishiladi" bandi jamiga kirmaydi, sinf bo'yicha narx;
  - **ushlab turish:** ish vaqti bo'yicha `hold_until` (tungi bron), `hold_until ≥ starts_at` bo'lsa
    avto-bekor yo'q;
  - **baza:** bitta slotga 100 ta parallel so'rov → aynan 1 ta ariza; birinchi boks band bo'lsa
    ikkinchisiga yoziladi; bir xil `requestId` → bitta ariza; `released_at` bo'lgan bron vaqtni band
    qilmaydi; `[)` chegarasi;
  - **egalik va qoidalar:** prays o'zgarishi mavjud arizaga ta'sir qilmaydi; birovning arizasi
    `not_found`; faol arizali mashinani arxivlab bo'lmaydi; telefonsiz bron `phone_required`;
  - **avto-bekor:** `expire-holds` bekor qiladi, bronni bo'shatadi, outbox'ga bir marta yozadi.
- **Qo'lda:** Android va iOS'da "birinchi kirish → mashina → bron" yo'li yordamsiz o'tadi (TZ 16.4);
  och va qorong'i mavzu; Telegram Desktop.

### Bosqich 4 — Arizalarni boshqarish (admin)

**Maqsad:** admin har bir arizani tez tasdiqlaydi, qo'lda yaratadi, jadvalni boshqaradi. Mijoz tasdiq va
eslatmalarni oladi.

- **`orders`:**
  - qo'ng'iroq natijalari (9.1, 10.4), bandlar va narxlarni tahrirlash (bron qayta hisoblanadi, audit);
  - ko'chirish, admin bekor qilishi, "kelmadi";
  - qo'lda ariza (mijozni topish yoki yaratish, mashina, bandlar, vaqt, manba, "mijoz tasdiqladi");
  - `call-sla` va `reminders` vazifalari.
- **`booking`:** kunlik jadval, bloklash.
- **`garage` (3-bosqichdan ko'chdi):** admin uchun `GET /api/admin/cars/unmapped` va `POST .../map`
  ("Boshqa" modelni haqiqiy modelga bog'lash, kuzov sinfini to'g'rilash).
- **`clients`:** ro'yxat, filtrlar (hammasi, doimiy, 90 kundan beri kelmagan, Telegramsiz), karta,
  yaratish, ichki izoh, anonimlashtirish (egasi).
- **`dashboard`:** hisoblagichlar, bugungi kelishlar.
- **Xabarlar:** `order.confirmed`, `order.reminder`, `order.rescheduled`, `order.cancelled` (admin),
  `staff.order_unanswered`, `staff.deletion_requested`.
- **Admin:** A6 (kassasiz), A1 (taymer, 15 daqiqalik ogohlantirish, qo'ng'iroq tugmalari, qidiruv), ariza
  ichida, A7, A4 (kun, "hozir" chizig'i, bloklash), A10. Har 10 soniyada yangilanadi, yangi arizada ovoz.
- **Testlar:**
  - **holat mashinasi:** har holatdan har holatga, har rol bilan; ruxsat etilmaganlari `invalid_transition`;
  - **"Kelmadi":** slot boshlanmasdan rad etiladi;
  - **ko'chirish:** band vaqtga `slot_taken` va eski vaqt saqlanadi;
  - **bandlarni tahrirlash:** `in_work` dan keyin rad etiladi, ziddiyatda `slot_taken`;
  - **qo'ng'iroq:** "Javobsiz" `hold_until` ni uzaytiradi; "Rad etdi" sababsiz rad etiladi;
  - **qo'lda ariza:** "tasdiqladi" belgisi bilan darhol `confirmed`; Telegramsiz mijozga xabar
    yozilmaydi va xato chiqmaydi;
  - **SLA:** faqat ish vaqti hisoblanadi, bir marta;
  - **eslatmalar:** oyna ichida tasdiqlangan arizaga 24 soatlik eslatma ketmaydi; o'chirilgan eslatma,
    bekor qilingan ariza; ko'chirilgandan keyin yangi eslatma;
  - **huquq va anonimlashtirish:** rahbar yoza olmaydi; anonimlashtirish ariza va to'lovlarni saqlaydi;
  - **bloklash** bronga to'qnashsa `slot_taken`.
- **Qo'lda:** ariza TMA'dan kelgach panelda 10 soniya ichida ovoz bilan paydo bo'ladi; planshet
  o'lchami; Telegram'dagi xabarlar uz va ru tilida.

### Bosqich 5 — Qabul va ustalar ishi

**Maqsad:** mashina nuqsonlari va fotolari bilan qabul qilinadi. Usta vazifani bajaradi va oflayn
ishlaganda ham hisobot topshiradi. Hamma vazifa qabul qilinganda ariza o'zi "Topshirishga tayyor" bo'ladi.

- **Baza:** `reception_acts`, `reception_defects`, `tasks`, `task_reports`, `media`.
- **`media`:** `FileStore`, tur va hajm tekshiruvi, idempotent yuklash, imzolangan URL, kim nimani ko'ra
  olishi.
- **`reception`:** qoralama, nuqsonlar, fotolar, mijozga yuborish (`act.confirm_request`), mijoz yoki
  og'zaki tasdiq, "Ishga topshirish" → `in_work`.
- **`tasks`:**
  - vazifa yaratish (bandlarni guruhlash, usta, yordamchi, ko'rsatma) va boshqa ustaga berish;
  - usta oqimi: boshlash, foto, topshirish; tekshiruv: qabul qilish yoki qayta ishlash;
  - `orders.onTasksChanged` va bronni qisqartirish.
- **`orders`:** qo'shimcha ish bandi (9.3), mijoz yoki admin javobi.
- **Xabarlar:** `act.confirm_request`, `extra.approval_request`, `order.ready`, `staff.task_assigned`,
  `staff.task_rework`, `staff.report_submitted`, `staff.extra_decided`.
- **Mini App, usta:** U1, U2, U3 (DESIGN 8: materiallar va ovoz yo'q). Oflayn navbat (IndexedDB) ikki
  turdagi amalni saqlaydi: foto yuklash va topshirish. Ular tartib bilan, idempotent, qayta urinish bilan
  bajariladi.
- **Mini App, mijoz:** T6 to'liq (zonalar holati, dalolatnoma, qo'shimcha ish kartasi).
- **Admin:** A2 (planshet, `BodySchema`), A3, ariza ichida qo'shimcha ish.
- **Testlar:**
  - **holatlar:** vazifa holat mashinasi to'liq; dalolatnoma holatlari;
  - **dalolatnoma:** probeg, yoqilg'i va 4 tomon fotosisiz yuborib bo'lmaydi; tasdiqsiz `in_work` yo'q;
  - **usta va vazifa:** "keyin" fotosisiz topshirib bo'lmaydi; izohsiz qayta ishlashga qaytarib
    bo'lmaydi; boshqa ustaga berish faqat `assigned` va `in_progress` da; bitta band ikki vazifada
    bo'lmaydi;
  - **avtomatik tayyor:** oxirgi vazifa qabul qilinganda ariza `ready_for_pickup` bo'ladi, `pending`
    band bo'lsa — yo'q;
  - **bron:** qisqartirish qoidasi (9.1);
  - **qo'shimcha ish:** faqat ariza egasi javob bera oladi, ikkinchi javob o'tmaydi;
  - **huquq:** usta begona vazifani `not_found` sifatida ko'radi, javobda telefon va narx maydonlari yo'q;
  - **foto:** tur baytlardan (JPEG, PNG, WebP o'tadi, SVG va HTML yo'q), hajm chegarasi, bir xil
    `mediaId` takror yuklansa bitta yozuv qoladi.
- **Qo'lda:**
  - 10 ta foto bilan hisobot tarmoqsiz topshiriladi va tarmoq qaytgach yetib boradi (TZ 16.4);
  - qo'lqopda bosish qulay (56 px);
  - planshetda qabul to'liq o'tadi.

### Bosqich 6 — Topshirish va to'lov

**Maqsad:** mashina topshiriladi, to'lov va fiskal chek qayd etiladi, mijoz natijani ko'rib baho beradi.

- **`payments`:** topshirish ma'lumoti (bandlar, ustalar, jami), chegirma (11-bo'lim), checkout,
  to'lov usulini tuzatish (egasi), `ManualFiscalProvider`.
- **`orders`:** `completed`, baho.
- **`dashboard`:** bugungi kassa usullar bo'yicha va cheklar soni.
- **Xabarlar:** `order.completed` va undagi baho tugmalari.
- **Admin:** A8 (DESIGN 8), A6 ning kassa bloki.
- **Mini App:** T12, tarix.
- **Testlar:**
  - **chegirma:** foizni yaxlitlash, admin chegarasi aniq 5% da o'tadi va 5% dan oshganda rad etiladi,
    egasi chegarasiz, bandlar o'zgarganda qayta hisoblanadi;
  - **checkout shartlari:** summa mos kelmasa `payment_mismatch`, narxsiz band bo'lsa
    `unpriced_items`, chek raqamisiz rad, holat `ready_for_pickup` bo'lmasa `invalid_transition`;
  - **checkout bir martaligi:** bir xil `requestId` → bitta natija, ikkita parallel checkout → bittasi
    o'tadi;
  - **baho:** faqat `completed`, faqat egasi, bir marta;
  - **to'lovni tuzatish:** faqat egasi, auditga tushadi;
  - **kassa:** bugungi kassa to'lovlar yig'indisiga so'mgacha teng (TZ 16.4).
- **Qo'lda:** aralash to'lov planshetda; mijoz botda baho beradi va ilovada izoh yozadi.

### Bosqich 7 — Ishga tushirish

**Maqsad:** production'da ishlaydi, zaxiralanadi va tiklanadi, qabul ro'yxati o'tadi.

- **`deploy/`:** systemd unit, nginx namunasi, `deploy.sh`, `backup.sh`, `restore.sh`.
- **Hujjatlar:** `docs/DEPLOY.md`, `docs/EGA_UCHUN.md` (egasi va admin uchun qisqa yo'riqnoma).
- **Production:** alohida bot, `.env`, migratsiya, `seed:reference`, `owner:create`.
- **Xavfsizlik ko'rigi:**
  - rate-limit, cookie, `Origin`, imzolangan URL, log redact;
  - `npm audit`;
  - 8-bo'limdagi matritsa bo'yicha qo'lda tekshiruv.
- **Tezlik:** `check:bundle`; `autocannon` bilan `bootstrap`, `slots` va Kanban'ning p95 qiymati
  (3.2-bo'lim).
- **Qabul ro'yxati** (TZ 16.4 ning v1 ga tegishli bandlari, haqiqiy Telegram'da iOS, Android va Desktop'da):
  - butun yo'l: bron → tasdiq → qabul → vazifa → hisobot → qabul qilish → checkout → baho;
  - ikkala til;
  - zaxiradan tiklash sinovi.

---

## 19. v2: keyinga qoldirildi va qanday qo'shiladi

**Hozir qilinmaydi.** Bu ro'yxatdagi narsani v1 ga qo'shish uchun avval 20-bo'lim tartibi o'tadi.

| Funksiya | Qanday qo'shiladi |
|---|---|
| Do'kon va ombor | Yangi `shop` va `stock` modullari; `products`, `product_categories`, `stock_documents`, `stock_movements`, `suppliers`, `shop_orders`, `shop_order_items` jadvallari; o'z holat mashinasi (TZ 12.2). Xizmat arizalariga tegilmaydi. Mijozning "Buyurtmalarim" ro'yxati ikki jadvalni birlashtirib o'qiydi. Mini App'da `shells/client/shop` feature'i, admin'da `features/shop` va `features/stock` |
| Materiallar me'yori va sarfi | `material_norms`; `tasks` ga sarf yozuvi; ombor harakati `write_off_service` |
| Kassa API (fiskal) | `FiscalProvider` ning yangi implementatsiyasi; `fiscal_receipts.status` ga `pending` va `failed`; qayta urinish vazifasi |
| Imzo va PDF dalolatnomalar | `DocumentRenderer` porti; `reception_acts` va topshirishga `pdf_key` hamda imzo ustunlari; imzo rasmlari `media` da |
| Onlayn va oldindan to'lov, qaytarish | `PaymentProvider` porti, webhook route'i, `payments.method = online`, `refunds` jadvali |
| Ketma-ket bokslar | `bookings_one_active_per_order` indeksini olib tashlash; `booking/domain` da ketma-ket joylashtirish |
| Analitika R1–R4, Excel | `reports` moduli (faqat o'qish): `status_history`, `order_calls`, `payments`, `tasks` dan SQL; kerak bo'lsa tungi materializatsiya |
| Usta ko'rsatkichlari (U4) | `reports` ustiga bitta usta uchun endpoint |
| Ko'p filial | `branches` jadvali; operatsion jadvallarga `branch_id` (asosiy filial default qiymati bilan migratsiya); `user_roles.branch_id`; servislarda filial filtri. Narxi: barcha `app/` so'rovlari ko'rib chiqiladi |
| WebSocket yoki SSE | `src/http/realtime.ts`; app hodisasini outbox'ga o'xshash ichki kanal orqali yuborish; polling o'chiriladi |
| Usta PWA | `apps/tma` dagi master shell uchun alohida PWA kirish nuqtasi, telefon va PIN bilan kirish, web push |
| Xabar shablonlari | `notification_templates` jadvali; render avval bazadan qidiradi, topilmasa kod matni |
| Webhook bot | Faqat `bot/polling.ts` va `main.ts` |
| S3 / MinIO | `FileStore` ning yangi implementatsiyasi va presigned URL |
| Huquqlarni sozlash | `role_permissions` jadvali; `permissions.ts` standart qiymat bo'lib qoladi |
| Rolni almashtirish | `bootstrap` ga `availableShells`, profilda almashtirgich |
| Haftalik jadval, sudrab ko'chirish | `features/schedule` ga; server tomoni allaqachon bor (`reschedule`) |
| Monitoring | Sentry, Prometheus metrikalari |
| OpenAPI | zod sxemalaridan avtomatik yaratish |

---

## 20. Yangi funksiya qo'shish tartibi

Bizning tomondan yangi g'oya yoki o'zgarish paydo bo'lsa:

1. **Tasvirlash.** Shu hujjatga yoziladi: nima va nima uchun; qaysi rol; qaysi modul; qaysi jadvallar va
   maydonlar (yangi yoki o'zgargan); qaysi endpoint'lar; qaysi ekran (dizayni bormi yoki yo'qmi); qaysi
   biznes-qoidalar va ularning testlari; qaysi xabarlar.
2. **Moslik tekshiruvi.** 2-bo'limdagi qoidalarni buzmaydimi? Mavjud modul ichiga sig'adimi yoki yangi
   modul kerakmi (4.2–4.4)? v2 ro'yxatidagi narsaga yo'l yopilmaydimi?
3. **Joylash.** Joriy yoki keyingi bosqichga qo'shiladi (18-bo'lim) yoki 19-bo'limga yoziladi.
4. **Qaror.** 22-bo'limga sana, qaror va sabab yoziladi.
5. **Bajarish.** Qatlam bo'yicha: `domain` + testlar → `app` + testlar → `contract`/`routes` → `http` →
   UI → qo'lda tekshiruv → bosqich hisobotida qayd.

Yangi modul uchun chek-list:
- `modules/<nom>/{domain,app,http}`, `index.ts`;
- `db/schema/<nom>.ts`;
- `composition.ts` ga bir qator;
- `eslint.config.js` dagi modullar ro'yxati;
- 4.2-jadval.

---

## 21. Ochiq savollar

| № | Savol | Kimga | Javob kelguncha |
|---|---|---|---|
| 1 | Prays-matritsa narxlari va har zona uchun me'yoriy vaqt | Buyurtmachi | Dizayndagi namunalar (`seed:demo`) |
| 2 | Bokslar soni, ularning xizmatlari, ish vaqti va bayramlar | Buyurtmachi | Dizayndagi 4 boks, 09:00–20:00 |
| 3 | Kuzov sinflari (TZ 14.1) va qo'shilgan zonalar (14.2) tasdig'i; "BYD Champion" qaysi model | Buyurtmachi | TZ ro'yxati |
| 4 | Admin chegirma limiti | Buyurtmachi | 5% |
| 5 | Hosting: O'zbekistondagi provayder yoki ruxsat etilgan mamlakat | Buyurtmachi | 7-bosqichdan oldin hal qilinishi shart |
| 6 | Maxfiylik siyosati matni, URL va versiyasi; shaxsiy ma'lumotlar bazasini ro'yxatdan o'tkazish | Buyurtmachi, yurist | Vaqtinchalik matn, versiya `draft` |
| 7 | Onlayn-KKM yoki virtual kassa provayderi va IKPU kodlari | Buyurtmachi | v1 da qo'lda chek raqami |
| 8 | Ish vaqtidan tashqari kelgan ariza: ertalab ochilishdan qancha vaqt ichida qo'ng'iroq qilinadi | Buyurtmachi | 10.4 qoidasi |
| 9 | Raqam shrifti, qorong'i mavzu ranglari, kuzov sxemasi SVG'lari | Dizayner | DESIGN 9 |
| 10 | Davlat raqami: 14 ta hudud kodi to'g'rimi; xorijiy, tranzit, davlat va diplomatik raqamlar qabul qilinishi kerakmi | Buyurtmachi | Faqat shaxsiy va yuridik format (`packages/shared/src/format/plate.ts`) |

---

## 22. Qarorlar jurnali

Yangilari tepada.

| Sana | Qaror | Sabab |
|---|---|---|
| 2026-11-20 | Brauzer yorlig'ida belgi (favicon): menyudagi logotip (to'q kvadratda qalqon), `public/favicon.svg` panelda ham, Mini App'da ham. Tor ekrandagi kirish sahifasida logotip forma tepasida, tillar bilan bir qatorda | Foydalanuvchi: brauzerda logo ko'rinmaydi. Avval `data:,` (bo'sh belgi) edi; telefonda logotipli brend paneli yashirilgan edi |
| 2026-11-20 | Telegram ichida "orqaga" (telefonning tizim tugmasi ham) ilovani yopmaydi, oldingi joyga qaytaradi: Telegram'ning BackButton'i qaytadigan joy bo'lgan har ekranda ko'rsatiladi. Mini App: mijozda "Bosh" dan boshqa bo'lim → "Bosh", ustada profil → vazifalar, boshqa tab → "Bugun". Panel (`layout/TelegramBack.tsx`, `lib/telegram.ts`): ochiq menyu → yopiladi, aks holda oldingi sahifa, bot havolasidan ochilgan sahifa → "Bugun". Ilova faqat "Bosh" / "Bugun" da yopiladi | Foydalanuvchi: telefonda "orqaga" bosilganda ilova yopilib qolardi. Telegram tizim tugmasini sahifaga faqat BackButton ko'rinib turganda beradi, aks holda oynani yopadi; sahifaning o'z tarixiga qaramaydi |
| 2026-11-20 | Qidiruvda davlat raqami saqlashdagidek o'qiladi: kirillcha o'xshash harflar lotinga, bo'shliq va tire olib tashlanadi (`compactPlate`, `@cs/shared/format`; arizalar va mijozlar qidiruvi). Panel chegirmani server qoidasi bilan tekshiradi (foiz 0–100, verguldan keyin ≤ 2 raqam; summa butun so'm) va noto'g'ri qiymatda sababini ko'rsatadi | Tekshiruvda topildi: "01-123-АВС" (rus klaviaturasi) saqlashda qabul qilinardi, qidiruvda topilmasdi; "12,345 %" panelda qabul qilinib, serverda umumiy xato bilan rad etilardi |
| 2026-11-20 | Admin panel telefon va planshetga moslashadi: `body` dagi `min-width: 1024px` olib tashlandi; ≤ 900 px da menyu chap tomondan chiqadigan panel (☰; mavzu, til va foydalanuvchi ham shu yerda, yuqori panel bitta qator), sahifa setkalari bitta ustunga tushadi, keng jadval, kun jadvali va narx matritsasi o'z qutisi ichida yonga suriladi, tugmalar ≥ 44 px. Funksiya va huquqlar o'zgarmaydi | Foydalanuvchi so'rovi: panel brauzerning mobil versiyasida va Telegram ichida ham ishlashi kerak. 390 va 768 px da 20 sahifa o'lchandi: hech biri sahifani yonga surmaydi |
| 2026-11-20 | Panel Telegram ichida ham ochiladi: botning "Panelda ochish" tugmasi `url` emas, `web_app` (arizaning o'z sahifasi); Mini App'dagi xodim qismi "Panelni ochish" ni Telegram ilovasida shu oynada ochadi, Telegram Web'da yangi oynada. Kirish brauzerdagidek (login, parol, 2FA). Panel Telegram bilan faqat `apps/admin/src/lib/telegram.ts` orqali gaplashadi (`ready`, `expand`, ranglar, pastga surib yopishni o'chirish). Boshqa sayt ramkasi ichida (Telegram Web) panel faqat "Yangi oynada ochish" havolasini ko'rsatadi; panelning `frame-ancestors 'none'` himoyasi o'zgartirilmadi | Foydalanuvchi tanlovi: kirish brauzerdagidek, Telegram Web'da yangi oynada, bot tugmasi Telegram ichida. Ramka ichida sessiya cookie'si (`SameSite=Strict`) yuborilmaydi, shuning uchun u yerda kirib bo'lmaydi |
| 2026-11-20 | Birinchi production deploy `autoservice.shaxriyorbek.uz` ga, RAM ko'tarilmagan (1 GB) umumiy serverga: build kompyuterda, serverda faqat `npm ci --omit=dev --workspace=@cs/server`, migratsiya va `seed:reference` SSH tunnel orqali; `qanchaga` xizmatlari egasi roziligi bilan to'xtatildi va o'chirildi; Caddy blokida `/assets/*` uchun SPA zaxirasi yo'q (yo'q fayl 404). Bu serverda `deploy.sh` ishlatilmaydi (DEPLOY.md, "Hozirgi production") | Foydalanuvchi: RAM'ni ko'tarib bo'lmaydi. Serverda build boshqa saytlarni bo'g'ardi; qanchaga ~112 MB bo'shatdi, backend ≈ 85 MB oladi. Yo'q asset `index.html` ni bir yillik `immutable` kesh bilan qaytarardi (tekshiruvda topildi) |
| 2026-11-20 | Production hozirgi botdan (`.env` dagi token) foydalanadi; alohida production bot ochilmaydi, shu token bilan lokal `npm run dev` ishga tushirilmaydi (2026-11-20 dagi "production'ning o'z boti" qarorini almashtiradi) | Foydalanuvchi qarori: loyiha lokal ishlatilmaydi. Bitta tokenda faqat bitta nusxa polling qila oladi (409) |
| 2026-11-20 | Production `autoservice.shaxriyorbek.uz` da, mavjud umumiy serverda (Eskiz, Ubuntu 22.04, foydalanuvchi RAM'ni 2 GB ga ko'taradi): Caddy (nginx emas, `deploy/Caddyfile.example`), mavjud PostgreSQL 14, backend `127.0.0.1:3300`, Node 24 `/opt/node-24` da. Backend heap 256 MB, `MemoryMax=512M`, build `nice` bilan. PostgreSQL talabi 16+ dan 14+ ga tushirildi | Serverda boshqa production loyihalar va Caddy allaqachon ishlaydi; ularga tegmaslik kerak. Butun test to'plami (1264) PostgreSQL 14 da o'tdi. 1 GB RAM'da (104 MB bo'sh) qo'yish boshqa loyihalarni OOM xavfiga qo'yardi |
| 2026-11-20 | Fotolar zaxirasi arxiv emas, papka: har kecha oldingi nusxaga qattiq havola (`cp -al`) va faqat yangi fotolar ko'chiriladi (`cp -au`); eski nusxalar nomdagi sana bo'yicha o'chiriladi; tashqi nusxa `rsync -aH` | Avvalgi `backup.sh` har kecha butun fotolar papkasini arxivlab, 30 kunlik nusxa bilan diskni fotolar hajmining 30 baravari bilan to'ldirardi (o'z-o'zini tekshiruvda topildi). `rsync` serverda yo'q, `cp -n` coreutils 8 va 9 da turlicha: Docker (9.7) va serverda (8.32) sinaldi |
| 2026-11-20 | Alohida test server yo'q: production'ga to'g'ridan-to'g'ri o'rnatiladi. Qabul ro'yxati production'da yopiq holda (faqat jamoa akkauntlari bilan) o'tkaziladi, keyin sinov ma'lumotlari tozalanib bot mijozlarga ochiladi. Production'ning o'z boti bo'ladi; hozirgi bot lokal ishlab chiqish uchun qoladi | Foydalanuvchi qarori: bitta ustaxona uchun ikkinchi server ortiqcha. Bitta tokenda faqat bitta nusxa ishlay oladi (long polling, 409); har yangilanishdan oldin `deploy.sh` zaxira oladi |
| 2026-11-19 | Panelda bir bosishda qaytarib bo'lmaydigan to'rt amal tasdiqlash oynasi bilan (`ui/ConfirmDialog.tsx`): "kelishiladi" bandga narx (bir marta qo'yiladi), qo'shimcha ishga telefon orqali javob, to'lov usulini tuzatish, dalolatnomani og'zaki tasdiqlash; chiqish ham shu oyna bilan. Kun bo'yi ishlatiladigan asosiy oqim tugmalari (qo'ng'iroq natijasi, "Ishga topshirish", "Hisobotni qabul qilish") va Mini App'dagi bir bosishli javoblar o'zgarmadi | Foydalanuvchi so'rovi ("shunga o'xshagan buglar"): adashib bosish yoki xato yozilgan narxni tuzatib bo'lmasdi. Asosiy tugmalar dizayn bo'yicha bir bosishda (A1, A2, A3, T6) |
| 2026-11-19 | Paneldan chiqish tasdiqlash oynasi bilan; mahalliy holat faqat server sessiyani yopgandan keyin tozalanadi (avval `me` = null, keyin boshqa keshlar). `/admin` (oxirida `/` siz) `/admin/` ga 301 bilan yo'naltiriladi: dev'da Vite plagini, production'da nginx | Foydalanuvchi topgan xatolar: "Chiqish" panelni yopmasdi (butun keshni tozalash panel kuzatayotgan `me` so'rovini ham olib tashlardi), "Bugun" havolasi `/admin` ga olib borib, yangilanganda Vite xatosini ko'rsatardi |
| 2026-11-19 | Mavzu almashtirgichi (foydalanuvchi so'rovi, 20-bo'lim tartibi bilan): Mini App'da mijoz va usta profilida, panelda Topbar'da; "Avto / Och / Qorong'i", boshlang'ich "Avto". Mini App: tanlov Telegram CloudStorage'da (qurilmalar orasida) va birinchi chizish uchun localStorage nusxasida; "Avto" Telegram mavzusiga ergashadi. Panel: localStorage, "Avto" kompyuter mavzusiga. Server o'zgarmaydi, test yo'q (UI sozlamasi, biznes-qoida emas, 16-bo'lim) | Foydalanuvchi so'rovi. Rollar: hamma (mijoz, usta, panel xodimlari). Modul: yo'q (faqat `apps/tma/src/{telegram.ts,ui/ThemeSwitch.tsx}`, `apps/admin/src/{lib/theme.ts,layout/Topbar.tsx}`). Ranglar mavjud tokenlardan; tekshiruvda `*-soft` fonida `--text` bilan yozilgan 4 joy (jadval kartalari, "Bugun"dagi hisobot) qorong'ida o'qilmasligi topildi va juft rangga o'tkazildi |
| 2026-11-19 | Panelda mijoz kartasida Telegram ID ko'rsatiladi (`clientCard.telegramId`; anonimlashtirilganda `null`). Ustalar mijozlar ro'yxatiga qo'shilmaydi: ular Sozlamalar → Xodimlar va rollar bo'limida (rol va "Telegram ulangan" belgisi bilan) | Foydalanuvchi so'rovi; ro'yxatni xodimlar bilan aralashtirish ariza yaratishdagi mijoz tanlovini chalkashtirardi (foydalanuvchi "hozirgidek" ni tanladi). Anonimlashtirish testi kengaytirildi |
| 2026-11-19 | API cheklovi IP bo'yicha daqiqasiga 120 dan 600 ga ko'tarildi (foydalanuvchi qarori) | Ustaxonada hamma (panel oynalari, Wi-Fi'dagi ustalar telefonlari) bitta IP'dan chiqadi va ekranlar har 10–20 soniyada yangilanadi: 120 ga yaqinlashib, xodimlar 429 olishi mumkin edi. Oqimdan himoya qoladi; kirish va 2-qadam kodi o'z biznes-qoidasi bilan cheklangan |
| 2026-11-19 | `/media` va `/health` ham IP bo'yicha cheklanadi: ular rate-limit plugini yuklangandan keyin ro'yxatdan o'tadi. Fotolarning o'z hisoblagichi bor (daqiqasiga 600), API'niki bilan bo'linmaydi | Xavfsizlik ko'rigida topildi: root'ga darhol qo'shilgan route plugin hook'iga tushmagan, ya'ni cheklovsiz edi. Ustaxonada hamma bitta IP'dan chiqadi va bitta ekran o'nlab foto ochadi: fotolar API hisobini yemasin |
| 2026-11-19 | Foto havolasining tugash vaqti 5 daqiqalik qadamga pastga yaxlitlanadi: havola 10–15 daqiqa amal qiladi va 5 daqiqa davomida bir xil bo'ladi | Har 10 soniyada yangilanadigan ekranlar (A8, ariza, dalolatnoma) har safar yangi havola olib, fotolarni qayta yuklardi; brauzer keshi (`max-age=600`) ishlamasdi. 15 daqiqadan uzoq amal qilmaydi (TZ 15.2) |
| 2026-11-19 | `lib/time` dagi Toshkent mintaqasi siljishni chorak soatlik bo'lak bo'yicha eslab qoladi (`RememberingZone`, luxon `IANAZone` ustida) | Yuklama o'lchovida Kanban so'rovi vaqtining ~70% i luxon'ning `Intl` orqali siljish hisobiga ketgan. Siljish tzdata'dan olinaveradi; real mintaqalarda u faqat UTC chorak soatlarida o'zgaradi |
| 2026-11-19 | Tezlik `autocannon` emas, o'z skripti bilan o'lchandi (har so'rov boshqa `X-Forwarded-For` bilan) | Bitta manzildan daqiqasiga 120 so'rov cheklovi `autocannon` o'lchovini 429 hisobiga aylantirardi; skript 10 va 1 parallel so'rovda p50/p95/p99 beradi |
| 2026-11-19 | Production yo'llari: kod `/opt/car-service`, Node 24 `/opt/node-24`, sozlama `/etc/car-service.env`, fotolar `/var/lib/car-service/uploads`, zaxira `/var/backups/car-service/{daily,monthly}`; zaxira kunlik 30 kun, oylik (oyning birinchisi, qattiq havola) ~1 yil, `BACKUP_REMOTE` bo'lsa `rsync` | PLAN 17. Fotolarni nginx emas, API beradi (imzolangan havola), shuning uchun papka faqat `carservice` ga ochiq (`0750`) |
| 2026-11-18 | Chegirma `orders` modulida (`orders/domain/discount.ts`, `admin.setDiscount`), `payments` da emas | Chegirma ustunlari `orders` jadvalida, unga faqat `orders` yozadi (4.4); bandlar o'zgarganda qayta hisob ham `orders` da. `payments` faqat checkout, to'lovlar va chek |
| 2026-11-18 | Bandlar o'zgarganda (bandlarni tahrirlash, qo'shimcha ishga rozilik, narx qo'yish) `subtotal` bandlardan qayta yig'iladi, chegirma foiz bo'lsa foizdan, summa bo'lsa `min(summa, subtotal)`; admin limiti qayta tekshirilmaydi | 11-bo'lim formulasi. Avval qo'shimcha ishga rozilikda foizli chegirma o'smasdi (topildi, test bilan) |
| 2026-11-18 | Ish boshlangach (`in_work`, `ready_for_pickup`) narxi yo'q bandga bir marta narx qo'yiladi (`PUT .../items/:itemId/price`, `orders.write`, audit); narxi bor band o'zgarmaydi | "Boshqa" zona doim "kelishiladi", bandlarni tahrirlash esa `in_work` gacha: usiz bunday ariza hech qachon checkout'dan o'tmasdi (`unpriced_items`) |
| 2026-11-18 | Checkout: avval arizani qulflaydi, keyin `requestId` bo'yicha chekni qidiradi (bor bo'lsa o'sha natija, boshqa arizaniki bo'lsa `validation`); to'lov qatorlarida bitta usul bir marta, summa > 0; jami 0 bo'lsa to'lovsiz o'tadi | Ikki parallel checkout'dan bittasi o'tadi, bir xil `requestId` bitta natija (testlar bilan). 100% chegirmali ariza ham yopiladi |
| 2026-11-18 | Baho: yulduz (1–5) bir marta; botda faqat yulduz, izoh keyin ilovada o'sha yulduz bilan bir marta qo'shiladi; boshqa har qanday ikkinchi javob `already_decided` | 18-bo'lim: "mijoz botda baho beradi va ilovada izoh yozadi"; bahoni o'zgartirib bo'lmaydi |
| 2026-11-18 | `order.completed` dagi 5 ta baho tugmasi bitta qatorda (`rate:<n>:<orderId>`) | Beshta qator xabarni juda uzaytiradi; `RenderedMessage.actionsInRow` |
| 2026-11-18 | "Bugun" (`admin.today`) `dashboard` modulida: `orders.today` + tekshiruvdagi hisobotlar (`tasks.review` huquqi bo'lsa) + bugungi kassa (`checkout.write` bo'lsa, aks holda `null`) | 13-bo'lim; rahbar kassani ko'rmaydi (pul bilan ishlamaydi; foydalanuvchi 2026-11-19 da tasdiqladi). Kassa to'lov vaqti (`received_at`) bo'yicha Toshkent kunida |
| 2026-11-18 | Qo'shimcha ish kartasidagi "yangi jami" serverdan (`items[].totalIfApproved`, chegirma bilan) | Ilova avval `total + narx` ni o'zi hisoblardi, chegirmali arizada noto'g'ri edi (2-bo'lim, 13-qoida) |
| 2026-11-18 | Fiskal chek `FiscalProvider` porti (`payments/app/fiscal.ts`), v1 `manual`: admin chek raqamini yozadi (1–64 belgi, bo'shliqlar kesiladi) | 11-bo'lim; v2 kassa API shu portni amalga oshiradi |
| 2026-11-18 | Foto xom baytlar bilan `PUT` qilinadi (`application/octet-stream`), `mediaId` klientda yaratiladi; tur (JPEG, PNG, WebP) va o'lcham baytlardan aniqlanadi, ≤ 3 MB, bitta urinishda ≤ 20 ta. Telefon rasmni ≈ 2 Mp gacha kichraytiradi | Multipart kutubxonasi kerak emas; takror yuborish bitta yozuv qoldiradi (TZ 16.4). Tur klient aytganidan emas, baytlardan olinadi (15-bo'lim) |
| 2026-11-18 | Foto `UPLOADS_DIR` ga `FileStore` porti orqali yoziladi, nomi tasodifiy UUID; ko'rish `/media/:id?exp&sig` (HMAC, 15 daqiqa), kalit `MEDIA_URL_SECRET` (production'da majburiy) | 4.9 va 15-bo'lim; keyin S3 ga o'tish bitta adapter almashtirish. Havola vaqtinchalik, shuning uchun jurnalga tushsa ham tez eskiradi |
| 2026-11-18 | Usta ro'yxati va kartasida narx, mijoz ismi va telefon yo'q; hamma so'rov `master_id = actor.userId` bilan SQL'da filtrlanadi, begona vazifa `404`. Yordamchi faqat ma'lumot uchun (vazifani ko'rmaydi) | 2-bo'lim, 13-qoida; 18-bo'limdagi huquq testi. Yordamchiga alohida ekran PLAN'da yo'q |
| 2026-11-18 | Hisobot topshirishdan oldin kamida bitta "keyin" foto kerak; qayta ishlashga izoh bilan qaytariladi; urinish raqami = `reworkCount + 1`, fotolar urinish bo'yicha ajratiladi | 9.2 va 18-bo'lim testlari; admin eski urinishlarni ham ko'ra oladi |
| 2026-11-18 | Vazifa vaqtini server sanaydi (`elapsedSec`), telefondagi sekundomer faqat uni sanab turadi va har yangilanishda serverdan qayta o'rnatiladi | Klient vaqtni hisoblamaydi (CLAUDE.md); telefon soati noto'g'ri bo'lsa ham usta ko'rgan vaqt admin ko'rganiga teng |
| 2026-11-18 | Oflayn navbat (IndexedDB) tartib bilan ishlaydi: foto, keyin topshirish. Vaqtinchalik xato (tarmoq, 5xx, 429, 401) kutish bilan qayta uriniladi; doimiy xato (vazifa o'zgargan, foto emas) navbatdan olinib ustaga ko'rsatiladi | Foto yetib bormasdan topshirish "keyin foto kerak" bilan rad etilardi; doimiy xato navbatni abadiy to'sib qo'ymasin. Navbat kodi `lib/photo-queue/` va `ui/` da, chunki shell'lar bir-birini import qilmaydi |
| 2026-11-18 | Dalolatnoma: yuborish uchun probeg, yoqilg'i va 4 tomon foto majburiy; tahrirlansa `sent` → `draft`; og'zaki tasdiq faqat to'liq to'ldirilgan `draft` yoki `sent` dan; mijoz tasdig'i idempotent (takror bosish xato emas) | 9.4; mijoz botda ham, ilovada ham bosadi, ikkinchi bosish xatoga aylanmasin |
| 2026-11-18 | "Ishga topshirish" (`in_work`) faqat tasdiqlangan dalolatnomadan keyin | 18-bo'lim testi: tasdiqsiz `in_work` yo'q |
| 2026-11-18 | Qo'shimcha ish bandi (`kind = extra`): `pending` → `approved` yoki `rejected`, faqat bir marta; ikkinchi javob `already_decided`. Tasdiqlangunga qadar jami summaga ham, vazifaga ham kirmaydi (bandlar faqat `not_required` yoki `approved` bo'lsa biriktiriladi); rad etilgani arizada ko'rinib qoladi | 9.3; mijoz botda ham, ilovada ham bosishi mumkin, ikki javob to'qnashmasin. Narx va nom bandga nusxalanadi (2-bo'lim) |
| 2026-11-18 | Ariza `ready_for_pickup` ga o'zi o'tadi: tasdiqlangan hamma zona qabul qilingan vazifalarda va kutilayotgan qo'shimcha ish yo'q bo'lganda; bron qisqartiriladi yoki bo'shatiladi | 9.1; admin qo'lda "tayyor" bosmaydi. Hisob `orders.onTasksChanged` da, `tasks` uni ichki (`tx` oladigan) metod bilan chaqiradi |
| 2026-11-18 | `tasks`, `reception` va `media` `orders` dan past: ular `orders.itemsForTask`, `attachItems`, `startWorkInside` ni chaqiradi (hammasi `tx` oladi), `orders` ularni import qilmaydi | 4.4: bog'liqlik grafi tsiklsiz; hamma yozuv bitta tranzaksiyada |
| 2026-11-18 | `Outbox.tell`: kimgadir tayyor matn bilan xabar (til va nusxa saqlanadi); `staff.*` adminlar va egasiga, `staff.extra_decided` va `staff.report_submitted` ham | Xabar turi har safar yangi `recipient` qidiruvini talab qilmasin; 4.8-bo'lim |
| 2026-11-18 | Botdagi tugmalar: `act:ok:<orderId>` va `extra:yes|no:<itemId>`. Egalikni server `tma.clientByTelegramId` orqali tekshiradi, xato kodlari (`already_decided`, `forbidden` …) bot matnlariga o'giriladi | Callback'dagi id'ga ishonilmaydi (CLAUDE.md, xavfsizlik) |
| 2026-11-18 | Admin vazifa marshrutlari `tasks.review` huquqi bilan; rahbar ko'radi, yoza olmaydi (`actions` hammasi `false`) | 8-bo'lim; 4-bosqichdagi qoida shu yerga ham |
| 2026-11-18 | `GET /api/admin/tasks`, `GET /api/admin/tasks/:id`, `GET /api/admin/masters` va `GET /api/client/orders/:id/act` qo'shildi (13-bo'lim) | A3 ro'yxati, vazifa kartasi, usta tanlash va mijozning dalolatnomasi ularsiz ishlamaydi; reja marshrutlarni sanab o'tmagan edi |
| 2026-11-18 | Foto o'chirish tugmasi ustada 56 px bosiladigan maydon, ko'rinadigan doira 28 px; tasdiq so'ralmaydi | Dizayn: usta ≥ 56 px, qo'lqopda. Tasdiq oynasi "kam matn kiritish" qoidasiga zid; topshirishdan oldin foto o'chirilib, qayta olinishi mumkin. Tasodifiy bosish xavfi bor: qo'lda tekshiruvda qurilmada ko'rilmadi |
| 2026-11-18 | Tranzaksiya (yoki unga berilgan ulanish) ichidagi so'rovlar `Promise.all` bilan emas, ketma-ket bajariladi | Bitta ulanishga parallel so'rov `pg` 8 da ogohlantirish beradi va `pg` 9 da xato bo'ladi; testda topildi |
| 2026-11-18 | Xodimlarga xabar (`staff.*`) adminlar va egasiga boradi (`platform/ports.ts` dagi `StaffDirectory`, uni `identity` beradi); rahbarga faqat `staff.order_unanswered` (4-bosqich) | Rahbar faqat o'qiydi: har yangi arizada uni bezovta qilmaslik. `orders` `identity` ga bog'lanmaydi |
| 2026-11-18 | `client.*` guruhi: faqat `client` qismidagi foydalanuvchi (rolsiz yoki bloklangan xodim) va rozilik bergan odam; telefon tasdig'ini katalogdan boshqa har use-case o'zi tekshiradi (`phone_required`) | 4.7 va 13-bo'lim: telefonsiz katalogni ko'rish mumkin, garaj va bron telefon so'raydi |
| 2026-11-18 | Mijoz faqat `applies_to = client` sabablarni beradi; "Boshqa" sabab matn talab qiladi; bekor qilish `WHERE status = <tekshirilgan>` bilan | Xodim sabablari (`cannot_perform`, `no_show`) va tizim sababi mijozga ochiq emas; bir vaqtdagi o'zgarish bekor bo'lib ketmasin |
| 2026-11-18 | Mijoz ko'chirishni bir marta so'raydi (`reschedule_requested_at`); `canCancel` va `canRequestReschedule` serverdan keladi | 2-bo'lim, 13-qoida: klient qaror qilmaydi, faqat ko'rsatadi |
| 2026-11-18 | Zonalar bir-birini chiqarib tashlasa (`To'liq kuzov` + `Kapot`), server so'rovni `service_unavailable` bilan rad etadi, jimgina olib tashlamaydi | Mijoz ikki marta to'lamasin; ilova `excludes` ro'yxati bo'yicha tanlovni o'zi tuzatadi, yakuniy tekshiruv serverda (4.10) |
| 2026-11-18 | Bron ufqi: bugundan boshlab `horizonDays` ta kun (30 ta); `slotStepMin` qadami ochilishdan boshlanadi, tanaffusdagi vaqt berilmaydi; ish yopilishdan oshsa vaqt berilmaydi; bir kundan uzun ish faqat ochilish vaqtida boshlanadi | 10.2–10.3 ni aniq qilish; testlar bilan (`booking/domain/slots.ts`) |
| 2026-11-18 | Yaratishda ariza avval yoziladi, boks oxirida band qilinadi; hamma boks band bo'lsa tranzaksiya qaytadi (`slot_taken`) va ariza qolmaydi. Bir xil `requestId` parallel kelsa ikkinchisi birinchi arizani qaytaradi | 10.4 va 2-bo'lim, 12-qoida; 100 parallel so'rov testi bilan tasdiqlandi |
| 2026-11-18 | Outbox qatori `recipient_id` va `payload` (til va xabar nusxasi) saqlaydi; holatlari `pending`, `sent`, `skipped` (Telegramsiz yoki aloqasiz odam), `dead` (8 urinishdan keyin); worker har 2 soniyada, rejalashtiruvchi har daqiqada | 4.8-bo'lim; Telegramsiz mijozga yozilmaydi va xato chiqmaydi |
| 2026-11-18 | Bron qoralamasi Telegram CloudStorage'da (zonalar va mashina), ariza yuborilganda o'chadi; brauzerda faqat dev'da `localStorage` | 1.3-bo'lim: serverda qoralama kodi kerak emas |
| 2026-11-18 | Panelda ustaxona sozlamalarining hamma yozuvi auditga tushadi (sozlamalar, ish vaqti, bayramlar, bokslar, markalar, modellar, ish turlari, zonalar, prays); o'zgarmagan saqlash yozilmaydi. Prays auditida faqat o'zgargan kataklar, zona nomi bilan | Jurnal o'qiladigan bo'lsin: butun matritsa har safar yozilsa, kerakli o'zgarish ko'rinmay qoladi |
| 2026-11-18 | Siyosat va xarita havolalari faqat `https://` | Havola Mini App'da `href` bo'ladi: `javascript:` kabi manzillar o'tmasin |
| 2026-11-18 | Me'yoriy vaqt daqiqada kiritiladi, soat va daqiqada ko'rsatiladi ("1 s 21 d"); dizayndagi "3 ish kuni" ko'rinishi yo'q | Ish kuni uzunligi ish vaqtiga bog'liq va 3-bosqichda hisoblanadi; ko'rsatish uchun ikkinchi manba kerak emas |
| 2026-11-18 | `seed:reference` har guruhni (markalar, ish turlari va zonalar, bekor qilish sabablari) faqat bo'sh jadvalga yozadi; ikki parallel ishga tushirish advisory lock bilan navbatlashadi. Yangi ma'lumotnoma qatori keyingi bosqichda kerak bo'lsa, migratsiya bilan qo'shiladi | Egasi nomini o'zgartirgan yoki yashirgan yozuv qayta paydo bo'lmasin, takrorlanmasin |
| 2026-11-18 | `cancel_reasons.applies_to` bitta qiymat: `client` — mijoz ham, xodim ham, `staff` — faqat xodim, `system` — faqat tizim | Ro'yxatni ikkilantirmaslik; TZ 14.4 dagi to'qqiz sabab shu bilan sig'adi |
| 2026-11-18 | Prays katagi yo'q bo'lsa, zona shu kuzov sinfiga taklif qilinmaydi; "Boshqa" zonaning narxi doim kelishiladi (`null`) | Yarim to'ldirilgan matritsa bilan ham slot va narx hisoblash aniq qoladi |
| 2026-11-18 | `identity` `workshop` ga bog'liq: rozilik versiyasi va `bootstrap` dagi ustaxona ma'lumoti sozlamalardan keladi (T0 dagi siyosat havolaga aylanadi) | 1-bosqich hisoboti va 4.7-bo'lim shuni kutgan; bog'liqlik grafi tsiklsiz qoladi |
| 2026-11-18 | `GET /api/admin/cars/unmapped` va `POST .../map` 4-bosqichga ko'chdi (2-bosqichdan 3-ga, undan 4-ga) | `cars` jadvali 3-bosqichda keldi, lekin admin ekrani (mijoz kartasi) 4-bosqichda |
| 2026-11-18 | Telefon raqami Mini App'ning `requestContactComplete` xom javobidan olinadi; server imzoni bot tokeni bilan tekshiradi, `contact.user_id` so'rovchiga teng, javob ≤ 1 soat | Raqam Telegram tasdiqlagan bo'ladi va ilovaning gapiga ishonilmaydi; bot `contact` xabarini kutish kerak emas. Haqiqiy Telegram'da hali sinalmadi (hisobot) |
| 2026-11-18 | 2-qadam kodi outbox'siz, darhol bot orqali; yetkazib bo'lmasa `two_factor_unavailable` va `bot_access = blocked`. Outbox, rejalashtiruvchi va `jobs` 3-bosqichga | Odam kodni ekranda kutadi, 5 daqiqadan keyin kod keraksiz: navbat va qayta urinish foyda bermaydi. 1-bosqichda outbox'ning boshqa foydalanuvchisi yo'q |
| 2026-11-18 | Huquq use-case ichida tekshiriladi (`requirePermission`); admin route guruhi faqat sessiyani talab qiladi | Qoida bitta joyda va biznes-qoida testida sinaladi; route'dagi e'lon bilan ikki joyda yuritish kerak emas |
| 2026-11-18 | Panelga login yoki telefon bilan kiriladi; loginda kamida bitta harf bo'ladi; noto'g'ri urinishlar odam bo'yicha (`user:<id>`) sanaladi va oyna qat'iy "oxirgi 15 daqiqa" | Dizayn "Login yoki telefon" deydi; raqamli login telefon bilan adashardi; ikki yo'l bilan urinishlar ikki baravar ko'paymasin. Chegara testda topildi |
| 2026-11-18 | Ustada login ham, parol ham yo'q; panel roliga login majburiy, yangi xodimga birinchi parol ham; bazadagi "login ⇔ parol" CHECK'i olib tashlandi | Ustani adminga ko'tarish ikki qadamli bo'lishi mumkin (avval login, keyin parol); qoida domain'da va testda |
| 2026-11-18 | Kamida bitta faol egasi qoladi; hech kim o'zini bloklamaydi; bloklash, yangi parol yoki panel rolini yo'qotish sessiyalarni darhol yopadi | Ustaxona boshqaruvsiz qolmasin; eski parolni bilgan yoki huquqi olingan odam panelda qolmasin |
| 2026-11-18 | Mavjud mijozning raqami bilan xodim qo'shilsa, o'sha yozuvga rol beriladi; Telegram tasdiqlagan raqamni panelda o'zgartirib bo'lmaydi | Bitta odam — bitta yozuv; tasdiqlangan raqam bog'lanishning asosi |
| 2026-11-18 | Sessiya: token cookie'da, bazada uning sha256 xeshi; 12 soat faolsizlik, 30 kun maksimum, "oxirgi faollik" 5 daqiqada bir yoziladi | Baza sizib chiqsa ham kalit emas; har so'rovga yozish keraksiz yuk |
| 2026-11-18 | O'zgartiruvchi so'rovda `Origin` hosti `Host` ga teng bo'lishi shart. Vite proxy `changeOrigin: false`; production'da nginx `Host` ni o'tkazishi shart (7-bosqich) | Cookie `SameSite=Strict` ustiga ikkinchi himoya. Vite'ning qisqa proxy yozuvi `Host` ni almashtirib, panel kirishini to'sib qo'ygani skrinshot tekshiruvida topildi |
| 2026-11-18 | Global rate-limit: IP bo'yicha daqiqasiga 120; TZ'dagi "mijozga daqiqasiga 60" alohida qilinmadi | Oqimdan himoya uchun yetarli; nozik joylar (kirish, kod) biznes-qoida bilan cheklangan. Kerak bo'lsa `keyGenerator` bilan foydalanuvchi bo'yicha qo'shiladi |
| 2026-11-18 | Rozilik versiyasi hozircha `draft-2026-11`, "Maxfiylik siyosati" havola emas, oddiy matn | Siyosat matni va manzili 2-bosqichda sozlamalarga keladi; bosilmaydigan narsa havolaga o'xshamasin |
| 2026-11-18 | Mini App'dagi dev `?shell=` almashtirgichi olib tashlandi: qismni faqat server aytadi | Ikkinchi manba bo'lmasin. Boshqa rolni ko'rish uchun `dev:init-data -- --user=<id>` |
| 2026-11-18 | `dev:api` 2-qadam kodini o'z terminaliga chiqaradi (faqat shu dev skriptda, xizmat logida emas) | Telegram'siz egasi va rahbar panelga kira olsin |
| 2026-11-18 | 0-bosqichda jadval yo'q, migratsiya faqat `btree_gist`. Outbox, rejalashtiruvchi, `Clock` va `dev:init-data` 1-bosqichga, `settings` 2-bosqichga, `status_history` 3-bosqichga ko'chdi | Infratuzilma birinchi foydalanuvchisi bilan birga keladi: o'lik kod va hech narsa yubormaydigan outbox bo'lmaydi. 0-bosqichda bitta ham xabar turi yo'q edi |
| 2026-11-18 | `fastify-type-provider-zod` ishlatilmaydi: so'rov va javobni umumiy kontrakt bo'yicha `http/route.ts` tekshiradi | Bitta xato formati, framework'ga bog'lanmagan tekshiruv, barbershop_bot'da sinalgan naqsh. Bog'liqlik bittaga kam |
| 2026-11-18 | Dizayn tokenlari bitta faylda: `packages/shared/src/styles/tokens.css`, Mini App va admin import qiladi | Ranglar ikki joyda nusxalanmaydi |
| 2026-11-18 | Mini App mavzusi `themeParams.isDark` dan (Telegram mavzusi), `miniApp.isDark` dan emas | `miniApp.isDark` ilova fonini o'qiydi, fonni esa o'z rangimizga bo'yaymiz: mavzu birinchi rangda "qotib" qolardi. SDK type'laridan topildi |
| 2026-11-18 | Raqam shrifti byudjeti 24 KB (DESIGN'da 20 KB edi) | `Barlow Semi Condensed` latin 600 woff2 hajmi 22.4 KB. Davlat raqami uchun lotin harflari kerak, faqat raqamlar subset'i yetmaydi |
| 2026-11-18 | Mahalliy sana va vaqt qat'iy `YYYY-MM-DD` va `HH:mm` (00:00–23:59) | Test topdi: Luxon ISO bo'yicha `24:00` ni jimgina ertangi 00:00 deb qabul qiladi, hafta va tartib raqamli sanalarni ham qabul qiladi |
| 2026-11-18 | Davlat raqami: shaxsiy (`01 A 123 BC`) va yuridik (`01 123 ABC`) format, 14 ta hudud kodi, kirill harflari lotin o'xshashiga aylantiriladi | TZ 4.2 va 15.6. Rus klaviaturasida yozilgan raqam boshqa raqam bo'lib saqlanmasin. Boshqa formatlar ochiq savol (21-bo'lim, 10) |
| 2026-11-18 | Fastify'ning so'rov logi o'chirilgan, xatoda faqat route naqshi yoziladi | URL'ning query qismida telefon yoki ism bo'lishi mumkin (2-bo'lim, 14-qoida) |
| 2026-11-18 | `/health` bazani tekshiradi: javob bo'lmasa `503` | Baza yo'q bo'lsa monitoring buni ko'rishi kerak |
| 2026-11-18 | Lokal ishlab chiqish: Docker'dagi `postgres:18` konteyneri (boshqa loyihalar bilan umumiy), `carservice` roli va `carservice`, `carservice_test` bazalari | Mashinada PostgreSQL faqat shu konteynerda bor. Alohida rol boshqa loyihalarning bazalariga tegmaydi |
| 2026-11-18 | v1 da faqat biznes-qoidalar testlanadi: `domain` sof funksiyalari va `app` use-case'lari haqiqiy PostgreSQL'da. HTTP, bot, UI va e2e testlari yo'q, o'rniga har bosqichda qo'lda tekshiruv | Foydalanuvchi qarori. Bazada amalga oshadigan qoidalar (ikki marta bron yo'q, idempotentlik, egalik) ham biznes-qoida, shuning uchun ular use-case darajasida testlanadi |
| 2026-11-18 | UI manbai `docs/design/*.pdf`, undan `docs/DESIGN.md` tuzildi; ranglar piksellardan o'lchandi | Foydalanuvchi talabi. PDF'lar rastr bo'lgani uchun shrift nomi aniqlanmadi (21-bo'lim, 9) |
| 2026-11-18 | Asosiy amal sahifadagi `BottomBar` tugmasi bilan, orqaga qaytish Telegram `BackButton` bilan | Dizaynda tugma ustida xulosa va ikki tugmali variantlar bor (`MainButton` bunga mos emas); `BackButton` TZ talabi va Android tizim tugmasi bilan mos |
| 2026-11-18 | Mini App dizayn palitrasini ishlatadi, `--tg-theme-*` ni emas; mavzu `colorScheme` dan | Dizayn ikkala mavzu uchun aniq ranglarni bergan |
| 2026-11-18 | Raqamlar uchun bitta o'zimiz host qiladigan tor shrift (≤ 20 KB), qolgani tizim shrifti | Tor raqamlar dizaynning asosiy belgisi; to'liq web-font bundle byudjetini oshirardi |
| 2026-11-18 | Papka tuzilmasi yaratildi (5-bo'lim); manba PDF'lar `docs/tz` va `docs/design` ga ko'chirildi, `UI dizayn9Rahbar - Analitika0.pdf` nomi `UI dizayn(Rahbar - Analitika).pdf` ga tuzatildi | Foydalanuvchi talabi: to'g'ri papka tuzilmasi |
| 2026-11-18 | Bitta bot va bitta Mini App manzili; qaysi qism (client, master, staff) ochilishini server `bootstrap.shell` orqali aytadi | Foydalanuvchi talabi. Ikkinchi bot va alohida ilova kerak emas, ruxsat bitta joyda |
| 2026-11-18 | Bitta ustaxona: tenant ham, filial ham yo'q | Foydalanuvchi talabi. TZ'dagi `branch_id` olib tashlandi; ko'p filial yo'li 19-bo'limda, narxi ochiq aytilgan |
| 2026-11-18 | v1 chegarasi: asos + usta ilovasi + qabul dalolatnomasi + topshirish va to'lov; do'kon, ombor va analitika v2 da | Foydalanuvchi tanlovi |
| 2026-11-18 | Usta ilovasi PWA emas, botdagi Mini App | Foydalanuvchi tanlovi. PIN, push va service worker kerak emas |
| 2026-11-18 | Fastify 5 | Foydalanuvchi tanlovi (3.1) |
| 2026-11-18 | uz va ru birdaniga, tipli lug'atlar | Foydalanuvchi tanlovi |
| 2026-11-18 | Fiskal chek raqami qo'lda kiritiladi, `FiscalProvider` porti orqali | Foydalanuvchi tanlovi; provayder tanlanmagan |
| 2026-11-18 | Dalolatnoma: mijoz botda tasdiqlaydi yoki admin "og'zaki" deb belgilaydi; imzo va PDF yo'q | Foydalanuvchi tanlovi; imzo biometriyami degan savol ochiq |
| 2026-11-18 | Slot: ariza bitta boksni egallaydi, ko'p kunli ish bitta uzluksiz oraliq | Foydalanuvchi tanlovi. Mashina tunda ham boksda turadi, shuning uchun bitta qator to'g'ri va `EXCLUDE` yetarli |
| 2026-11-18 | Ushlab turish ish vaqti bo'yicha hisoblanadi; `hold_until ≥ starts_at` bo'lsa avto-bekor yo'q | TZ 7.3 ni talqin qilish: tunda kelgan ariza ertalabgacha bekor bo'lib qolmasin, kelayotgan mijozning arizasi ham bekor bo'lmasin |
| 2026-11-18 | Hisobotlardan faqat "Bugun" ekrani | Foydalanuvchi tanlovi; kerakli ma'lumot to'liq yig'iladi |
| 2026-11-18 | Modul bo'yicha tuzilma (`modules/<nom>/{domain,app,http,bot}`), modullararo faqat `index.ts` orqali | Loyiha barbershop_bot'dan bir necha barobar katta; v2 modullari yangi papka bo'lib qo'shiladi va boshqasiga tegmaydi |
| 2026-11-18 | Bazadagi sessiya va httpOnly cookie, JWT emas | Bekor qilish bir qator, refresh logikasi kerak emas |
| 2026-11-18 | Drizzle, npm workspaces, Vite SPA, Postgres outbox, systemd — TZ stekidan farqli | barbershop_bot'da sinalgan va soddaroq (1.3-bo'lim) |
| 2026-11-18 | Telefon faqat Telegram tasdiqlaganda hisoblarni bog'laydi; boshqa `telegram_id` dagi raqam rad etiladi | TZ 4.1.4 ni xavfsiz bajarish |
| 2026-11-18 | Bitta vazifa arizaning bir nechta bandini qamraydi | Dizaynda ("Keramika: kapot, bamperlar" bitta vazifa) |
| 2026-11-18 | "Boshqa" modelda kuzov sinfini mijoz tavsif bo'yicha tanlaydi, admin to'g'rilaydi | Sinfsiz narx va slot hisoblab bo'lmaydi |
| 2026-11-18 | Chegirma faqat butun arizaga | Dizayn (A8) shunday; bandga chegirma v2 da |
| 2026-11-18 | Checkout atomar: to'lovlar, chek va `completed` bitta so'rovda | Yarim yozilgan to'lov holati bo'lmaydi |
| 2026-11-18 | Usta bo'lgan xodim Mini App'da faqat usta qismini ko'radi, admin rolida panel havolasi | Rolni almashtirish v2 da |
| 2026-11-18 | Media: polimorf emas, nullable FK va `num_nonnulls = 1` CHECK | Baza yaxlitlikni o'zi tekshiradi |
| 2026-11-18 | Admin panel 10 soniyada yangilanadi (polling) | WebSocket'siz yetarli; 19-bo'limda yo'li bor |
| 2026-11-18 | Xodim "eshik oldidagi mijoz" uchun eng yaqin bron qoidasini (`minLeadMin`) chetlab o'tadi: qo'lda ariza, ko'chirish va bandlarni tahrirlashda. Panel ham shu vaqtlarni ko'rsatadi (`admin.slots`, `admin.availability`). O'tgan vaqtga, ish vaqtidan tashqariga va ufqdan keyinga bron qilib bo'lmaydi | Mijoz telefonda yoki ustaxonada turibdi; 10.3 faqat xodim uchun yumshaydi, qolgan qoidalar o'zgarmaydi |
| 2026-11-18 | Bandlarni tahrirlash: arizada bor zona sotilgan narxini saqlaydi, yangi zona praysdan narxlanadi, admin yozgan narx ustun (`null` = kelishiladi). Bron `rebook` bilan qayta hisoblanadi (avval qaytariladi, keyin band qilinadi): sig'masa hamma o'zgarish qaytadi (`slot_taken`), eski bron qoladi. Faqat tugash vaqti o'zgarsa boshlanish vaqti qayta tekshirilmaydi (`keepStart`) | Prays o'zgarishi ochiq arizaga ta'sir qilmasin (10.4); ariza ikki bron bilan yoki bronsiz qolmasin |
| 2026-11-18 | "Kelmadi" faqat tasdiqlangan arizada va slot boshlangandan keyin. Xodim `client` yoki `staff` sababini beradi, `system` sababini emas; "Rad etdi" va bekor qilish sababsiz o'tmaydi, "Boshqa" izoh talab qiladi | Slot boshlanmasdan "kelmadi" deb yozib bo'lmaydi (4-bosqich testi); tizim sababi odam tanlaydigan narsa emas |
| 2026-11-18 | Qo'lda ariza: "mijoz tasdiqladi" belgisi bilan darhol `confirmed` (tarix `null → confirmed`, ushlab turish yo'q), belgisiz `new` va ushlab turiladi. Mijoz mavjud yoki yangi (ism va telefon, `phone_verified = false`); Telegramsiz mijozga xabar yozilmaydi, xato ham chiqmaydi | 9.1: telefonda tasdiqlangan ariza qayta qo'ng'iroq kutmaydi. Telefon Telegram tasdiqlamaguncha hisoblarni bog'lamaydi (2-bo'lim) |
| 2026-11-18 | `call-sla`: ish vaqtidagi daqiqalar `callEscalateMin` ga yetsa, hech kim qo'ng'iroq qilmagan arizada `staff.order_unanswered` rahbar va egasiga bir marta ketadi; har qanday natijali qo'ng'iroqdan keyin ketmaydi. `reminders`: `rules.reminderHours` bo'yicha, faqat oynadan oldin tasdiqlangan arizaga va `remindersEnabled` da; kalit `reminder:<orderId>:<N>:<startsAt>`, shuning uchun ko'chirilgan ariza yangi vaqt uchun qayta eslatiladi | Tunda kelgan ariza ertalab "kech" bo'lmasin; bir xabar ikki marta ketmasin |
| 2026-11-18 | Ariza `created_at` bazaning `now()` idan emas, `Clock` dan yoziladi | Kutish vaqti (taymer, SLA) va testlar bitta soat bo'yicha hisoblansin. Testda topildi |
| 2026-11-18 | Ma'lumotni o'chirish (anonimlashtirish): ism, telefon, Telegram bog'lanishi va ichki izoh o'chadi, mashina raqami `ANON-…` bo'lib arxivga tushadi, arizadagi mashina nusxasida raqam "—". Ariza, bandlar va to'lovlar qoladi. Faqat egasi (`clients.anonymize`), qaytarib bo'lmaydi. Mijoz so'rovi (`POST /api/tma/me/deletion-request`) `deletion_requested_at` ni belgilaydi va egasiga bir marta xabar yozadi, qaror egasiniki. Bo'shagan telefonni boshqa kishi ishlatishi mumkin | TZ 15.3 va 2-bo'lim: ariza, to'lov, tarix va audit o'chirilmaydi, shaxsiy ma'lumot o'chadi |
| 2026-11-18 | Mijozlar ro'yxati: "doimiy" — kamida 2 ta bajarilgan ariza; "90 kundan beri kelmagan" — oxirgi bajarilgan ariza 90 kundan eski va faol arizasi yo'q; "oxirgi kelish" — bajarilgan arizaning bron boshlanishi. Mijoz — roli ham, logini ham yo'q odam | PLAN 18 filtrlarni aytadi, chegarasini aytmaydi; eng oddiy talqin tanlandi |
| 2026-11-18 | Mijozning ichki izohi jurnalga matni bilan yozilmaydi, faqat "izoh bor/yo'q" (`hasNote`) | Izohda shaxsiy gap bo'lishi mumkin, jurnalni ko'p odam o'qiydi |
| 2026-11-18 | Faqat o'qiydigan rolga (rahbar) `actions` bayroqlari serverdan hammasi `false` keladi | Panel serverning gapini ko'rsatadi (2-bo'lim, 13-qoida); aks holda rahbarga bosilganda `forbidden` beradigan tugmalar chiqardi. Brauzer tekshiruvida topildi |
| 2026-11-18 | `ScheduledTask` interfeysi `platform/ports.ts` da | `app` qatlami `jobs` ni import qila olmaydi (ESLint); rejalashtiruvchi ham, modul ham uni shu yerdan oladi |
| 2026-11-18 | Soatni faqat server beradi: `admin.today` va `admin.schedule` javobida `now`; `admin.schedule` da `date` bo'lmasa bugun. Panel blok vaqtini ustaxonaning qat'iy +05:00 siljishi bilan UTC ga aylantirib yuboradi | Klient vaqtni hisoblamaydi (CLAUDE.md). `z.iso.datetime()` siljishli vaqtni qabul qilmaydi: brauzer tekshiruvida topildi |
| 2026-11-18 | Yangi arizada ovoz: `NewOrderWatcher` har 10 soniyada ochiq arizalarni so'raydi (fon varaqada ham) va "Yangi" holatda yangi ariza chiqsa Web Audio bilan ikki ton chaladi; faqat `orders.write` bor xodimda | 18-bo'lim talabi; ovoz fayli kerak emas. Brauzer foydalanuvchi sahifani bosmaguncha ovozga ruxsat bermaydi |
| 2026-11-18 | Panelning yuqori qidiruvi arizalarni qidiradi (`/orders?q=`: raqam, mijoz ismi yoki telefoni, davlat raqami); mijozlar ro'yxatining o'z qidiruvi bor. Kanban jarayondagi arizalarni ko'rsatadi (javobsiz yangilar doim); tugaganlari mijoz kartasida | Dizayn A1: "Raqam, telefon yoki davlat raqami" |
| 2026-11-18 | `GET /api/admin/catalog` — mijoz katalogining xodim uchun nusxasi (zonalar, markalar, sabablar), `orders.read` bilan | Kanban filtri, yangi ariza va bandlarni tahrirlash zonalarni shundan oladi; ikkinchi manba yo'q |
| 2026-11-18 | `garage.map`: "Boshqa" mashinani modelga bog'laydi; kuzov sinfi modeldan olinadi, admin to'g'rilashi mumkin; faqat modelsiz va arxivlanmagan mashina; audit `car.map` | PLAN 18 (4-bosqichga ko'chgan); sinfsiz narx va slot hisoblanmaydi |
| 2026-11-18 | Arizaning kalendardagi o'rni — u hozir ushlab turgan bronning (bo'lmasa, oxirgi bronning) boshlanishi; ko'chirilganda qaytarilgan eski bron hisobga olinmaydi. "Bugun", ro'yxat sanasi va mijozning "oxirgi kelish"i shundan hisoblanadi | `max(starts_at)` ko'chirilgan arizani eski, kechroq kunda qoldirardi. Qo'lda tekshiruvda topildi, test bilan tasdiqlandi |
