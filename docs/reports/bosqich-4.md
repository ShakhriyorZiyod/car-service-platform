# Bosqich 4 — Arizalarni boshqarish (admin): hisobot

| | |
|---|---|
| Sana | 2026-11-18 |
| Holat | Kod va avtomatik tekshiruvlar tayyor. Haqiqiy Telegram, planshet va ovozni qurilmada tekshirish qolgan (5-bo'lim) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 4 |

## 1. Natija

Admin har bir arizani panelda tezda ko'radi va hal qiladi: qo'ng'iroq natijasini belgilaydi
(tasdiqladi, javobsiz, rad etdi), vaqtni ko'chiradi, zona va narxni o'zgartiradi, bekor qiladi, "kelmadi"
deb belgilaydi va telefondagi mijozning arizasini qo'lda yaratadi. Jadvalda bokslar kun bo'yicha
ko'rinadi va bokslarni bloklash mumkin. Mijoz tasdiq, ko'chirish, bekor qilish va eslatma xabarini
oladi; qo'ng'iroqsiz qolgan ariza haqida rahbar va egasiga xabar ketadi. Mijozlar bo'limi, ichki
izoh, "Boshqa" model bilan qo'shilgan mashinalarni bog'lash va ma'lumotni o'chirish (egasi) tayyor.

## 2. Qilingan ish

| Qism | Nima qilindi | Asosiy fayllar |
|---|---|---|
| Baza | Migratsiya 0007: `users.internal_note`, `deletion_requested_at`, `anonymized_at` | `apps/server/src/db/migrations/0007_*.sql`, `db/schema/identity.ts` |
| Platforma | `ScheduledTask` porti `platform/ports.ts` ga; `isExclusionViolation`; yangi xabar turlari va uz/ru matnlari: `order.confirmed`, `order.reminder`, `order.rescheduled`, `order.cancelled` (admin sababi bilan), `staff.order_unanswered`, `staff.deletion_requested` | `platform/`, `notifications/` |
| `orders` | `domain/staff-actions.ts` (xodim nima qila oladi), `domain/followups.ts` (SLA va eslatma qoidalari); `app/admin-orders.ts` (ro'yxat, ariza, qo'ng'iroq, bandlar, ko'chirish, bekor qilish, "kelmadi", qo'lda ariza, "Bugun"); `app/tasks.ts` (`call-sla`, `reminders`) | `apps/server/src/modules/orders/` |
| `booking` | `rebook` (ko'chirish va bandlarni o'zgartirish, hammasi yoki hech narsa), `app/schedule.ts` (kunlik jadval, bloklash va olib tashlash), xodim uchun `waiveLead` va `keepStart` | `apps/server/src/modules/booking/` |
| `clients` (yangi modul) | Ro'yxat va filtrlar, karta, yaratish, tahrirlash, ichki izoh, mashina qo'shish, anonimlashtirish | `apps/server/src/modules/clients/` |
| `identity`, `garage`, `catalog` | `identity`: mijoz yozuvlari (yaratish, tahrirlash, anonimlashtirish) va `tma.requestDeletion`; `garage`: `unmapped`, `map`, `createFor`, `listFor`, `anonymize`; `catalog`: xodim katalogi | `apps/server/src/modules/{identity,garage,catalog}/` |
| API | 24 ta admin marshruti (`admin.today`, `orders`, `order`, `createOrder`, `callOrder`, `updateOrderItems`, `rescheduleOrder`, `cancelOrder`, `noShow`, `availability`, `slots`, `schedule`, `createBlock`, `removeBlock`, `clients`, `createClient`, `client`, `updateClient`, `createClientCar`, `anonymizeClient`, `unmappedCars`, `mapCar`, `catalog`, `cancelReasons`) va `tma.requestDeletion` | `packages/shared/src/{routes,contract}/`, `modules/*/http/` |
| Bot | Yangi turdagi xabarlar outbox orqali (uz va ru); bot kodi o'zgarmadi | `notifications/render/` |
| Admin | A6 "Bugun", A1 Kanban (taymer, 15 daqiqalik ogohlantirish, qo'ng'iroq tugmalari, qidiruv), ariza ichida (ishlar, ko'chirish, bekor qilish, "kelmadi"), A7 yangi ariza, A4 jadval ("hozir" chizig'i, bloklash), A10 mijozlar va karta, modelsiz mashinalar. Har 10 soniyada yangilanadi, yangi arizada ovoz. Har ekran alohida (lazy) bo'lak | `apps/admin/src/features/{today,orders,order,new-order,schedule,clients}/`, `ui/`, `layout/NewOrderWatcher.tsx` |
| Mini App | O'zgarmadi (`tma.requestDeletion` marshruti Mini App'da hali ishlatilmaydi) | — |

## 3. Biznes-qoidalar va testlar

Server testlari: **965 ta** (oldin 841), hammasi o'tdi. 124 ta yangi test:

| Qoida | Test fayli | Soni |
|---|---|---|
| Xodim amallari (ruxsat etilgan holatlar, "kelmadi" faqat slot boshlangach, bekor qilish huquqi), qo'ng'iroqsizlik va eslatma qoidalari (ish vaqtida hisoblash, oyna, kalit) | `orders/staff-rules.test.ts` | 38 |
| Rahbar yoza olmaydi va tugma ko'rmaydi; qo'ng'iroq (tasdiq, "javobsiz" ushlab turishni uzaytiradi va qisqartirmaydi, "rad etdi" sababsiz o'tmaydi, faqat yangi arizaga); "kelmadi"; ko'chirish (`slot_taken` bo'lsa eski vaqt qoladi, o'z vaqtiga sirpanish, xodim uchun yaqin vaqt); bandlar (sotilgan narx saqlanadi, admin narxi ustun, ziddiyat, `slot_taken` bo'lsa o'zgarmaydi, `in_work` dan keyin yo'q); bekor qilish (sabab, egasi `in_work` ni bekor qiladi); qo'lda ariza (darhol `confirmed`, Telegramsiz); ro'yxat va qidiruv (`%` oddiy belgi), "Bugun" va taymer; boshqa kunga ko'chirilgan ariza yangi kunda hisoblanadi; `call-sla` va `reminders` | `orders/admin-orders.test.ts` | 49 |
| Bloklash (kesishsa `slot_taken`, chegara tegsa mumkin, mijozga vaqt bo'sh ko'rinmaydi, olib tashlash), kunlik jadval (ko'p kunli ish, bo'shatilgan bron ko'rinmaydi, dam olish va bayram), ruxsatlar | `booking/schedule.test.ts` | 11 |
| Mijozlar: ruxsatlar, qo'lda yaratish, tahrirlash (tasdiqlangan raqam o'zgarmaydi, izoh jurnalga yozilmaydi), ro'yxat va filtrlar (doimiy, 90 kun, Telegramsiz, sahifalash, oxirgi kelish), anonimlashtirish (ariza va to'lov qoladi, raqam bo'shaydi), o'chirish so'rovi (egasiga bir marta), modelsiz mashinalar | `clients/clients.test.ts` | 26 |

