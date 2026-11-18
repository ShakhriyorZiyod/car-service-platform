# car-service-platform

Bitta avtoservis va detailing studiyasi uchun tizim. Mijoz va usta bitta Telegram bot ichidagi Mini App'da
ishlaydi: qaysi qism ochilishini server rolga qarab aytadi. Xodimlar veb-panelda ishlaydi.

- Reja va yagona manba: `docs/PLAN.md`
- Dizayn tizimi: `docs/DESIGN.md` (manba: `docs/design/*.pdf`)
- Talab: `docs/tz/` (TZ v2.0)
- Bosqich hisobotlari: `docs/reports/`
- Texnik namuna: `D:\Projects\barbershop_bot` (stek va naqshlar o'sha yerdan; farqlar PLAN 1.3 da)

Foydalanuvchi bilan o'zbekcha (lotin) yoz.

npm workspaces:

- `apps/server` — bot, HTTP API va fon ishlari;
- `apps/tma` — Mini App: mijoz va usta;
- `apps/admin` — veb-panel;
- `packages/shared` — kontrakt, lug'at, format.

Buyruqlar repo ildizidan ishga tushiriladi.

## Buyruqlar

```
npm run dev                 # server: bot + API (TELEGRAM_BOT_TOKEN kerak)
npm run dev:api             # faqat API, Telegram'siz; 2-qadam kodlari shu terminalga chiqadi
npm run dev:init-data -- --user=<id> [--name=] [--lang=] [--phone=998...]   # Mini App uchun imzolangan ma'lumot
npm run dev:tma             # Mini App (Vite, :5173; ?theme=dark)
npm run dev:admin           # admin panel (Vite, :5174/admin/)
npm run owner:create -- --phone=... --login=... --name=...  # birinchi egasi (parolni so'raydi)
npm run build && npm start
npm run check               # typecheck + lint + test + build + check:bundle
npm run typecheck | lint | format | format:check | test | check:bundle
npm run db:generate -- --name <nom>      # sxema o'zgarganda; qo'lda SQL uchun: --custom
npm run db:migrate
```

Keyingi bosqichlarda qo'shiladi: `seed:reference` va `seed:demo` (2).

Mini App'da qaysi qism ochilishini faqat server aytadi. Boshqa rolni ko'rish uchun `dev:init-data` ni o'sha
roldagi foydalanuvchining Telegram id'si bilan ishga tushiring (o'zgargach Vite'ni qayta ishga tushiring).

## Ish tartibi

- Ish PLAN 18-bo'limdagi bosqichlar bo'yicha boradi. Bosqich oxirida `npm run check` va qo'lda tekshiruv
  ro'yxatini bajar, `docs/reports/bosqich-N.md` ni `_shablon.md` bo'yicha yoz, PLAN 18-bo'limdagi holatni
  yangila. **Foydalanuvchi qabul qilmaguncha keyingi bosqichga o'tma.**
- PLAN'da yo'q funksiyani qo'shma, 19-bo'limdagilarni ayniqsa. Yangi g'oya avval PLAN 20-bo'lim tartibi
  bilan rejaga yoziladi. Noaniq joyda so'ra yoki eng oddiy variantni tanla va PLAN 22-bo'limga yoz.
- Kutubxona API'sini (fastify, grammY, drizzle, zod, @tma.js, tanstack query, react-router) ishlatishdan
  oldin `node_modules` dagi type'larni tekshir. Xotiradan taxmin qilma.
- Haqiqiy botni (`npm run dev` / `npm start`) faqat foydalanuvchi so'raganda ishga tushir.
- Natijani bo'yamasdan yoz: test yiqilgan bo'lsa chiqishi bilan ayt, qilinmagan qadamni qilinmagan de.

## Arxitektura (PLAN 4)

- Modulli monolit: `apps/server/src/modules/<nom>/{domain,app,http,bot}` va `index.ts`.
- `domain/` sof: DB, fastify, grammy, boshqa qatlam va boshqa modul yo'q. `new Date()` chaqirilmaydi,
  `now` parametr bilan keladi.
- `app/` — use-case'lar: huquq, tranzaksiya, outbox, audit. Transportni bilmaydi.
- `http/` va `bot/` — yupqa adapterlar: servisni chaqiradi, bazaga tegmaydi, biznes-logika yozilmaydi.
- Boshqa modulga faqat `modules/<nom>/index.ts` orqali murojaat qilinadi. Jadvalga faqat egasi bo'lgan
  modul yozadi (PLAN 4.2).
- Chegaralarni ESLint majburlaydi. Qoidani o'chirib qo'yish o'rniga kodni to'g'ri qatlamga ko'chir.
- Servis `createXService(deps)`, global holat yo'q. Kompozitsiya `src/composition.ts` da.
- Repository qatlami, DI konteyner, CQRS, event bus qo'shilmaydi.

## O'zgarmas qoidalar (PLAN 2, qisqacha)

- Bitta ustaxona: tenant ham, filial ham yo'q.
- Bitta bot va bitta Mini App manzili. Shell'ni (`client`, `master`, `staff`) faqat server aytadi.
- Huquq har so'rovda serverda tekshiriladi. Usta vazifalari SQL so'rovida `master_id` bilan
  filtrlanadi. Birovning yozuviga murojaat `404`.
- Holat faqat `domain/*-status.ts` orqali, `WHERE status = <kutilgan>` sharti bilan o'zgaradi va o'sha
  tranzaksiyada `status_history` ga yoziladi.
- Bron to'qnashuvini `bookings_no_overlap` (`EXCLUDE USING gist`) himoya qiladi. Yaratishda
  `ON CONFLICT DO NOTHING RETURNING`, ko'chirishda `23P01` xatosi `slot_taken` bo'ladi. Bu cheklovni
  chetlab o'tadigan kod yozma.
- Slot va ish vaqti faqat `booking/domain` va `workshop/domain` da hisoblanadi. Klient yuborgan vaqt ham
  shulardan o'tadi.
- Narx, nom va davomiylik arizaga nusxalanadi. Pul so'mda butun son.
- Vaqt bazada `timestamptz` (UTC) da, hisob `Asia/Tashkent` bo'yicha (luxon). Klient vaqtni hisoblamaydi.
- Ariza, to'lov, tarix va audit o'chirilmaydi.
- Telefon faqat Telegram tasdiqlagan bo'lsa hisoblarni bog'laydi.
- Boshqa odamga xabar faqat outbox orqali: `outbox.enqueue(tx, ...)` o'sha tranzaksiya ichida.
- Ariza yaratish, foto yuklash va checkout idempotent (`requestId`, `mediaId`).
- `db.transaction` ichida faqat `tx` ishlat. Yangi ulanish talab qiladigan narsani tranzaksiyadan oldin
  o'qi.
- Biznes-qoida faqat serverda bo'ladi, klient faqat natijani ko'rsatadi.

## Kengaytirish yo'llari

- **Yangi endpoint:**
  1. `packages/shared/src/routes/index.ts` va `contract/index.ts` ga bir qatordan qo'sh (nomi
     `<guruh>.<amal>`).
  2. `modules/<nom>/http/routes.ts` dagi guruh xaritasiga handler qo'sh, ichida faqat servis metodini
     chaqir. Yangi xarita bo'lsa, uni `src/http/app.ts` dagi `registerGroup` ga qo'sh.
  3. Admin use-case `requirePermission(actor, '...')` bilan boshlanadi (`platform/actors.ts`).
