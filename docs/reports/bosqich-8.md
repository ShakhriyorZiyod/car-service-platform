# Bosqich 8 — Ombor: hisobot

| | |
|---|---|
| Sana | 2026-11-24 |
| Holat | Qabulga tayyor. Kod, avtomatik tekshiruvlar va panelda qo'lda tekshiruv bajarildi; haqiqiy planshetda va haqiqiy Telegram botida kunlik xabar ko'rilmadi (5-bo'lim) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 8 |

## 1. Natija

Ombor hujjatlar orqali yuritiladi: kirim, hisobdan chiqarish va inventarizatsiya qoralama sifatida yoziladi va
o'tkazilganda qoldiqni o'zgartiradi. Qoldiqni qo'lda o'zgartirib bo'lmaydi: u har doim harakatlar yig'indisiga
teng, harakatlar jurnalini baza o'zgartirishga ham, o'chirishga ham yo'l qo'ymaydi. Kirim o'rtacha tannarxni
qayta hisoblaydi. Tannarxni faqat rahbar va egasi ko'radi. Minimumdan past tovarlar "Bugun" sahifasida
ko'rinadi, adminlar va egasiga botga kuniga bir marta jamlangan xabar ketadi. Egasi Sozlamalarda mahsulot
kartalari, toifalar, fotolar va yetkazib beruvchilarni yuritadi. Do'kon (9-bosqich) shu poydevorga tayanadi.

## 2. Qilingan ish

| Qism | Nima qilindi | Asosiy fayllar |
|---|---|---|
| Reja | Do'kon va ombor rejasi 20-bo'lim tartibida PLAN'ga ko'chirildi: 1.2, 1.3, 4.1–4.4, 7.14, 7.15, 8, 9.5, 9.6, 11, 12, 13, 18 (8–10-bosqichlar), 19, 21 (11–16-savollar), 22; `DESIGN.md` 7–8 | `docs/PLAN.md`, `docs/DESIGN.md` |
| Baza | 0010: `stock_document_number_seq`; 0011: `product_categories`, `products`, `stock_levels`, `suppliers`, `stock_documents`, `stock_document_lines`, `stock_movements`, `media` ga `product_id` va `stock_document_id`; 0012: `stock_movements` ga UPDATE va DELETE ni rad etuvchi trigger | `apps/server/src/db/migrations/0010–0012`, `db/schema/stock.ts`, `db/schema/media.ts` |
| `stock` (yangi modul) | Toifalar (ikki daraja), yetkazib beruvchilar, mahsulot kartalari va fotolari (5 tagacha); hujjatlar: yaratish, tahrirlash va o'chirish (faqat qoralama), o'tkazish (qulf `product_id` tartibida, harakat va qoldiq SQL'da); qoldiqlar ro'yxati, harakatlar jurnali, kam qoldiq; kunlik xabar vazifasi | `modules/stock/{domain,app,http}`, `index.ts` |
| `media` | Ikki yangi ega: mahsulot va ombor hujjati; yangi nakladnoy rasmi eskisining o'rnini oladi | `modules/media/app/media.ts` |
| `dashboard` | `admin.today` javobida `lowStock` (`stock.read` bo'lmasa `null`) | `modules/dashboard/app/dashboard.ts` |
| `identity` | Yangi huquqlar: `stock.read` (admin, rahbar), `stock.write` (admin), `costs.read` (rahbar), `products.write`; egasida hammasi | `domain/roles.ts`, `vocabulary/roles.ts` |
| API | 21 ta yangi marshrut (`admin.stock*`, `admin.products`, `admin.productCategories`, `admin.suppliers` va ularning yozish amallari) | `packages/shared/src/{routes,contract,vocabulary}/` |
| Bot | `staff.stock_low` (uz, ru): 15 tagacha tovar, qolgani soni, "Panelda ochish" omborning "Minimumdan past" filtriga olib boradi | `notifications/`, `bot/delivery.ts` (panel tugmasiga `path`) |
| Admin | A5 (`/stock`: qoldiqlar, hujjatlar, harakatlar jurnali, yetkazib beruvchilar), A11 (`/stock/documents/:id`: kirim, hisobdan chiqarish va inventarizatsiya; skaner Enter bilan qo'shadi), Sozlamalar → Mahsulotlar, A6 da "Omborda kam qoldi"; menyuda "Ombor" | `apps/admin/src/features/{stock,settings/ProductsTab,today}`, `i18n/stock.{uz,ru}.ts` |
| Format | `formatQty`, `formatQtyNumber`, `parseQty`, birlik nomlari (uz, ru) | `packages/shared/src/format/quantity.ts` |
| Seed | `seed:reference`: TZ 14.3 toifalari (10 ta, faqat bo'sh jadvalga); `seed:demo`: yetkazib beruvchi, 17 ta mahsulot, o'tkazilgan kirim (ba'zilari minimumdan past, bittasi tugagan) | `db/seeds/{reference,reference-data,demo,demo-stock-data}.ts` |

## 3. Biznes-qoidalar va testlar

Server testlari: **1356 ta** (oldin 1268), hammasi o'tdi. Yangi va o'zgargan testlar:

| Qoida | Test fayli | Soni |
|---|---|---|
| O'rtacha tannarx (birinchi kirim, keyingisi, nol qoldiqdan keyin, half up); qator harakati: kirim, hisobdan chiqarish (faqat bo'sh qoldiqdan), inventarizatsiya farqi va rezervdan kam sanash; holat (yetarli, kam, tugagan) va minimum chegarasi; hujjat qatorlari (narx faqat kirimda, dona butun, kasr 3 xonagacha, takror va noma'lum mahsulot); mahsulot kartasi qoidalari; miqdorni yozish va o'qish | `stock/stock-rules.test.ts` | 48 |
| Haqiqiy PostgreSQL'da: huquqlar (karta va toifani faqat egasi; hujjatni admin va egasi; rahbar o'qiydi; usta ko'rmaydi); tannarx admin javobida yo'q, rahbar va egasida bor; artikul va shtrix-kod takrorlanmaydi; sotiladigan tovar donada va narxli; harakatdan keyin birlik o'zgarmaydi; toifa ikki daraja; 5 tadan ortiq foto rad, takror yuborish zararsiz; audit faqat o'zgarishda; kirim qoldiq va o'rtacha narxni o'zgartiradi; qoralama nima bo'lishini ko'rsatadi, hech narsani o'zgartirmaydi; o'tkazilgan hujjat o'zgarmaydi va o'chmaydi; **bitta qoralamani parallel ikki marta o'tkazish — bittasi o'tadi**; narxsiz kirim qatori, qatorsiz hujjat, sababsiz hisobdan chiqarish rad; rezervdagini hisobdan chiqarib bo'lmaydi; inventarizatsiya `expected_qty` yozadi, mos sanoq harakat yozmaydi; **100 ta tasodifiy hujjatdan keyin qoldiq harakatlar yig'indisiga teng** (TZ 16.4); harakatni o'zgartirish va o'chirish bazada rad; qoldiq manfiy va rezerv qoldiqdan ko'p bo'lolmaydi; kam qoldiq ro'yxati; kunlik xabar ish vaqtida, kuniga bir marta, har oluvchiga bitta; TZ 14.3 toifalari | `stock/stock.test.ts` | 23 |
| Rol matritsasi (yangi huquqlar; "faqat rahbar va egasi xarid narxini ko'radi"; rahbar ∪ admin = admin + `costs.read`) | `identity/roles.test.ts` | yangilandi |
| `seed:reference` hisobotida `productCategories`, `seed:demo` da `products` va `receipt` | `db/seeds.test.ts` | yangilandi |

Bosqich davomida topilgan xatolar (hammasi tuzatildi):

1. Yangi enum qiymati (`product_photo`) o'sha migratsiyadagi CHECK va indeks shartida ishlatilsa PostgreSQL rad etadi. CHECK'da `purpose::text` bilan taqqoslandi, nakladnoy indeksi olib tashlandi, yagonalikni kod saqlaydi (22-bo'lim).
2. Baza qoralamada ham hisobdan chiqarish sababini talab qilardi, PLAN esa faqat o'tkazishda. CHECK o'tkazilgan hujjatga moslandi (test topdi).
3. Rad etilgan o'tkazish (`insufficient_stock`) panelda ko'rinmasdi: saqlashdan keyin tahrirlagich qayta yig'ilib, xato yo'qolardi. Endi faqat holat o'zgarganda qayta yig'iladi (brauzerda topildi).
4. Qorong'i mavzuda "Kam qoldi" va "Tugagan" qatorlari och fonda oq matn bilan o'qilmasdi. Fon o'rniga chap chiziq qo'yildi (brauzerda topildi).
5. Nakladnoy surati plitkasi sarlavha kartasida juda katta edi; ixcham qilindi. O'tkazilgan hujjatda rasm bo'lmasa, faol bo'lmagan plitka endi ko'rsatilmaydi.
6. "Bugungi harakatlar" uchun klient sanani o'zi hisoblardi (CLAUDE.md'ga zid). "So'nggi harakatlar" bilan almashtirildi.

## 4. Tekshiruvlar

```
npm run check        → typecheck, lint, 1356 test (41 fayl), build, check:bundle: exit 0
prettier --check     → toza
check:bundle         → birinchi ochilish: client 124.7 KB gzip (byudjet 200), master 121.7, staff 111.3; shrift 22.4 KB (24)
```

Testlar alohida `carservice_stock_test` bazasida ishladi (pastda 6-bo'lim).

## 5. Qo'lda tekshiruv

Headless Chrome, `_test` baza, `seed:demo` bilan.

| Tekshiruv | Qayerda | Natija |
|---|---|---|
| Kirim UI orqali: yetkazib beruvchi, artikul bilan Enter (skaner kabi), nom bilan qidirish, miqdor va narx, saqlash, "O'tkazilgandan keyin" (6 → 30), o'tkazish; qoldiq va jurnal o'zgardi | Admin, 1366 px | ✔ |
| Hisobdan chiqarish qoldiqdan ko'p → `insufficient_stock` xabari va qator belgilandi, qoldiq o'zgarmadi | Admin, 1366 px | ✔ (xato 3 tuzatilgandan keyin) |
| Admin tannarx ustunlarini ko'rmaydi; rahbar ko'radi va yozish tugmalari yo'q | Admin va rahbar | ✔ |
| "Bugun" da "Omborda kam qoldi" bloki | Admin, rahbar | ✔ |
| Sozlamalar → Mahsulotlar: toifalar daraxti, mahsulotlar ro'yxati | Egasi | ✔ |
| Mahsulot dialogi: narxsiz sotiladigan mahsulot rad, takror artikul rad, foto qo'shish, narxni o'zgartirish | Egasi | ✔ |
| Och va qorong'i mavzu; 1366 va 390 px; sahifa yonga surilmaydi, jadval o'z qutisida | Admin | ✔ |
| Ruscha matnlar | — | ko'rib chiqilmadi (tiplar kalitlarni tekshiradi) |
| Haqiqiy planshet, haqiqiy skaner qurilmasi, botdagi kunlik xabar | — | bajarilmadi |

## 6. Rejadan chetga chiqishlar

- **Alohida worktree.** Bosqich `feat/stock` branch'ida, `D:\Projects\car-service-platform-stock` papkasida va
  `carservice_stock_test` bazasida qilindi. Sabab: asosiy papkada boshqa sessiya telefon formatini
  o'zgartiryapti (o'z `0010_phone_format` migratsiyasi, sxema, admin i18n bilan). Bitta papkada migratsiya
  raqamlari va test bazasi to'qnashardi. Birlashtirishda ombor migratsiyalari telefon migratsiyasidan keyinga
  qayta raqamlanadi (0011–0013) va drizzle snapshot'lari qayta yaratiladi.
- 22-bo'limdagi 2026-11-24 qarorlari: ro'yxat sahifalanmaydi, sabab o'tkazishda majburiy, nakladnoy indeksi yo'q,
  "So'nggi harakatlar", qator holati chiziq bilan.

## 7. Ma'lum kamchiliklar va ochiq savollar

- PLAN 21: 11–16-savollar buyurtmachiga (mahsulotlar va narxlar, admin mahsulot qo'sha oladimi, kam qoldiq
  xabarini kim oladi, olib ketish muddati, tovar IKPU kodlari).
- Mahsulot fotosining tartibini o'zgartirib bo'lmaydi: birinchi yuklangani muqova. Do'konda kerak bo'lsa
  9-bosqichda qo'shiladi.
- `docs/EGA_UCHUN.md` ga ombor bo'limi yozilmadi.

## 8. Keyingi bosqichga ta'sir

9-bosqich (do'kon) `stock_levels.reserved`, `stock_documents.kind = 'sale'` va `shop_order_id` ga tayanadi:
rezerv va sotuv metodlari shu modulga qo'shiladi. Rezerv uchun CHECK (`reserved ≤ on_hand`) va qoldiq
invarianti testlari allaqachon bor.