Testlar va qo'lda tekshiruv bu bosqichda quyidagi xatolarni topdi (hammasi tuzatildi, har biriga test bor,
blok vaqti va bundle bundan mustasno):

1. Ariza `created_at` bazaning `now()` idan yozilgan edi, soat (`Clock`) bilan mos kelmadi: kutish vaqti va SLA noto'g'ri chiqdi (test topdi).
2. Ko'chirilgan arizaning boshlanishi `max(starts_at)` bilan olingan, qaytarilgan eski bron ham hisobga kirardi: ariza eski, kechroq kunda qolgandek turardi, "Bugun" va mijozning "oxirgi kelish"i noto'g'ri edi (qo'lda tekshiruvda ko'rindi, keyin test yozildi).
3. `admin.slots` xodimga mijozning eng yaqin bron qoidasini qo'llardi, `reserve` esa shu vaqtni qabul qilardi: eshik oldidagi mijozga vaqt ko'rinmasdi (panelni ulashda topildi).
4. Faqat o'qiydigan rolga (rahbar) serverdan "qo'ng'iroq qil, ko'chir, bekor qil" bayroqlari kelardi: panel tugma ko'rsatardi, API `forbidden` qaytarardi (ko'rib chiqishda topildi).
5. Panel blok vaqtini `+05:00` bilan yuborardi, `z.iso.datetime()` buni rad etardi (qo'lda tekshiruvda topildi; panelda test yo'q, v1 qoidasi).
6. `CLIENT_FILTERS` qiymat sifatida `@cs/shared` dan olinib, butun zod shartnomasini mijozlar bo'lagiga tortgan edi (106 KB). Zod'siz `/vocabulary` ga ko'chirildi (8 KB).

