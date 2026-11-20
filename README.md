# car-service-platform

Bitta avtoservis va detailing studiyasi uchun tizim. Mijoz va usta bitta Telegram bot ichidagi Mini
App'da ishlaydi: qaysi qism ochilishini server rolga qarab aytadi. Xodimlar veb-panelda ishlaydi.

- Reja: [`docs/PLAN.md`](docs/PLAN.md) (bosqichlar: 18-bo'lim)
- Dizayn tizimi: [`docs/DESIGN.md`](docs/DESIGN.md)
- Ish qoidalari: [`CLAUDE.md`](CLAUDE.md)
- Bosqich hisobotlari: [`docs/reports/`](docs/reports/)

## Tuzilma

```
apps/server      bot + HTTP API + fon ishlari (bitta jarayon, Fastify, grammY, Drizzle)
apps/tma         Telegram Mini App: mijoz, usta va xodim qismlari (React + Vite)
apps/admin       xodimlar veb-paneli, PUBLIC_URL/admin/ (React + Vite + React Router)
packages/shared  API kontrakti, lug'at, format, tillar, dizayn tokenlari
```

Server modullardan iborat (`apps/server/src/modules/<nom>/{domain,app,http,bot}`). Qatlam va modul
chegaralarini ESLint majburlaydi (PLAN, 4.3-bo'lim).

## O'rnatish

Talablar: Node.js 24+ va PostgreSQL 14+ (testlar 14 va 18 da o'tadi).

```bash
npm ci
cp .env.example .env          # qiymatlarni to'ldiring
```

Bazani bir marta yarating (superuser bilan). Baza egasi `btree_gist` kengaytmasini migratsiyada o'zi
yaratadi, superuser kerak emas:

```sql
CREATE ROLE carservice LOGIN PASSWORD '...';
CREATE DATABASE carservice OWNER carservice;
CREATE DATABASE carservice_test OWNER carservice;   -- testlar uchun, nomi _test bilan tugashi shart
```

PostgreSQL Docker'da ishlasa, xuddi shu SQL'ni konteyner ichida bajaring:
`docker exec -i <konteyner> psql -U postgres`.

So'ng:

```bash
npm run db:migrate
npm run owner:create -- --phone=+998901234567 --login=owner --name="Ism Familiya"   # parolni so'raydi
npm run seed:reference   # markalar, modellar, ish turlari va zonalar, bekor qilish sabablari (production'da ham)
npm run seed:demo        # faqat dev: ish vaqti, 4 boks, narxlar, demo xodimlar (egasi va seed:reference kerak)
```

Egasi panelga kirganda 2-qadam kodi Telegram botga keladi. Buning uchun egasi botni ochib, shu telefon
raqamini Mini App orqali ulashgan bo'lishi kerak.

Serverga o'rnatish, yangilash, zaxira va tiklash: [`docs/DEPLOY.md`](docs/DEPLOY.md). Egasi va
administrator uchun yo'riqnoma: [`docs/EGA_UCHUN.md`](docs/EGA_UCHUN.md).

## Ishlab chiqish

Telegram'siz (bot tokeni kerak emas):

```bash
npm run dev:init-data -- --user=100000001 --name=Aziz [--phone=998901234567]
npm run dev:api      # API: http://127.0.0.1:3000/health; 2-qadam kodlari shu terminalga chiqadi
npm run dev:tma      # Mini App: http://localhost:5173 (?theme=dark)
npm run dev:admin    # panel: http://localhost:5174/admin/
```

`dev:init-data` Mini App uchun imzolangan `initData` ni `apps/tma/.env.local` ga yozadi. `--phone`
bilan imzolangan kontakt ham yoziladi, "Telefon raqamni ulashish" tugmasi brauzerda shu kontaktni
yuboradi. Qaysi qism (mijoz, usta, xodim) ochilishini server foydalanuvchining roliga qarab aytadi:
boshqa rolni ko'rish uchun o'sha roldagi foydalanuvchining id'si bilan qayta ishga tushiring va Vite'ni
qayta ishga tushiring. Panelda `?lang=ru` kirish sahifasini ruscha ko'rsatadi.

Telegram bilan:

1. BotFather'da **alohida test bot** yarating, tokenni `.env` dagi `TELEGRAM_BOT_TOKEN` ga yozing.
2. `npm run dev:tma` va tunnel: `cloudflared tunnel --url http://localhost:5173` (yoki `ngrok http 5173`).
3. Tunnel manzilini `PUBLIC_URL` ga yozing va `npm run dev` ni ishga tushiring. Bot menyu tugmasini o'zi
   o'rnatadi.
4. Botga `/start` yuboring.

Faqat **bitta** nusxa ishlashi kerak (long polling).

## Buyruqlar

```bash
npm run dev            # server: bot + API (TELEGRAM_BOT_TOKEN kerak)
npm run dev:api        # faqat API
npm run dev:tma        # Mini App
npm run dev:admin      # admin panel
npm run build && npm start
npm run check          # typecheck + lint + test + build + check:bundle
npm run typecheck
npm run lint           # qatlam va modul chegaralarini ham tekshiradi
npm run format         # yoki format:check
npm test               # TEST_DATABASE_URL bazasida
npm run check:bundle   # build'dan keyin: Mini App tezlik byudjeti
npm run db:generate -- --name <nom>   # sxema o'zgarganda; qo'lda SQL uchun --custom
npm run db:migrate
npm run seed:reference | seed:demo   # ma'lumotnomalar; seed:demo faqat dev
```

Har bosqich oxirida `npm run check` yashil bo'lishi shart.

## Testlar

v1 da faqat biznes-qoidalar testlanadi (PLAN, 16-bo'lim): `domain/` sof funksiyalari va `app/`
use-case'lari, ikkinchisi haqiqiy PostgreSQL'da. Testlar faqat `TEST_DATABASE_URL` bazasiga tegadi: nomi
`_test` bilan tugamasa, ishga tushmaydi. Ishga tushishdan oldin migratsiyalar shu bazaga qo'llanadi.