- **Yangi xabar turi:** `src/notifications/types.ts` va `render/uz.ts`, `render/ru.ts`.
- **Yangi fon ishi:** `ScheduledTask`, keyin `composition.ts` dagi ro'yxatga qo'sh. "Qachon" degan savolga
  `domain/` dagi sof funksiya javob beradi.
- **Yangi modul:** PLAN 20-bo'limdagi chek-list.
- **Fayl qabul qiladigan endpoint:**
  - bayt `http` qatlamida o'qiladi;
  - tur `media/domain` da baytlardan aniqlanadi;
  - saqlash `FileStore` porti orqali.

## Testlar (PLAN 16)

- **v1 da faqat biznes-qoidalar testlanadi.** Bular `domain/` sof funksiyalari va `app/` use-case'lari,
  ikkinchisi haqiqiy PostgreSQL'da. HTTP, bot, UI va e2e testlari yozilmaydi.
- Testlar `apps/server/test/` da: `lib/`, `db/` (EXCLUDE, CHECK, trigger), `modules/<nom>/`.
- Har yangi biznes-qoida bilan birga test yoziladi. Biznes-qoidadagi xato tuzatilganda avval xatoni
  qayta hosil qiladigan test yoziladi.
- Jadval testlari (`it.each`) afzal: holat o'tishlari, slotlar, huquqlar matritsasi.
- Testlar faqat `TEST_DATABASE_URL` bazasiga tegadi, nomi `_test` bilan tugashi shart. Vaqt soxta
  `Clock` orqali beriladi.