## 4. Tekshiruvlar

```
npm run check        → typecheck, lint, 965 test, build, check:bundle: exit 0
npm run format:check → toza
npm audit --omit=dev → 0 vulnerabilities
check:bundle         → birinchi ochilish: client 117.6 KB gzip (byudjet 200), master 108.0, staff 108.2
```

Admin panelda bundle byudjeti yo'q; har ekran alohida bo'lak (eng kattasi `OrderPage` 3.0 KB gzip,
umumiy `index` 106.8 KB gzip).

## 5. Qo'lda tekshiruv

Headless Chrome (Chrome DevTools Protocol), `_test` bazada: demo ma'lumotlar, `egasi` roli bilan, haqiqiy
HTTP API orqali. Haqiqiy bot ishga tushirilmadi.

| Tekshiruv (PLAN dagi ro'yxatdan) | Qayerda | Natija |
|---|---|---|
| Ariza TMA xizmatidan yaratilgach panelda 10 soniya ichida paydo bo'ladi | 1360×900; ariza yaratildi, kartaga ~8 soniya (skript ishga tushirish vaqti bilan) | ✔ |
| Shu paytda ovoz chalinadi | `AudioContext` ni sanovchi bilan almashtirib: bitta signal (2 ton) | ✔ (eshitib bo'lmadi: 6-bo'lim) |
| Kanban: "Tasdiqladi", "Rad etdi" (sababsiz tugma yopiq), "Javobsiz"ning kartaga ta'siri | 1360×900, uz | ✔ |
| 40 daqiqalik qo'ng'iroqsiz ariza: qizil taymer, qizil chegara, yuqoridagi ogohlantirish, "Bugun" da qizil hisoblagich | 1360×900, ru | ✔ |
| Ariza ichida: ko'chirish (yaqin vaqt ham taklif qilinadi), ishlarni o'zgartirish (jami qayta hisoblandi), bekor qilish oynasi | 1360×900, uz | ✔ |
| Yangi ariza: mijozdan "Yangi ariza" → mashina → zona → vaqt → "mijoz tasdiqladi" → `Tasdiqlangan` | 1360×900, uz | ✔ |
| Jadval: "hozir" chizig'i, bloklash (band vaqtga to'g'ri xabar bilan rad), blokni olib tashlash | 1360×900, uz | ✔ |
| Mijozlar: ro'yxat, filtr "Telegramsiz", qidiruv, modelsiz mashinani bog'lash, karta | 1360×900, uz | ✔ |
| Yuqori qidiruv (`A 777`) | 1360×900 | ✔ |
| Planshet o'lchami: sahifa yon tomonga aylanmaydi (Kanban o'z ichida aylanadi), uzun oynada "Saqlash" ko'rinib turadi | 1024×768, ru | ✔ |
| Rus tili: Kanban, Bugun, mijozlar | 1360×900 | ✔ |
| Telegram'dagi xabarlar uz va ru tilida | Matnlar chiqarib o'qildi (7 ta tur, ikki til); botga yuborilmadi | Qisman: matn ✔, yetkazish **bajarilmadi** |
| Konsolda xato | hamma ekranda | yo'q |
| Haqiqiy planshet, Telegram'dagi xabarlar, ovozning eshitilishi, `admin` va `director` rollari bilan kirish | | **Bajarilmadi** |

