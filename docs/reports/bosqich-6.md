# Bosqich 6 — Topshirish va to'lov: hisobot

| | |
|---|---|
| Sana | 2026-11-18 |
| Holat | Kod va avtomatik tekshiruvlar tayyor. Haqiqiy Telegram (botdagi baho tugmalari), haqiqiy planshet va Telegram Desktop o'lchamida qo'lda tekshiruv qolgan (5-bo'lim) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 6 |

## 1. Natija

Tayyor mashina panelda topshiriladi (A8): kim nima qilgani, ishning oldin va keyin fotolari, chegirma, bitta
usul yoki aralash to'lov, fiskal chek raqami va bitta tugma bilan checkout. To'lovlar, chek va "Bajarildi"
holati bitta tranzaksiyada yoziladi, mijozga rahmat va 1–5 baho tugmalari bilan xabar ketadi. Mijoz Mini
App'da natijani ko'radi (T12): fotolar, to'lov, chek raqami, baho va izoh. "Bugun" ekranida tekshiruvdagi
hisobotlar va bugungi kassa bor. Egasi xato tanlangan to'lov usulini tuzata oladi (audit bilan).

## 2. Qilingan ish

| Qism | Nima qilindi | Asosiy fayllar |
|---|---|---|
| Baza | Migratsiya 0009: `payments`, `fiscal_receipts` (`order_id` va `request_id` unique), `reviews` (reyting 1–5 CHECK) | `apps/server/src/db/migrations/0009_payments_and_reviews.sql`, `db/schema/{payments,orders}.ts` |
| `orders` | Chegirma (foiz yoki summa, sabab, admin limiti, egasi chegarasiz), bandlar o'zgarganda qayta hisob, ish boshlangach narxsiz bandga narx, `checkoutState` va `completeInside` (`completed`, `order.completed` xabari), baho; ariza ko'rinishiga `discount`, `review`, `canRate`, `canComment`, `items[].totalIfApproved`; admin amallariga `canDiscount`, `canPriceItems`, `canCheckout` | `modules/orders/domain/{discount,review,staff-actions}.ts`, `app/{admin-orders,orders,extras,views,totals}.ts` |
| `payments` (yangi) | Topshirish ma'lumoti, checkout (idempotent, bir martalik), to'lov usulini tuzatish (egasi), mijozga natija, kunlik kassa; `FiscalProvider` porti va `manual` implementatsiyasi | `modules/payments/` |
| `tasks` | `workOf`: qabul qilingan vazifalar, usta, "oldin" fotolar va qabul qilingan urinishning "keyin" fotolari | `modules/tasks/app/tasks.ts` |
| `dashboard` (yangi) | `admin.today` endi shu yerda: `orders.today` + tekshiruvdagi hisobotlar + bugungi kassa | `modules/dashboard/` |
| API | 7 ta yangi marshrut: `admin.setDiscount`, `admin.priceItem`, `admin.handover`, `admin.checkout`, `admin.correctPayment`, `client.orderResult`, `client.review`; `admin.today` javobi kengaydi | `packages/shared/src/{routes,contract,vocabulary}/` |
| Bot | `order.completed` (uz, ru): summa, chek raqami, bitta qatorda 1–5 yulduz (`rate:<n>:<orderId>`), "Arizani ochish"; bosilgach tugmalar olinadi | `notifications/`, `bot/{delivery,texts}.ts`, `modules/orders/bot/handlers.ts` |
| Admin | A8 (`/orders/:id/handover`), "Topshirish va kassa" ro'yxati (`/handover`), A6 ga hisobotlar va kassa bloki, ariza sahifasida "Topshirish"/"To'lov" tugmasi va chegirma qatori; ishlatilmay qolgan `ComingSoon` olib tashlandi | `apps/admin/src/features/{handover,today,order}/`, `ui/CashCard.tsx` |
| Mini App | T12 (`ResultSection`): fotolar oldin/keyin, to'lov va chek, baho (yulduz + izoh), "Yana bron qilish"; T6 da chegirma qatori; qo'shimcha ish kartasidagi yangi jami serverdan | `apps/tma/src/shells/client/orders/{ResultSection,OrderDetail,ExtraApproval}.tsx` |

## 3. Biznes-qoidalar va testlar

Server testlari: **1262 ta** (oldin 1175), hammasi o'tdi. 87 ta yangi test:

| Qoida | Test fayli | Soni |
|---|---|---|
| `subtotal` va narxsiz bandlar; chegirma foizini yaxlitlash (half up); admin chegarasi aniq 5% da o'tadi, 1 so'm ortig'i va 5.01% rad; chegara ham yaxlitlanadi; limit 0%; egasi chegarasiz, faqat `subtotal` gacha; bandlar o'zgarganda qayta hisob; kim nima qila oladi (har holat); baho qadamlari (`it.each`) | `orders/money-rules.test.ts` | 41 |
| Checkout shartlari: faqat `ready_for_pickup` (har boshqa holat), `unpriced_items`, `payment_mismatch` (kam, ko'p, aralash), chek raqami (bo'sh, bo'shliq, 65 belgi rad, 64 o'tadi), bitta usul ikki marta, 0 va kasr summa rad, 0 so'mlik ariza to'lovsiz; kassa yig'indisi | `payments/checkout-rules.test.ts` | 24 |
| Use-case'lar (haqiqiy PostgreSQL): checkout hammasi bitta tranzaksiyada (to'lovlar, chek, holat, tarix, outbox, audit); `payment_mismatch` va chek raqamisiz hech narsa yozilmaydi; `in_work` dan `invalid_transition`; narxsiz band narx qo'yilguncha to'sadi, narx bir marta; rahbar to'lay olmaydi; bir xil `requestId` bitta natija (ketma-ket va parallel); ikki xil parallel checkout — bittasi o'tadi; kalit boshqa arizaga ishlamaydi; usulni faqat egasi tuzatadi, summa qoladi, auditda; **kassa bugungi to'lovlar yig'indisiga so'mgacha teng**, kechagi pul kirmaydi, rahbarga `null`; chegirma use-case'i (admin 5%, egasi ko'proq, rahbar yo'q, yakunlangandan keyin yo'q, sozlamadagi limit); qo'shimcha ishga rozilikda foiz o'sadi, summa qoladi; bandlarni tahrirlashda qayta hisob; baho (faqat `completed`, faqat egasi, bir marta; botdagi yulduzga ilovada izoh); mijozga natija va egalik; usta nomlari va kutish vaqti | `payments/payments.test.ts` | 22 |

Eski testlardan ikkitasi (`admin-orders.test.ts`, `actions` shakli) yangi uchta bayroq bilan yangilandi.

Bosqich davomida topilgan xatolar (hammasi tuzatildi):

1. Qo'shimcha ishga rozilikda foizli chegirma o'smasdi: `extras` faqat narxni qo'shib, chegirma summasini eski holda qoldirardi (PLAN 11 bilan solishtirganda topildi; endi `retotal` va test).
2. Mijoz ilovasi qo'shimcha ish kartasida yangi jamini o'zi hisoblardi (`total + narx`): chegirmali arizada noto'g'ri bo'lardi. Endi serverdan (`totalIfApproved`, test bilan).
3. "Ish boshlangach 'Boshqa' zonaga narx qo'yib bo'lmaydi" — bunday ariza checkout'dan hech qachon o'tmasdi. `admin.priceItem` qo'shildi (22-bo'lim).
4. A8 jadvalida "Narx, so'm" sarlavhasi o'ngga tekislanmagan edi (brauzerda topildi).
5. "Bugun" da yon ustun qo'shilgach kelishlar jadvali torayib, "1-boks" ikki qatorga bo'linardi; yon ustun 320 px qilindi (brauzerda topildi; tuzatishdan keyin qayta skrinshot olinmadi).

