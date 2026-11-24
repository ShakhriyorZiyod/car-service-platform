# Bosqich 9 — Do'kon: hisobot

| | |
|---|---|
| Sana | 2026-11-24 |
| Holat | Qabul qilindi (2026-11-24). Kod, avtomatik tekshiruvlar va brauzerda qo'lda tekshiruv bajarildi; haqiqiy telefondagi Telegram'da (iOS, Android, Desktop) ko'rilmadi (5-bo'lim) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 9 |

## 1. Natija

Mijoz Mini App'dagi "Do'kon" bo'limida katalogni ko'radi, savatga soladi va buyurtma beradi. Buyurtma
berilgan zahoti tovar unga rezerv qilinadi: oxirgi dona ikki mijozga sotilmaydi, bitta pozitsiya yetmasa butun
buyurtma qaytadi. Admin panelda qo'ng'iroq qilib tasdiqlaydi, yig'ish ro'yxati bo'yicha yig'adi ("Yig'ildi"),
mijoz kelganda pulni oladi va topshiradi: to'lov va chek xizmat arizasi bilan bitta kassaga tushadi, tovar
omborda sotuv hujjati bilan chiqadi. Peshtaxtada tezkor sotuv bor. Vaqtida tasdiqlanmagan va muddatida olib
ketilmagan buyurtmalar o'zi bekor bo'ladi, rezerv yechiladi.

## 2. Qilingan ish