## 6. Rejadan chetga chiqishlar

PLAN 22-bo'limda yozilgan (2026-11-18, 17 qator). Asosiylari:

- Xodim eng yaqin bron qoidasini chetlab o'tadi (mijoz eshik oldida), panel ham shu vaqtlarni ko'rsatadi.
- Modelsiz mashinalar (`GET /api/admin/cars/unmapped`, `POST .../map`) mijozlar sahifasida: 3-bosqichdan ko'chgan edi, shu bosqichda bajarildi.
- A6 "Bugun" da faqat to'rt hisoblagich va bugungi kelishlar: "tekshiruvdagi hisobotlar" va "bugungi kassa" 5- va 6-bosqichda.
- Kanban faqat jarayondagi arizalarni ko'rsatadi; bekor qilingan va tugaganlar mijoz kartasida.
- Topbar qidiruvi mijozlar emas, arizalarni qidiradi (mijozlarning o'z qidiruvi bor).

## 7. Ma'lum kamchiliklar va ochiq savollar

- Ovoz brauzerda foydalanuvchi sahifani kamida bir marta bosmaguncha chalinmaydi (autoplay qoidasi). Panelni ochgan va bosmagan admin birinchi signalni eshitmasligi mumkin. Haqiqiy brauzerda tekshirilmadi.
- Ko'chirish oynasi ochilganda bugungi kunni ko'rsatadi (arizaning kunini emas).
- Ikki admin bir arizaga bir vaqtda javob bersa, ikkinchisi `invalid_transition` oladi va panel yangilanadi; parallel so'rov testi yozilmadi (qulf `FOR UPDATE` bilan, lekin sinalmagan).
- Panel faqat och mavzuda (DESIGN 6). Qorong'i mavzu tokenlar orqali keyin qo'shiladi.
- `POST /api/tma/me/deletion-request` va egasiga xabar tayyor, lekin Mini App'da uni chaqiradigan tugma yo'q: PLAN 18 4-bosqichga Mini App ishini yozmagan, T13 dizaynida bunday tugma yo'q. Mijoz hozircha so'rovni faqat API orqali yuborishi mumkin. Tugma qaysi ekranda bo'lishini hal qilish kerak.

## 8. Keyingi bosqichga ta'sir

5-bosqich shularga tayanadi: `orders.admin` (ariza ichidagi sahifaga qabul va vazifalar qo'shiladi),
`booking.rebook` (vazifalar bronni qisqartiradi), `ScheduledTask` porti, panelning `ui/` komponentlari
(`StatusChip`, `PlateChip`, `Dialog`, `ReasonDialog`), `NewOrderWatcher`. `admin.today` hisoblagichlariga
"tekshiruvdagi hisobotlar" qo'shiladi.

## 9. Foydalanuvchi bajarishi uchun

1. `.env` ga test bot tokeni; `npm run dev`; panelga egasi bilan kiring.
2. Mini App'dan ariza yuboring: panelda ovoz bilan kartaga tushishini, "Tasdiqladi" bosilganda botga
   xabar kelishini (uz va ru) tekshiring.
3. Planshetda (yoki 1024 px oynada) Kanban, jadval va yangi ariza oqimini ko'zdan kechiring.
4. `admin` va `director` rollari bilan kirib, tugmalar roliga mos ekanini tekshiring.