## 4. Tekshiruvlar

```
npm run check        → typecheck, lint, 1262 test (39 fayl), build, check:bundle: exit 0
npm run format:check → toza (oxirgi 4 fayl prettier bilan tuzatilgandan keyin)
check:bundle         → birinchi ochilish: client 123.4 KB gzip (byudjet 200), master 120.7, staff 110.4; raqam shrifti 22.4 KB (24)
```

`npm audit` bu bosqichda ishga tushirilmadi (yangi paket qo'shilmadi).

## 5. Qo'lda tekshiruv

Headless Chrome (CDP), `_test` bazada, haqiqiy HTTP API orqali. Fixture: bugun ertalab bajarilgan 3 ta
ariza (biri "Boshqa" zonali va topshirishga tayyor, biri tekshiruvda, biri yakunlangan va botdagidek 4
yulduz bilan baholangan). Haqiqiy bot ishga tushirilmadi.

| Tekshiruv | Qayerda | Natija |
|---|---|---|
| **Aralash to'lov planshetda (PLAN)** | Admin (`demo-admin`), 1024×768 da sahifa ko'rinishi; to'lovning o'zi 1360×900 da | Qisman ✔: 1024 px da sahifa yonga chiqmaydi, hamma maydon ko'rinadi; to'lov oqimi esa noutbuk o'lchamida bosildi, haqiqiy planshetda emas |
| A8 oqimi: "Boshqa" ga narx (450 000), 6% chegirma rad ("limitingizdan katta"), 5% qabul (−77 500), Aralash: naqd 1 000 000 + terminal 472 500, qoldiq 0, cheksiz tugma yopiq, chek K-000123 → "Bajarildi" | 1360×900, uz | ✔ |
| Egasi to'lov usulini tuzatadi (terminal → o'tkazma): summa o'zgarmadi, auditda `before/after`, kassa qayta taqsimlandi | 1360×900, egasi (2FA bilan) | ✔ |
| A6: tekshiruvdagi hisobot (usta, ariza, daqiqa), "Ishda" kartasida "1 ta hisobot tekshiruvda", bugungi kassa checkout'dan keyin yangilandi (2 ta chek, 2 012 500) | 1360×900, uz va ru | ✔ |
| "Topshirish va kassa" ro'yxati, ariza sahifasida "Topshirish"/"To'lov" tugmasi | 1360×900, uz va ru | ✔ |
| A8 rus tilida | 1360×900 | Qisman: faqat to'langan holat ko'rildi, to'lov formasi ruscha ko'rilmadi |
| **Mijoz botda baho beradi va ilovada izoh yozadi (PLAN)** | Mini App 390×844 | Qisman ✔: botdagi bosish o'rniga bot chaqiradigan use-case (`orders.review`, faqat yulduz) fixture'da chaqirildi; ilovada 4 yulduz ko'rindi (o'zgartirib bo'lmaydi), izoh yuborildi. Telegram'dagi tugmalarning o'zi bosilmadi |
| T12: fotolar oldin/keyin har zona bo'yicha, "To'landi, naqd, o'tkazma", chek raqami, chegirma qatori, 5 yulduz + izoh, "Yana bron qilish" bronni ochadi | 390×844, och va qorong'i | ✔; 44 px dan kichik bosiladigan maydon yo'q |
| Konsolda xato | hamma ko'rilgan ekranda | yo'q |
| T12 rus tilida; Telegram Desktop o'lchami; haqiqiy telefon | | **Bajarilmadi** |
| `order.completed` xabari Telegram'da (uz, ru), tugmalar bosilgach olib tashlanishi | | **Bajarilmadi** (bot ishga tushirilmadi; outbox yozuvi testda tekshirilgan) |

