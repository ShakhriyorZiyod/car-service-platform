# Bosqich 2 — Ma'lumotnomalar va sozlamalar: hisobot

| | |
|---|---|
| Sana | 2026-11-18 |
| Holat | Qabulga tayyor. Qo'lda tekshiruvning bir qismi qolgan (3-bo'lim) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 2 |

## 1. Qilingan ish

| Qism | Nima qilindi |
|---|---|
| Baza | Migratsiya `0003_workshop_and_catalog`: `settings`, `work_hours`, `holidays`, `boxes`, `box_service_types`, `car_brands`, `car_models`, `service_types`, `services`, `service_excludes`, `service_prices`, `cancel_reasons` (CHECK va unique indekslar bilan) |
| `workshop` | `domain/working-time.ts` (`workIntervals`, `addWorkMinutes`, `workMinutesBetween`), `work-week.ts`, `settings.ts` (standart qiymatlar); `app/`: sozlamalar, ish vaqti va bayramlar, bokslar; hammasi faqat egasiga, audit bilan |
| `catalog` | `domain/price-matrix.ts`, `excludes.ts`; `app/`: markalar va modellar, ish turlari va zonalar, prays-matritsa (bir ish turining hamma katagi birga, faqat o'zgargan kataklar auditga) |
| `identity` | `bootstrap` ga `workshop` qo'shildi; rozilik versiyasi endi sozlamalardan (`consent.ts` o'chirildi) |
| Seed | `npm run seed:reference` (TZ 14.1, 14.2, 14.4; faqat bo'sh jadvalga, qayta ishlatish xavfsiz), `npm run seed:demo` (faqat dev: ish vaqti, 4 boks, narxlar, demo xodimlar) |
| Admin | Sozlamalar tab'lari: Prays va me'yorlar (A12), Bokslar, Ish jadvali va bayramlar, Markalar va modellar, Ustaxona; tab'lar `lazy`; yon panelda ustaxona nomi; audit jurnali o'qiladigan matn bilan |
| Mini App | T0 da "Maxfiylik siyosati" siyosat havolasi kiritilgach havolaga aylanadi |
| Umumiy | `formatDuration`, `RULE_LIMITS`, `BODY_CLASSES` va boshqa lug'at, `name_taken` xato kodi |

## 2. Tekshiruvlar

- `npm run check` (typecheck, lint, test, build, check:bundle): **yashil**, `format:check` ham; `npm audit --omit=dev`: 0 ta zaiflik. Mini App birinchi ochilish 102.9 KB gzip (byudjet 200).
- Testlar: 510 ta o'tdi (oldin 310), shundan `workshop` 96, `catalog` 56, baza kafolatlari 24, seed'lar 15, `formatDuration` 10.
- Qo'lda (headless Chrome, `_test` bazada): hamma yangi tab och mavzuda, uz va ru; bo'sh bazadan ish turi → zona → narx → marka/model → boks → ish vaqti → sozlamalar yo'li; narx o'zgarishi, `UnsavedBar`, vaqtsiz narx bloklanishi; noto'g'ri ish vaqti qatori belgilanishi; `http://` havolasi rad etilishi; audit matnlari; T0 da havola (och va qorong'i).

## 3. Bajarilmadi / qolgan

- Qo'lda: admin planshet o'lchami, klaviatura bilan ishlash, Telegram Desktop, haqiqiy Telegram'da T0 dagi siyosat havolasi (`openLink`) — bajarilmadi. Rahbar va administrator rolida yon paneldagi ustaxona nomi alohida ko'rilmadi.
- `GET /api/admin/cars/unmapped` va `POST .../map` 3-bosqichga ko'chdi (`cars` jadvali o'sha yerda keladi).
- Haqiqiy Telegram'dagi 1-bosqich tekshiruvi (bosqich-1.md, 5-bo'lim) hamon ochiq.

## 4. Qarorlar (22-bo'limga yozilgan)

- `seed:reference` har guruhni faqat bo'sh jadvalga yozadi; egasi tahrir qilgan narsa qaytib kelmaydi.
- `cancel_reasons.applies_to`: `client` — mijoz ham, xodim ham; `staff` — faqat xodim; `system` — faqat tizim.
- Narx katagi yo'q bo'lsa, zona shu sinfga taklif qilinmaydi; "Boshqa" (`is_custom`) zonaning narxi doim `null`.
- Me'yoriy vaqt daqiqada kiritiladi va soat/daqiqada ko'rsatiladi ("ish kuni" hisobi yo'q, dizayndan farq).
- `identity` endi `workshop` ga bog'liq (rozilik versiyasi, bootstrap): 4.2-jadval yangilanadi.
- Egasining har bir sozlama yozuvi auditga tushadi; o'zgarmagan saqlash yozilmaydi.
- Siyosat va xarita havolalari faqat `https://`.

## 5. Foydalanuvchi uchun

1. Dev bazada: `npm run db:migrate` allaqachon qo'llangan; `npm run seed:reference`, so'ng xohlasangiz `npm run seed:demo`.
2. Eslatma: sessiya davomida `apps/tma/.env.local` vaqtincha o'zgartirildi va asl holiga qaytarildi; `_test` baza ichida demo ma'lumot qolgan bo'lishi mumkin (testlar uni tozalaydi).