| Qism | Nima qilindi | Asosiy fayllar |
|---|---|---|
| Baza | 0014: `shop_orders`, `shop_order_items`, `shop_order_calls`; `payments` va `fiscal_receipts` da `order_id` null, `shop_order_id`, CHECK `num_nonnulls(...) = 1`; `status_history.entity` ga `shop_order`. 0015: `not_picked_up` tizim sababi (ma'lumotnoma bo'sh bo'lmasa) | `apps/server/src/db/migrations/0014_shop.sql`, `0015_not_picked_up_reason.sql`, `db/schema/shop.ts`, `payments.ts` |
| `shop` (yangi modul) | Holat mashinasi (9.5), savat narxi, mijoz: katalog, `quote`, buyurtma (`requestId`), ro'yxat, kuzatuv, bekor qilish; panel: navbat va qidiruv, qo'ng'iroq (tasdiq, javobsiz — ushlab turish uzayadi, rad — sabab bilan bekor), "Yig'ildi", bekor qilish, chegirma, checkout, tezkor sotuv, peshtaxta uchun tovarlar; `shop-expire` vazifasi | `modules/shop/{domain/shop-order.ts, app/shop.ts, http/routes.ts}`, `index.ts` |
| `stock` | Do'kon uchun: katalog (mashhurlik — oxirgi 30 kun sotuvi, tugaganlar oxirida), karta, `availability` va `maxQty` (aniq qoldiq emas), rezerv (`UPDATE ... WHERE on_hand - reserved >= qty`, `product_id` tartibida), rezervni yechish, sotuv hujjati (rezervdan yoki bo'sh qoldiqdan) | `modules/stock/app/shop-stock.ts`, `domain/stock.ts` |
| `payments` | Umumiy `recordInside` (to'lov qatorlari va chek, ikkala tur uchun); xizmat checkout'i ham shu orqali | `modules/payments/app/payments.ts`, `domain/checkout.ts` |
| `workshop` | Sozlamaga `shopPickupHours` (72, 1–336) | `domain/settings.ts`, `vocabulary/limits.ts` |
| `dashboard` | `admin.today` da `shop` (yangi va olib ketishni kutayotganlar soni; `shop.read` bo'lmasa `null`); kassa ikkala turni qo'shadi | `modules/dashboard/app/dashboard.ts` |
| `identity` | `shop.read` (admin, rahbar), `shop.write` (admin), egasida hammasi | `domain/roles.ts`, `vocabulary/roles.ts` |
| API | Mijoz: 8 ta (`client.shop*`); panel: 9 ta (`admin.shopOrders`, `admin.shopOrder`, `admin.shopOrderCall`, `admin.shopOrderReady`, `admin.cancelShopOrder`, `admin.setShopDiscount`, `admin.shopCheckout`, `admin.quickSale`, `admin.saleProducts`) | `packages/shared/src/{routes,contract,vocabulary}/` |
| Bot | Mijozga `shop.created`, `shop.confirmed`, `shop.ready` (muddat va manzil bilan), `shop.cancelled`, `shop.completed`; adminlarga `staff.shop_order_new`, `staff.shop_client_cancelled`; tugma Mini App'da `?shopOrder=` ni ochadi | `notifications/render/shop.ts`, `notifications/types.ts`, `bot/delivery.ts` |
| Mini App | 5 bandli menyu (Bosh, Garaj, Do'kon, Buyurtmalar, Profil), Bosh'da do'kon kartasi; T7 katalog (qidiruv, toifalar, "Faqat mavjud", saralash, savat paneli), T10 mahsulot (fotolar, narx, mavjudlik, hajm, artikul, manzil), T11 savat (server narxi, eskirgan va yetmaydigan qatorlar, olib ketish usuli, izoh), "Buyurtma qabul qilindi"; T9 xizmat va do'kon buyurtmalari birga; do'kon buyurtmasi ekrani (holat, tovarlar, muddat, to'lov va chek, tarix, bekor qilish). Savat CloudStorage'da. Do'kon alohida chunk (`React.lazy`) | `apps/tma/src/shells/client/shop/*`, `lib/cart.ts`, `ui/client-parts.tsx`, `ClientShell.tsx`, `orders/OrdersScreen.tsx`, `home/HomeScreen.tsx` |
| Admin | A9 (`/shop`): tab'lar, qidiruv, navbat kartalari, buyurtma paneli — qo'ng'iroq tugmalari, yig'ish ro'yxati belgilari va "Yig'ildi", chegirma, to'lov (bitta usul yoki aralash) va chek, bekor qilish, qo'ng'iroqlar va tarix; tezkor sotuv oynasi; menyuda "Do'kon buyurtmalari"; "Bugun"da do'kon bloki; yuqori qidiruvda do'kon raqami; Sozlamalar → Ustaxona'da olib ketish muddati | `apps/admin/src/features/shop/*`, `i18n/shop.{uz,ru}.ts`, `layout/{Sidebar,Topbar}.tsx`, `features/today/TodayPage.tsx` |

## 3. Biznes-qoidalar va testlar

| Qoida | Test fayli | Natija |
|---|---|---|
| Holat o'tishlari jadvali (kim, qayerdan, qayerga), panel tugmalari | `test/modules/shop/shop-rules.test.ts` | ✔ |
| Avtomatik bekor sharti (`hold_until`, `pickup_until`), muddat soatlari | `shop-rules.test.ts` | ✔ |
| Savat narxi: sotuvda yo'q, narxsiz, yetmaydi, 10 tadan ko'p; bir xil tovar bitta qator | `shop-rules.test.ts` | ✔ |
| Buyurtma: rezerv, narx nusxasi (narx o'zgarsa buyurtma o'zgarmaydi), mijoz va adminlarga xabar, tarix | `test/modules/shop/shop.test.ts` | ✔ |
| Telefon tasdiqlanmagan mijoz buyurtma bera olmaydi | `shop.test.ts` | ✔ |
| Bir martalik: bir xil `requestId` (parallel ham) bitta buyurtma va bitta rezerv | `shop.test.ts` | ✔ |
| Bitta pozitsiya yetmasa hech narsa rezerv qilinmaydi | `shop.test.ts` | ✔ |
| Oxirgi dona uchun 100 ta parallel buyurtma: bittasi o'tadi, 99 tasi `out_of_stock` | `shop.test.ts` | ✔ |
| Sotuvda yo'q tovarni buyurtma qilib bo'lmaydi | `shop.test.ts` | ✔ |
| Mijoz javobida aniq qoldiq yo'q | `shop.test.ts` | ✔ |
| Birovning buyurtmasi `404` (ko'rish va bekor qilish) | `shop.test.ts` | ✔ |
| Rezerv har bekor qilishda yechiladi: mijoz, admin, rad etilgan qo'ng'iroq, tizim (`no_contact`, `not_picked_up`) | `shop.test.ts` | ✔ |
| Mijoz yig'ilgan buyurtmani bekor qila olmaydi va xodim sababini tanlay olmaydi | `shop.test.ts` | ✔ |
| "Javobsiz" ushlab turishni uzaytiradi | `shop.test.ts` | ✔ |
| Checkout: to'lov, chek, sotuv hujjati va `completed` birga; yig'ilmasdan va summa mos kelmasa rad; takroriy va parallel so'rov bir marta | `shop.test.ts` | ✔ |
| Chegirma admin limitida | `shop.test.ts` | ✔ |
| Kassa ikkala tur yig'indisiga teng | `shop.test.ts` | ✔ |
| Tezkor sotuv: bo'sh qoldiqdan, boshqalarning rezerviga tegmaydi, takrorlansa bir marta | `shop.test.ts` | ✔ |
| Huquqlar: rahbar o'qiydi, usta kirmaydi; raqam bo'yicha qidiruv barcha tab'larda, ism va telefon tab ichida; "Bugun" hisoblagichi | `shop.test.ts` | ✔ |
| Sozlamalar standarti (`shopPickupHours` 72), huquqlar matritsasi, ma'lumotnoma (10 ta sabab) | `workshop-rules.test.ts`, `identity/roles.test.ts`, `db/seeds.test.ts` | ✔ |

Testlar soni: 1493 ta (44 fayl), hammasi yashil; do'kon testlari 67 ta (`shop-rules` va `shop`).

## 4. Tekshiruvlar

```
npm run check (2026-11-24, oxirgi o'zgarishdan keyin)
  typecheck     → xatosiz (shared, admin, server, tma)
  lint          → xatosiz
  test          → 44 fayl, 1493 test, hammasi o'tdi
  build         → muvaffaqiyatli
  check:bundle  → OK: birinchi ochilish mijoz 128,4 KB, usta 124,8 KB, xodim 114,0 KB gzip (chegara 200);
                  do'kon alohida chunk: ShopTab 4,6 KB + ShopOrderDetail 1,6 KB gzip
```

Oraliq yugurishlarda ikki yiqilish bo'ldi, ikkalasi ham kodda emas: bittasida test 38 daqiqa muzlab qoldi
(kompyuter uyquga ketgan), ikkinchisida `check` ishlab turganda fayl o'zgartirilgan edi. Oxirgi toza yugurish
yuqorida.

## 5. Qo'lda tekshiruv

Test bazasida (`seed:reference`, `seed:demo`, 17 ta mahsulot, uchta holatdagi do'kon buyurtmasi). Mini App
haqiqiy Telegram yo'lida — headless Chrome'da Telegram WebView emulyatsiyasi (CloudStorage, BackButton);
panel — headless Chrome.

| Tekshiruv | Qayerda | Natija |
|---|---|---|
| Bosh: do'kon kartasi, 5 bandli menyu | Mini App, 390 va 420×680, och va qorong'i | ✔ |
| Katalog: toifa chiplari, "Faqat mavjud", qidiruv ("mikro"), saralash ("Ommabop" sotilganini birinchi qo'yadi), "Qo'shish" → − n +, savat paneli summasi | Mini App, ikkala mavzu, uz va ru | ✔ |
| Mahsulot: fotolar yoki o'rinbosar, narx, mavjudlik, hajm, artikul, "Savatda: N ta", "Savatga qo'shish" | Mini App, ikkala mavzu | ✔ |
| Savat: server narxi va jami, − n +, olib ketish usuli, izoh, "Buyurtma berish"; savat CloudStorage'da, buyurtmadan keyin bo'shaydi | Mini App, ikkala mavzu | ✔ |
| "Buyurtma qabul qilindi" → "Buyurtmalarim": xizmat va do'kon buyurtmalari birga, holat chiplari | Mini App | ✔ |
| Do'kon buyurtmasi ekrani: holat izohi, tovarlar, jami, izoh, tarix; yig'ilganida "… gacha olib keting" (72 soat) | Mini App | ✔ |
| Bot havolasi `?shopOrder=`: buyurtma ochiladi, orqaga → Bosh | Mini App, Telegram emulyatsiyasi | ✔ |
| Mijoz bekor qiladi (sabab bilan): holat va sabab, rezerv yechildi (bazada tekshirildi) | Mini App + baza | ✔ |
| Orqaga tugmasi: katalog → Bosh, mahsulot va savat → katalog, buyurtma → ro'yxat | Telegram emulyatsiyasi | ✔ |
| Bosiladigan maydon ≥ 44 px (katalog, savat), gorizontal aylantirish yo'q | 390 va 420 | ✔ |
| A9: tab'lar, qidiruv, navbat kartalari, panel; "Tasdiqladi" → "Yig'ish kerak"; belgilar 1/3 → "Yig'ildi"; to'lov (naqd) va chek → "Topshirildi" | Panel 1366, och va qorong'i; 390 | ✔ |
| Tezkor sotuv: qidiruv, bo'sh qoldiq, miqdor, jami, usul, chek → "Topshirildi", "Peshtaxtada sotilgan" | Panel 1366 | ✔ |
| "Bugun": do'kon bloki (qo'ng'iroq kutayotgan, olib ketishni kutayotgan); kassa ikkala tur: 121 000 + 36 000 = 157 000, 2 ta chek | Panel | ✔ |
| Yuqori qidiruvda do'kon raqami (№13999) → `/shop?tab=done&order=…` | Panel | ✔ |
| Sozlamalar → Ustaxona: "Do'kon buyurtmasini olib ketish muddati, soat" (egasi, 2-qadam kodi bilan) | Panel | ✔ |
| Bot xabarlari (7 tur) uz va ru matni, tugmalari (`shop_order` → Mini App, panel → `shop?order=`) | outbox'dagi yozuvlar render qilindi | ✔ |
| Haqiqiy Telegram (iOS, Android, Desktop) va haqiqiy botga xabar yetishi | — | bajarilmadi |

Tekshiruvda topilib tuzatilganlar:

- Tezkor sotuv bir xil kalit bilan bir vaqtda ikki marta yuborilsa, ikkinchisi ham buyurtma yaratib, tovarni
  sotishi mumkin edi: endi kalit tranzaksiya boshida qulflanadi (`pg_advisory_xact_lock`), test ikki parallel
  so'rov bilan; panel ham qayta urinishda kalitni almashtirmaydi.
- Olib ketish muddati konstanta edi: PLAN'dagidek `settings.rules.shopPickupHours` ga chiqarildi (egasi
  o'zgartiradi), sabab nomidan "72" olib tashlandi ("Muddatida olib ketilmadi").
- Rad etilgan qo'ng'iroqda izoh talab qiladigan sabab izohsiz o'tardi.
- Raqam bo'yicha qidiruv telefon raqamlariga ham mos kelardi: 1–7 xonali raqam endi faqat buyurtma raqami.
- Qorong'i mavzu: yig'ish ro'yxatidagi belgilangan qator (och yashil fonda oq matn) — chap chiziqqa
  almashtirildi; tanlangan toifa chipi va faol karta `--ink` bilan ko'rinmasdi — `--text` ga o'tdi.
- Panel kartalarida ichki chekinish yo'q edi; topshirilgan buyurtmada "Olib ketish: … to'lov olishda" o'rniga
  "Jami".
- Ruscha: hajm nomga qo'shilganda "1 л, 1 l" bo'lib qolardi (hajm bitta tilda yoziladi) — sarlavha faqat nom,
  hajm kartada; "1 товара" → to'g'ri ko'plik.
- Mahsulot ekranida narx kichik chiqardi (`.num` hajmni bosib ketardi).

## 6. Rejadan chetga chiqishlar

PLAN 22-bo'limdagi 2026-11-24 yozuvi (9-bosqich):

- Mijozning do'kon buyurtmalari alohida endpoint'dan keladi, "Buyurtmalarim" ularni xizmat arizalari bilan
  ilovada birlashtiradi (13-bo'limdagi "`GET /api/client/orders` `kind` bilan" o'rniga).
- Katalog sahifalanmaydi (`cursor` yo'q).
- Do'kon to'lovining usulini tuzatish bu bosqichda yo'q.
- Tezkor sotuv mijozsiz (`client_id` null); mijozni tanlash keyinroq.
- Yig'ish ro'yxatida dizayndagi "Javon A-2" (joy) va bo'sh qoldiq ko'rsatilmaydi: mahsulotda joy maydoni yo'q.
- Mahsulot sarlavhasi faqat nom: hajm bitta tilda yoziladi, shuning uchun u nomga qo'shilmaydi, kartada alohida
  ko'rsatiladi (egasi hajmni nomga o'zi yozishi mumkin, demo'dagidek).
- Qorong'i mavzuda tanlangan toifa chipi dizayndagi qora emas, matn rangida (och): `--ink` kartalarga juda yaqin.

## 7. Ma'lum kamchiliklar va ochiq savollar

- Haqiqiy Telegram ilovalarida (iOS, Android, Desktop) ko'rilmadi; Telegram WebView emulyatsiyasida ko'rildi.
- Production'da hali mahsulot ham, narx ham yo'q: egasi Sozlamalar → Mahsulotlar'da kartalarni yaratib, omborga
  kirim qilgandan keyingina katalog to'ladi. Bo'sh katalogda mijoz "Do'kon hozircha bo'sh" ko'radi.

## 8. Keyingi bosqichga ta'sir

10-bosqich ("Mashina bilan birga") `shop_orders.fulfillment = with_service` va `service_order_id` ni ishlatadi:
ustunlar va CHECK tayyor, savatdagi "Qanday olasiz" blokiga ikkinchi variant qo'shiladi, checkout esa
`payments.recordInside` orqali ikkala buyurtmani bitta so'rovda yopadi.