## 6. Rejadan chetga chiqishlar

PLAN 22-bo'limda yozilgan (2026-11-18, 9 qator). Asosiylari:

- Chegirma `payments` da emas, `orders` da: chegirma ustunlari `orders` jadvalida va unga faqat `orders` yozadi (4.4).
- Yangi marshrutlar: `GET /api/admin/orders/:id/handover`, `PUT /api/admin/orders/:id/items/:itemId/price`, `GET /api/client/orders/:id/result` (PLAN 13 yangilandi). Ularsiz A8, "Boshqa" zonali arizaning checkout'i va T12 ishlamaydi.
- "Tekshiruvdagi hisobotlar" bloki "Bugun" ga qo'shildi: 6-bosqich ro'yxatida yo'q, lekin PLAN 13 dagi `admin.today` tavsifida va DESIGN A6 da bor (5-bosqich hisoboti shu bosqichga qoldirgan edi).
- Rahbar "Bugun" da kassani ko'rmaydi (`checkout.write` huquqi yo'q). Rahbarga kassa kerak bo'lsa, bu alohida qaror.

## 7. Ma'lum kamchiliklar va ochiq savollar

- Dizayndagi "Topshirishga tayyor: BYD Han 40 daqiqadan beri kutmoqda" izohi A6 kartasida yo'q (kutish vaqti faqat A8 sarlavhasida).
- Admin limiti chegirma berilgandagina tekshiriladi; keyin bandlar kamaysa, summali chegirma ulushi limitdan oshib qolishi mumkin (PLAN 11 formulasi shunday).
- Summali chegirma `subtotal` 0 ga tushib, keyin qayta oshsa, chegirma 0 bo'lib qoladi (`min(summa, subtotal)`).
- A8 dagi fotolar bitta qatorda; "oldin"/"keyin" farqi faqat kattalashtirilganda yozuvda ko'rinadi.
- Qaytarish (refund) va oldindan to'lov yo'q (v2, PLAN 11).
- Fiskal chek raqami tekshirilmaydi (format, takrorlanish): admin nima yozsa, shu saqlanadi.

## 8. Keyingi bosqichga ta'sir

7-bosqichning qabul ro'yxatidagi butun yo'l (bron → … → checkout → baho) endi kodda to'liq. Xavfsizlik
ko'rigida yangi marshrutlar (`admin.checkout`, `admin.correctPayment`, `client.orderResult`) 8-bo'lim
matritsasi bo'yicha ko'rilishi kerak. Zaxira (`backup.sh`) yangi `payments`, `fiscal_receipts`, `reviews`
jadvallarini ham oladi (`pg_dump` butun bazani oladi).

## 9. Foydalanuvchi bajarishi uchun

1. Test botda: tayyor arizani panelda topshiring, mijoz sifatida kelgan "Rahmat! Ish yakunlandi" xabarida
   yulduzni bosing (uz va ru), keyin ilovada izoh yozing.
2. Planshetda (yoki 1024 px oynada) A8 da aralash to'lovni boshidan oxirigacha o'tkazing.
3. Egasi sifatida to'lov usulini tuzatib, audit jurnalida yozuvni ko'ring.
4. ~~Ochiq savol: rahbar "Bugun" da kassani ko'rishi kerakmi?~~ Javob (2026-11-19): ko'rmaydi, hozirgidek.
