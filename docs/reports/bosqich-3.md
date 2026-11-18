# Bosqich 3 — Garaj va bron (mijoz): hisobot

| | |
|---|---|
| Sana | 2026-11-18 |
| Holat | Kod va avtomatik tekshiruvlar tayyor. Haqiqiy Telegram va qurilmalardagi tekshiruv qolgan (4-bo'lim) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 3 |

## 1. Natija

Mijoz botdagi Mini App'da mashinasini garajga qo'shadi, zonalarni tanlab narxni ko'radi, bo'sh vaqtni
tanlaydi va ariza yuboradi. Slot bazada himoyalangan: bitta boksda ikki bron kesishmaydi. Admin va ega
xabar oladi, mijoz arizasini kuzatadi, bekor qiladi yoki vaqtni ko'chirishni so'raydi. Administrator
qo'ng'iroq qilmagan ariza belgilangan muddatdan keyin o'zi bekor bo'ladi, boks bo'shaydi va mijozga
xabar ketadi.

## 2. Qilingan ish

| Qism | Nima qilindi |
|---|---|
| Baza | Migratsiyalar 0004 (`order_number_seq`, 1001 dan), 0005 (`status_history`, `outbox`, `cars`, `orders`, `order_items`, `order_calls`, `bookings`, `users.reminders_enabled`), 0006 (`bookings_no_overlap` EXCLUDE) |
| Platforma | `platform/outbox.ts`, `status-history.ts`, `ports.ts` (`StaffDirectory`); `jobs/loop.ts`, `outbox-worker.ts`, `scheduler.ts`; `notifications/types.ts` va uz/ru matnlari; `bot/delivery.ts` da xabar yuboruvchi; `main.ts` va `dev:api` da ishga tushiriladi |
| `garage` | Mashina qo'shish, o'zgartirish, arxivlash; raqam normallashtirish va mijoz ichida unique; "Boshqa" model; faol arizali mashinani arxivlab bo'lmaydi |
| `booking` | `domain/slots.ts`: kunlar, vaqtlar, eng yaqin bo'sh vaqtlar, mijoz yuborgan vaqtni tekshirish; `reserve(tx)`, `release`, `reservations` |
| `orders` | `domain/`: holat mashinasi (9.1 ning hammasi), narx va davomiylik, ushlab turish; `app/`: `quote`, `availability`, `slots`, `create` (idempotent), ro'yxat, kuzatuv, bekor qilish, ko'chirish so'rovi, `expireHolds` |
| `catalog`, `workshop` | `offers` (zonalar va narx sinf bo'yicha), mijoz katalogi (bekor qilish sabablari bilan); `hours.calendar`, `boxes.eligible`, `createWorkTime`, `longestWorkdayMinutes` |
| `identity` | `tma.client` (faqat mijoz, rozilik shart), `updateProfile` (til, ism, eslatmalar), xodimlar katalogi |
| API | `client.*` guruhi (13 ta marshrut), yangi xato kodlari: `phone_required`, `plate_taken`, `car_has_active_orders`, `service_unavailable`, `slot_unavailable`, `slot_taken`, `invalid_transition` |
| Mini App | T1, bo'sh garaj, T2, T3, T4 (bo'sh vaqt yo'q holati bilan), T5, T8, T9, T6 (asosiy qismi), T13; Telegram `BackButton`, oflayn banner, kechikkan skelet, qoralama CloudStorage'da, `?order=<id>` havolasi |

## 3. Biznes-qoidalar va testlar

Server testlari: **841 ta** (oldin 510), hammasi o'tdi. Yangi fayllar:

| Qoida | Test fayli | Soni |
|---|---|---|
| Slotlar: qadam, `minLead`, ufq, tanaffusni kesib o'tish, yopilishgacha ulgurmaslik, ko'p kunli ish (yakshanba va bayramni o'tkazib), bir necha boks, `[)` chegarasi, eng yaqin vaqtlar, mijoz vaqtini tekshirish | `booking/slots.test.ts` | 34 |
| Holat mashinasi (har holatdan har holatga, har rol bilan), narx va excludes, davomiylik va ko'p kunlilik, ushlab turish (tungi bron, "javobsiz", muddat) | `orders/orders-rules.test.ts` | 236 |
| Yaratish (nusxa, tarix, xabarlar), idempotentlik (ketma-ket va parallel), 100 parallel so'rov → aynan boks soniga teng ariza, ikkinchi boks, narx nusxasi, telefonsiz rad, birovning mashinasi, bekor qilish (sabab qoidalari, holatlar, boksni qaytarish), ko'chirish so'rovi, `expire-holds` (bir marta, qaytarilgan vaqt, `hold ≥ starts`, tungi, tasdiqlangan) | `orders/orders.test.ts` | 36 |
| Mashina: sinf modeldan, raqam shakli, unique, arxiv, birovning mashinasi | `garage/garage.test.ts` | 13 |
| Baza: EXCLUDE, `[)`, `released_at`, CHECK lar, bitta faol bron, `number` ketma-ketligi | `db/bookings.test.ts` | 12 |

Testlar bitta haqiqiy xatoni topdi: tranzaksiya ichida parallel so'rovlar (`Promise.all`) `pg` 9 da xato
bo'ladi; hammasi ketma-ketga o'tkazildi (PLAN 22).

## 4. Tekshiruvlar

```
npm run check        → typecheck, lint, 841 test, build, check:bundle: exit 0
check:bundle         → birinchi ochilish: client 116.3 KB gzip (byudjet 200), master 107.2, staff 107.3
```

Qo'lda (headless Chrome, 390×844, `_test` bazada, demo ma'lumot bilan):

| Tekshiruv | Natija |
|---|---|
| Bo'sh garaj → mashina qo'shish → zonalar → sana va vaqt → chek → yuborish → buyurtma | ✔ (haqiqiy HTTP API orqali) |
| Bekor qilish (sabab bilan), ko'chirish so'rovi, holat tarixi | ✔ |
| Och va qorong'i mavzu, profil, rus tili | ✔ |
| Konsolda xato | yo'q |
| Android va iOS'da yordamsiz o'tish (TZ 16.4), Telegram Desktop | **Bajarilmadi** |
| Haqiqiy botdan xabarlar (outbox worker, tugmalar), `BackButton`, CloudStorage qoralamasi | **Bajarilmadi**: `.env` da test bot tokeni yo'q |
| Admin paneldagi o'zgarishlar | yo'q (3-bosqichda panel o'zgarmadi) |

## 5. Rejadan chetga chiqishlar

PLAN 22-bo'limda yozilgan (2026-11-18, to'qqiz qator). Asosiylari:

- `GET /api/admin/cars/unmapped` va `POST .../map` 3-bosqichga ko'chgan edi, lekin qilinmadi: ular admin
  mijoz kartasi bilan 4-bosqichga o'tdi (PLAN 18 va 22).
- Xodimlarga xabar adminlar va egasiga boradi, rahbarga emas.
- Zonalar bir-birini chiqarsa server rad etadi, jimgina olib tashlamaydi.

## 6. Ma'lum kamchiliklar

- Qorong'i mavzudagi ma'noli ranglar (holat chipi) hali tanlanmagan (DESIGN 9): chip qorong'i
  mavzuda ham och fonda chiqadi.
- Telefon raqam Telegram `requestContact` imzosi hamon haqiqiy Telegram'da sinalmagan (1-bosqich
  hisoboti, 5-bo'lim).
- T6 da zonalar holati ("Tayyor / Jarayonda / Navbatda") yo'q: vazifalar 5-bosqichda keladi.

## 7. Foydalanuvchi bajarishi uchun

1. `.env` ga test bot tokeni va tunnel `PUBLIC_URL`; `npm run dev:tma`, `npm run dev`.
2. Panelda Sozlamalar: ish vaqti, bokslar va narxlarni kiriting (yoki `npm run seed:demo`), keyin botda
   "birinchi kirish → mashina → bron" yo'lini Android va iOS'da o'ting.
3. Ariza yuborilganda adminga (egasiga) va mijozga xabar kelishini tekshiring.