## Mini App (`apps/tma`)

- Ranglar faqat `styles/tokens.css` dagi tokenlar orqali (DESIGN 2). Har ekranni och va qorong'i
  mavzuda ko'z bilan tekshir.
- Davlat raqami chipi ikkala mavzuda oq bo'ladi.
- Telegram SDK faqat `src/telegram.ts` da. Ilova oddiy brauzerda ham ishlaydi.
- `shells/client` va `shells/master` bir-birini import qilmaydi, shell ichidagi feature'lar ham.
  Umumiy narsa `ui/`, `lib/` va `api.ts` da.
- Bundle'da `zod` yo'q. `@cs/shared` dan faqat `import type`, qiymatlar esa `/routes`, `/format`,
  `/i18n` va `/vocabulary` dan.
- Har shell `React.lazy` bilan alohida yuklanadi. Birinchi ochilish 200 KB gzip, `check:bundle`
  tekshiradi. Birinchi ekran uchun bitta so'rov: `/api/tma/bootstrap`.
- Orqaga qaytish Telegram `BackButton` orqali. Asosiy amal sahifadagi `BottomBar` tugmasi orqali.
- Bosiladigan maydon: mijozda ≥ 44 px, ustada ≥ 56 px. Har ekranni Telegram Desktop o'lchamida ham
  tekshir.
- Matnlar `i18n/uz.ts` va `i18n/ru.ts` da, kalit yetishmasa tip xatosi beradi. Foydalanuvchiga
  ko'rinadigan matnda o‘ va g‘ uchun `‘` (U+2018) ishlatiladi.

## Admin (`apps/admin`)

- Komponentlar DESIGN 6 bo'yicha, tokenlar Mini App bilan bir xil nomlarda.
- `features/X` va `features/Y` bir-birini import qilmaydi. Sozlamalar `React.lazy` bilan yuklanadi.
- Yashirilgan bo'lim API'da ham rad etiladi: UI'dagi yashirish huquq tekshiruvi emas.

## Xavfsizlik

- Logga telefon, ism, xabar matni, token, `initData`, parol va 2FA kodi yozilmaydi (pino redact).
- `.env` commit qilinmaydi. Yangi o'zgaruvchi qo'shsang, `.env.example` va `config.ts` ni yangila.
- Foto turi baytlar bo'yicha tekshiriladi, SVG qabul qilinmaydi, nom tasodifiy UUID bo'ladi, ko'rish
  imzolangan URL orqali.
- Callback va Mini App'dan kelgan id'larga ishonma: egalik serverda tekshiriladi.

## Baza

- Qo'llangan migratsiyani tahrirlama, yangisini yarat. `EXCLUDE`, trigger va sequence uchun
  `drizzle-kit generate --custom` ishlat.
- Jadval sxemasi `src/db/schema/<modul>.ts` da, modul egaligi PLAN 4.2 bo'yicha.
