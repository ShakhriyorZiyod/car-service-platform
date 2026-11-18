# Bosqich 1 — Kirish, rollar va rolga qarab ochilish: hisobot

| | |
|---|---|
| Sana | 2026-11-18 |
| Holat | Qabulga tayyor. Haqiqiy Telegram'dagi tekshiruv qolgan (5-bo'lim) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 1 |

## 1. Natija

Har kim o'z interfeysiga kiradi. Mini App foydalanuvchini imzolangan `initData` bo'yicha taniydi, birinchi
kirishda til, ism va rozilikni oladi, telefon raqamini Telegram imzosi bilan tekshirib bog'laydi va
serverning javobiga qarab mijoz, usta yoki xodim qismini ochadi. Egasi qo'shgan usta raqamini ulashishi
bilanoq usta qismiga tushadi. Xodim panelga login yoki telefon va parol bilan kiradi, rahbar va egasi
botdan kelgan kod bilan ikkinchi qadamni o'tadi. Egasi xodimlarni boshqaradi, har o'zgarish o'chirib
bo'lmaydigan audit jurnaliga yoziladi. `npm run check` yashil: 310 test, ulardan 210 tasi yangi.

## 2. Qilingan ish

| Qism | Nima qilindi | Asosiy fayllar |
|---|---|---|
| Baza | `users`, `user_roles`, `sessions`, `login_challenges`, `login_failures`, `audit_log`; audit uchun `UPDATE`/`DELETE` ni rad etuvchi trigger | `db/schema/{identity,audit}.ts`, migratsiyalar 0001, 0002 |
| `identity/domain` | Rollar → qism va huquqlar, Telegram imzosi (`initData`, kontakt), login va parol qoidalari, kirish/kod/sessiya muddatlari, telefonni bog'lash qarori, xodim qoidalari | `modules/identity/domain/*` |
| `identity/app` | Mini App: aniqlash, bootstrap, onboarding, raqamni bog'lash (yozuvlarni qulflab, poygalarga chidamli); panel: kirish, 2-qadam, sessiya, chiqish, til; xodimlar: ro'yxat, qo'shish, o'zgartirish, parol, bloklash; birinchi egasi | `modules/identity/app/*` |
| `audit` | `record(tx, …)` (o'zgarish bilan bitta tranzaksiyada), sahifali ro'yxat (faqat egasi) | `modules/audit/*` |
| HTTP | Guruhlar: `tma.*` (`initData`), `auth.*` (cookie o'rnatish/tozalash), `admin.*` (sessiya); `Origin` tekshiruvi; cookie va rate-limit plugin'lari; yangi xato kodlari | `http/app.ts`, `http/route.ts`, `http/contexts.ts` |
| Bot | `/start` va xabarlar foydalanuvchini yozadi va botga yozish ruxsatini belgilaydi; `my_chat_member`; 2-qadam kodi uz/ru | `modules/identity/bot/start.ts`, `bot/login-codes.ts`, `bot/texts.ts` |
| Skriptlar | `dev:init-data` (imzolangan `initData` va kontakt), `owner:create` (parol yashirin so'raladi), `dev:api` da kod terminalga | `apps/server/scripts/*` |
| Mini App | Seans va bootstrap, T0 (til, ism, rozilik, raqamni ulashish, "Hozircha katalogni ko'rish"), xodim qismi (rol va panel havolasi), xato ekrani, "Telegram orqali oching" ekrani, UI komponentlari | `apps/tma/src/{bootstrap.tsx,App.tsx,onboarding,shells/staff,ui}` |
| Admin | A0 (parol, 2-qadam kodi, 60 soniya sanoq, til), sessiya darvozasi va `401` da kirishga qaytish, huquqqa qarab menyu, yuqori panel (foydalanuvchi, til, chiqish), Sozlamalar: "Xodimlar va rollar" (A13), "Audit jurnali" | `apps/admin/src/{auth,layout,features/settings}` |
| Umumiy | Marshrutlar va kontrakt, rollar va huquqlar ro'yxati, chegaralar, rol nomlari, `--ink-raised` tokeni | `packages/shared/src/*` |

## 3. Biznes-qoidalar va testlar

| Qoida | Test fayli | Natija |
|---|---|---|
| Rollar → qism (usta → usta, panel rollari → xodim, bloklangan → mijoz); rollar × huquqlar matritsasi (4 × 18); kim panelga va kim 2-qadam bilan kiradi | `modules/identity/roles.test.ts` | ✔ 90 |
| `initData` va kontakt faqat shu bot uchun Telegram imzosi bilan: boshqa bot, o'zgartirilgan foydalanuvchi yoki raqam, 24 soat (kontakt 1 soat), kelajak sanasi, boshqa odamning kontakti, `initData` ni kontakt deb yuborish — rad etiladi. Imzo mustaqil kutubxona (`@tma.js/init-data-node`) bilan qo'yiladi | `modules/identity/telegram-data.test.ts` | ✔ 16 |
| Login shakli, telefon bilan kirish, loginni telefon deb o'qimaslik, parol uzunligi; 10 ta noto'g'ri parol; kod 5 daqiqa, 5 urinish, bir marta, daqiqasiga bir marta yuborish; sessiya 12 soat faolsizlik va 30 kun | `modules/identity/sign-in-rules.test.ts` | ✔ 28 |
| Raqam qayerga boradi (bo'sh, o'zida bor, telegramsiz yozuvga qo'shish, boshqa akkauntda, tarixi bor odam); ustada login va parol yo'q, panel roliga login va birinchi parol; faol egasi qolishi | `modules/identity/staff-rules.test.ts` | ✔ 19 |
| Birinchi kirish (parallel 5 ta so'rov → 1 ta yozuv; soxta `initData` hech kimni yaratmaydi); onboarding; rozilikdan oldin raqam yo'q; egasi qo'shgan usta → usta qismi va bitta yozuv; admin yozgan mijoz o'z yozuvini saqlaydi; boshqa akkauntning raqami rad etiladi; bitta bo'sh raqamni ikki kishi bir vaqtda → bittasi; bitta xodim yozuviga ikki kishi bir vaqtda → bittasi; bloklangan xodim → mijoz | `modules/identity/tma.test.ts` | ✔ 14 |
| Login va telefon bilan kirish; noto'g'ri parol va noma'lum login bir xil javob; Argon2id; usta va bloklangan panelga kirmaydi; 10 urinishdan keyin to'g'ri parol ham kutadi, 15 daqiqadan keyin ochiladi; 2-qadam (Telegram'siz, bot yetmasa, qayta yuborish, eski kod ishlamaydi, 5 noto'g'ri kod, 5 daqiqa, bir marta, kod paytida bloklangan); sessiya muddatlari, bloklashda va rol olinganda tugashi, bazada faqat xesh | `modules/identity/staff-auth.test.ts` | ✔ 20 |
| Faqat egasi boshqaradi (admin, rahbar, usta — `forbidden`, audit ham); qo'shish qoidalari, login band, mijoz → xodim (o'sha yozuv), xodimning raqami band; audit parolsiz yoziladi; rollar o'zgarishi auditda oldin va keyin bilan; oxirgi faol egasi; o'zini bloklash; bloklash va yangi parol sessiyalarni yopadi; Telegram tasdiqlagan raqam o'zgarmaydi; birinchi egasi | `modules/identity/staff.test.ts` | ✔ 21 |
| Audit yozuvini o'zgartirib ham, o'chirib ham bo'lmaydi (xom SQL bilan ham) | `db/audit-log.test.ts` | ✔ 2 |
| 0-bosqich qoidalari: pul, vaqt, telefon, davlat raqami | `lib/*`, `shared/*` | ✔ 100 |

Testlar soni: 310 ta (12 fayl), hammasi yashil.

Testlar ikkita haqiqiy xatoni topdi va ular tuzatildi:
- noto'g'ri urinishlar oynasi chegarasida 15 daqiqa avvalgi urinish hali ham sanalardi (`>=` o'rniga `>`);
- `staff.create` huquq yo'qligini Promise rad etish o'rniga sinxron xato bilan bildirardi.

## 4. Tekshiruvlar

```
npm run typecheck    → 4 workspace, xatosiz
npm run lint         → xatosiz (chegaralar bilan)
npm test             → 12 fayl, 310 test, hammasi o'tdi
npm run build        → server, tma, admin
npm run check:bundle → birinchi ochilish: client, master, staff — 102.4 KB gzip (byudjet 200);
                       shrift 22.4 KB (byudjet 24); OK
npm run check        → exit 0
npm run format:check → hamma fayl Prettier uslubida
npm audit --omit=dev → bajarilmadi: registr ikki marta ECONNRESET qaytardi
```

## 5. Qo'lda tekshiruv

| Tekshiruv | Qayerda | Natija |
|---|---|---|
| Migratsiyalar dev bazaga, `owner:create` | terminal | ✔ egasi yaratildi, auditga `owner.bootstrap` aktyorsiz yozildi |
| Mini App API oqimi: yangi foydalanuvchi → rozilikdan oldin raqam `403` → onboarding → imzolangan kontakt → egasi yozuviga qo'shildi, qism `staff`, panel havolasi | `dev:api` + curl | ✔ |
| Soxta `initData` | curl | ✔ `401` |
| Panel: egasi paroli → `code_sent`; noto'g'ri kod `invalid_code`; to'g'ri kod → sessiya cookie'si (`HttpOnly; SameSite=Strict; Path=/api`, dev'da `Secure` yo'q); `auth.me`; xodim qo'shish; ustaga login → `validation`; boshqa `Origin` → `403`; cookie'siz → `401`; admin 2-qadamsiz kiradi; chiqishdan keyin `401` | curl | ✔ |
| Logda telefon, parol, sessiya tokeni yo'q | `dev:api` logi | ✔ 0 ta moslik (2-qadam kodi faqat dev terminalida, ataylab) |
| T0 och va qorong'i mavzuda, 390×844 | headless Chrome, mobil emulyatsiya | ✔ dizaynga (mijoz PDF, 8-sahifa) mos; "Maxfiylik siyosati" havola emasligi uchun oddiy matn qilindi |
| Xodim qismi (egasi) | headless Chrome | ✔ "Siz egasi sifatida…" va "Panelni ochish"; rol nomi gap ichida kichik harf bilan qilindi |
| Admin: A0, 2-qadam (kod maydoni, 0:59 sanoq), Sozlamalar → Xodimlar, Audit | headless Chrome, 1280×860, haqiqiy kirish | ✔ dizaynga (admin PDF, 6- va 14-sahifa) mos |
| Haqiqiy Telegram: `/start`, menyu tugmasi, `requestContact` imzosi, botga 2-qadam kodi; iOS, Android, Desktop | Telegram | **Bajarilmadi**: `.env` da test bot tokeni yo'q |
| Admin planshet o'lchami, klaviatura bilan ishlash | brauzer | **Bajarilmadi** |

Ekranni tekshirish paytida bitta haqiqiy xato topildi va tuzatildi. Vite'ning qisqa proxy yozuvi `Host`
sarlavhasini almashtirar edi, natijada `Origin` tekshiruvi brauzerdan panelga kirishni rad etdi. curl
testida `Origin` yuborilmagani uchun bu ko'rinmagan. Proxy endi `changeOrigin: false` bilan ishlaydi.
production'da nginx `Host` ni o'tkazishi shart, bu 7-bosqichga yozildi.

Foydalanuvchi bajarishi uchun (test bot bilan):
1. `.env` ga test bot tokeni, tunnel bilan `PUBLIC_URL`; `npm run dev:tma`, `npm run dev`.
2. Botga `/start` yuboring, Mini App'ni oching, T0 ni o'ting va raqamni ulashing. Raqam serverda qabul
   qilinishi kerak: shu bilan Telegram kontakt imzosining formati tasdiqlanadi.
3. `npm run owner:create` dagi raqam o'zingizniki bo'lsa, Mini App'da "Panelni ochish" ko'rinadi.
4. Panelga egasi bilan kiring: kod botga kelishi kerak.

## 6. Rejadan chetga chiqishlar

PLAN 22-bo'limda batafsil yozilgan:

- **Outbox va fon ishlari 3-bosqichga o'tdi.** 2-qadam kodi outbox'siz, darhol yuboriladi, shuning uchun
  outbox, rejalashtiruvchi va `jobs` ning 1-bosqichda foydalanuvchisi qolmadi.
- **Huquq use-case ichida tekshiriladi.** Admin route'i ruxsatni e'lon qilmaydi.
- **Kirish uchun biznes-qoidalar qo'shildi.** Telefon bilan kirish (dizayn talabi), loginda harf
  majburiyligi, urinishlarni odam bo'yicha sanash.
- **`login_failures` jadvali qo'shildi.** Rejada yo'q edi.
- **Bazadagi "login ⇔ parol" cheklovi olib tashlandi.**
- **TZ'dagi "mijozga daqiqasiga 60" alohida qilinmadi.** Uning o'rnida IP bo'yicha daqiqasiga 120 cheklov.
- **T13 ning til qismi 3-bosqichdagi profilga o'tdi.** Til T0 da tanlanadi, endpoint tayyor.
- **Dev'dagi `?shell=` olib tashlandi.** Mini App'da qismni faqat server aytadi.

## 7. Ma'lum kamchiliklar va ochiq savollar

- **Telegram kontakt imzosi faqat mustaqil kutubxona bilan sinalgan.** Haqiqiy Telegram javobi format
  bo'yicha kutilgandek bo'lishi kerak, lekin bu hali tasdiqlanmagan (5-bo'lim, 2-band). Agar farq
  qilsa, botga keladigan `contact` xabari zaxira yo'l sifatida qo'shiladi.
- **Ega o'zining Telegram akkauntini bog'lamaguncha panelga kira olmaydi** (`two_factor_unavailable`).
  `owner:create` buni aytadi.
- **Admin panel faqat och mavzuda.** Qorong'i mavzudagi ma'noli ranglar hali tanlanmagan (DESIGN 9).
- **`npm audit` natijasi yo'q** (tarmoq xatosi). 0-bosqichda production bog'liqliklarida 0 ta edi.

## 8. Keyingi bosqichga ta'sir

2-bosqich (ma'lumotnomalar va sozlamalar) quyidagilarga tayanadi:
- `requirePermission(actor, 'settings.write')`;
- audit;
- Sozlamalardagi to'rtta bo'sh tab (prays, bokslar, ish vaqti, markalar);
- rozilik versiyasi va maxfiylik siyosatining manzili `settings` ga ko'chadi, T0 dagi matn havolaga
  aylanadi.

3-bosqich outbox va rejalashtiruvchini o'zi bilan olib keladi.
