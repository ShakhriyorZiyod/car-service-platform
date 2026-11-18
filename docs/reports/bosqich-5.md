# Bosqich 5 — Qabul va ustalar ishi: hisobot

| | |
|---|---|
| Sana | 2026-11-18 |
| Holat | Kod va avtomatik tekshiruvlar tayyor. Haqiqiy Telegram, haqiqiy telefon (kamera, tarmoq uzilishi) va planshetda qo'lda tekshiruv qolgan (5-bo'lim) |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich 5 |

## 1. Natija

Mashina qabul dalolatnomasi bilan qabul qilinadi: probeg, yoqilg'i, mashinadagi narsalar, kuzov
sxemasidagi nuqsonlar va 4 tomon fotosi. Mijoz dalolatnomani botda yoki ilovada tasdiqlaydi (yoki admin
"og'zaki" deb belgilaydi), shundan keyingina ish boshlanadi. Admin vazifa beradi, usta Mini App'da
boshlaydi, foto oladi va hisobot topshiradi; fotolar va topshirish internet bo'lmaganda telefonda
saqlanib, qaytganda tartib bilan yuboriladi. Admin hisobotni qabul qiladi yoki izoh bilan qaytaradi.
Hamma tasdiqlangan zona qabul qilinganda ariza o'zi "Topshirishga tayyor" bo'ladi va mijozga xabar
ketadi. Ish paytida topilgan qo'shimcha ishni mijoz (botda yoki ilovada) yoki admin (telefon bo'yicha)
tasdiqlaydi.

## 2. Qilingan ish

| Qism | Nima qilindi | Asosiy fayllar |
|---|---|---|
| Baza | Migratsiya 0008: `media`, `reception_acts`, `reception_defects`, `tasks`, `task_reports`; `order_items.task_id` (bitta band ikki vazifada bo'lmaydi), `kind` va `approval` | `apps/server/src/db/migrations/0008_*.sql`, `db/schema/{media,reception,tasks,orders}.ts` |
| Platforma | `FileStore` porti va mahalliy papka adapteri; `Outbox.tell`; `MasterActor`; sozlamalar `UPLOADS_DIR`, `MEDIA_URL_SECRET` (production'da majburiy) | `platform/{ports,outbox,actors}.ts`, `storage/`, `config.ts`, `.env.example` |
| `media` | Tur baytlardan (JPEG, PNG, WebP; SVG va HTML o'tmaydi), ≤ 3 MB, bir xil `mediaId` takror yuborilsa bitta yozuv; imzolangan havola `/media/:id?exp&sig` (15 daqiqa) | `modules/media/` |
| `reception` | Qoralama, nuqsonlar, fotolar, yuborish, mijoz va og'zaki tasdiq, "Ishga topshirish"; holat mashinasi `domain/act.ts` | `modules/reception/` |
| `tasks` | Vazifa berish, boshqa ustaga berish, usta oqimi (boshlash, foto, topshirish), tekshiruv (qabul, qayta ishlash); holat mashinasi `domain/task-status.ts`; `orders.onTasksChanged` va bronni qisqartirish | `modules/tasks/` |
| `orders` | Qo'shimcha ish (`extras.ts`), `startWorkInside`, `itemsForTask`, `attachItems`, `onTasksChanged`; zonalar holati (`zoneProgress`) mijozga | `modules/orders/app/{extras,admin-orders,views}.ts` |
| `booking`, `identity` | `booking`: ishni qisqartirish (`shorten`); `identity`: `clientByTelegramId`, usta aktyori | `modules/{booking,identity}/` |
| API | 24 ta yangi marshrut: qabul (6 admin, 2 mijoz), usta (6), vazifalar (7 admin), qo'shimcha ish (2 admin, 1 mijoz); `master` guruhi `registerGroup` bilan | `packages/shared/src/{routes,contract}/`, `modules/*/http/` |
| Bot | 7 ta xabar (uz va ru): `act.confirm_request`, `extra.approval_request`, `order.ready`, `staff.task_assigned`, `staff.task_rework`, `staff.report_submitted`, `staff.extra_decided`; tugmalar `act:ok:<orderId>`, `extra:yes\|no:<itemId>` | `notifications/`, `bot/{bot,actions,delivery,texts}.ts`, `modules/{reception,orders}/bot/` |
| Mini App, usta | U1 vazifalar (Bugun, Qayta ishlash, Bajarilgan), U2/U3 vazifa (ko'rsatma, nuqsonlar, oldin/keyin fotolar, izoh, sekundomer, hisobot), profil (til), oflayn navbat (IndexedDB), navbat bannerlari, `?task=<id>` havolasi | `apps/tma/src/shells/master/`, `lib/photo-queue/`, `ui/{QueueBanner,MasterTimer}.tsx`, `lib/photo.ts`, `styles/master.css` |
| Mini App, mijoz | T6 to'liq: zonalar holati, dalolatnoma (probeg, yoqilg'i, nuqsonlar, fotolar), "Tasdiqlayman", qo'shimcha ish kartasi ("Roziman" / "Kerak emas"); kerakli holatlarda har 15 soniyada yangilanadi | `apps/tma/src/shells/client/orders/{OrderDetail,ActSection,ExtraApproval}.tsx`, `lib/client-data.ts` |
| Admin | A2 qabul (planshetga mo'ljallangan, `BodySchema`, 4 tomon fotosi, yuborish, og'zaki tasdiq, "Ishga topshirish"), A3 vazifalar va tekshiruv (urinishlar, foto ko'rish, qabul, izoh bilan qaytarish), ariza ichida qabul, vazifa va qo'shimcha ish kartalari | `apps/admin/src/features/{reception,tasks,order}/`, `ui/{BodySchema,PhotoTile,PhotoViewer,TaskChip}.tsx` |

## 3. Biznes-qoidalar va testlar

Server testlari: **1175 ta** (oldin 965), hammasi o'tdi. 210 ta yangi test:

| Qoida | Test fayli | Soni |
|---|---|---|
| Foto turi va o'lchami baytlardan (JPEG, PNG, WebP o'qiladi; kesilgan fayl, GIF, SVG, HTML va oddiy matn rad etiladi, rasm nomi bilan yashirilgani ham; o'lchamsiz yoki bema'ni o'lchamli rasm rad); imzolangan havola faqat o'z fotosi uchun va muddatigacha ishlaydi (boshqa kalit, o'zgargan yoki kesilgan imzo, boshqa foto, kasrli va kechroq muddat rad) | `media/media-rules.test.ts` | 25 |
| Dalolatnoma: yuborishdan oldin nima yetishmasligi (probeg, yoqilg'i, 4 tomon); holat o'tishlari (`draft`, `sent`, `confirmed`; tahrirlansa `sent` → `draft`); admin ariza holatiga qarab nima qila oladi; mijoz javobi | `reception/act-rules.test.ts` | 40 |
| Dalolatnoma use-case'lari: huquq, to'ldirish, fotolar (bir xil `mediaId` bitta yozuv va bitta fayl, o'sha id boshqa ma'noda rad, tomonning yangi fotosi eskisining o'rniga, chegaradan oshgani rad, GIF, SVG, HTML va matn rad etiladi va hech narsa saqlanmaydi, havola 15 daqiqa), yuborish, mijoz tasdig'i, og'zaki tasdiq, tasdiqsiz `in_work` yo'q | `reception/reception.test.ts` | 35 |
| Vazifa holat mashinasi to'liq (`it.each`); har holatda nima mumkin; ro'yxatlar | `tasks/task-rules.test.ts` | 64 |
| Vazifa use-case'lari: huquq; berish (bitta band ikki vazifada bo'lmaydi); usta ishi ("keyin" fotosiz topshirib bo'lmaydi, usta begona vazifani `not_found` ko'radi, javobda telefon va narx yo'q); tekshiruv (izohsiz qaytarib bo'lmaydi); hisobotni ikki marta topshirish zararsiz (bitta hisobot, har adminga bitta xabar); ikki admin bir zonani bir vaqtda bersa bitta vazifa; boshqa ustaga berish faqat `assigned` va `in_progress` da; oxirgi vazifa qabul qilinganda ariza `ready_for_pickup`, `pending` band bo'lsa yo'q, bron qisqarishi | `tasks/tasks.test.ts` | 25 |
| Qo'shimcha ish: qo'shish; mijoz javobi (faqat ariza egasi, ikkinchi javob `already_decided`); admin telefon bo'yicha yozadi; tayyor bo'lish bilan aloqasi; zonalar holati mijozga | `orders/extras.test.ts` | 18 |
| Botdagi tugma orqali mijozni topish (egalik serverda) | `identity/client-lookup.test.ts` | 3 |

Testlar va qo'lda tekshiruv bu bosqichda quyidagi xatolarni topdi (hammasi tuzatildi; tuzatishdan keyin
biznes-qoidaga tegishlilariga test bor, ko'rinish xatolariga yo'q, v1 qoidasi):

1. Qabulni rahbar (faqat o'qiydi) ochsa `canEdit: true` qaytardi: panel tugma ko'rsatardi (test topdi).
2. Dalolatnomani yuborishda mashina nomi `brand/model` dan olingan edi, arizadagi nusxada `label` bor (test topdi).
3. Bir xil `mediaId` boshqa ma'noda (maqsadda) qayta yuborilsa, takror yuborish qisqa yo'li mavjud rasmni qaytarib berardi; endi maqsad mos kelishi shart, aks holda rad etiladi (test topdi).
4. Panel vaqtni `+05:00` bilan yuborardi, `z.iso.datetime()` rad etardi; endi UTC'ga aylantiriladi (brauzerda topildi).
5. Yopishqoq tugmalar qatori dialogdan tashqari oddiy sahifa formalariga ham ta'sir qilardi; faqat `.dialog` ichiga cheklandi (brauzerda topildi).
6. Kanban 1024 px da sahifani yonga cho'zardi; doska o'z ichida aylanadigan bo'ldi (brauzerda topildi).
7. Nuqson fotosi katagi juda katta chiqdi; eni 200 px bilan cheklandi (brauzerda topildi).
8. Ustada "Nuqsonlar" kartasida matn qorong'i mavzuda ko'rinmasdi: och fonga och matn (soft tokenlar qorong'i mavzuda ham och, matn juft rang bilan olinishi kerak) (brauzerda topildi).
9. Ustaga nuqson `left: scratch` deb xom kod bilan ko'rsatilardi; endi uz va ru tarjimasi bilan (brauzerda topildi).
10. Dalolatnomada probeg birligi `km` kodga qattiq yozilgan edi; lug'atga ko'chdi (rus tilida `км`) (rus tilida ko'rib topildi).
11. Ustaning tablari 48 px, pastki panel va til tanlash 44 px, foto o'chirish tugmasi 28 px edi; DESIGN usta uchun ≥ 56 px talab qiladi. Tuzatildi (CSS'ni dizayn qoidasi bilan solishtirganda topildi).
12. Oflayn navbat kodi `shells/master` ichida edi va ESLint (shell'lar o'zaro import qilmaydi) uni rad etdi; `lib/photo-queue/` va `ui/` ga ko'chirildi.

## 4. Tekshiruvlar

```
npm run check        → typecheck, lint, 1175 test (36 fayl), build, check:bundle: exit 0
npm run format:check → toza
npm audit --omit=dev → 0 vulnerabilities
check:bundle         → birinchi ochilish: client 121.6 KB gzip (byudjet 200), master 120.0, staff 109.9; raqam shrifti 22.4 KB (24)
```

Birinchi to'liq `npm run check` ishga tushirishda **bitta test yiqildi**: `orders/orders.test.ts` dagi "a hundred
clients after one time" (3-bosqichning 100 mijozli parallel testi), `Test timed out in 5000ms`. Qoida
o'zi to'g'ri ishlagan (2 ta yutdi, 98 tasi `slot_taken`), lekin test 10 ulanishli pul bilan 100 ta
tranzaksiyani bajaradi va bu mashinada yolg'iz o'zi ~5.8–5.96 s (hooklar bilan) oladi, ya'ni vitest'ning
5 soniyalik standart chegarasida turadi (alohida 3 marta ishga tushirishda 1 marta yiqildi). Shu bitta
testga aniq 30 soniya chegarasi berildi; ikkinchi to'liq ishga tushirish yashil. 5-bosqich uni sekinlashtirgan-
sekinlashtirmaganini aniqlay olmadim: avvalgi vaqt o'lchamlari yo'q.

## 5. Qo'lda tekshiruv

Headless Chrome (Chrome DevTools Protocol), `_test` bazada, haqiqiy HTTP API orqali. Mini App ikki rolda
(mijoz va usta) `dev:init-data` bilan; admin `egasi` roli bilan. Haqiqiy bot ishga tushirilmadi.
Tarmoq uzilishi sahifa ichida taqlid qilindi (`fetch` rad etiladi, `navigator.onLine = false`), kamera
o'rniga fayl maydoniga canvas'da chizilgan rasm berildi.

| Tekshiruv (PLAN dagi ro'yxatdan va ularga qo'shimcha) | Qayerda | Natija |
|---|---|---|
| Hisobot tarmoqsiz topshiriladi va tarmoq qaytgach yetib boradi (PLAN: 10 ta foto) | 390×844, usta, uz. 1 foto onlayn yuborildi; oflayn: 3 ta "keyin" foto, izoh va "Hisobot topshirish" navbatga tushdi (IndexedDB'da `photo,photo,photo,submit`, tugma yopildi, banner "Yuborilmagan: 4 ta amal"). Ilova qayta ochildi: navbat o'zi bo'shadi, bazada vazifa `on_review`, 4 foto | Qisman ✔: 10 emas, 3 foto; tarmoq taqlid qilindi, haqiqiy telefonda emas |
| Qo'lqopda bosish qulay (56 px) | 390×844, och va qorong'i mavzu, uz: ro'yxat (3 tab), qayta ishlash vazifasi, boshlanmagan vazifa, profil. Har `button, a, textarea, select, [role=radio], input` o'lchandi | ✔ Hech biri 56 px dan kichik emas (qurilmada qo'lqop bilan emas). Foto o'chirish tugmasi CSS'da 56×56, uni foto bor ekranda tuzatishdan keyin o'lchamadim |
| Usta: vazifa ro'yxati, boshlash, sekundomer, nuqsonlar va ko'rsatma, "keyin" fotosiz topshirish yopiq, qayta ishlash sababi | 390×844, uz | ✔ |
| Usta ilovasi rus tilida | 390×844, qorong'i, ro'yxat | ✔ (vazifa ekrani ruscha ko'rilmadi) |
| Mijoz T6: zonalar holati, dalolatnoma, "Tasdiqlayman", qo'shimcha ish kartasi → "Roziman" (jami 990 000 → 1 340 000) | 390×844, uz; yorug' va qorong'i mavzu | ✔ |
| Mijoz T6 rus tilida | 390×844, qorong'i (bazada mijoz tili vaqtincha `ru` qilindi, keyin `uz` ga qaytarildi) | ✔ |
| Mijozda 44 px dan kichik bosiladigan maydon yo'q | 390×844, ikkala mavzu | ✔ |
| Qabul (A2): probeg va yoqilg'i, nuqson kuzov sxemasiga, 4 tomon fotosi, yuborish, og'zaki tasdiq, "Ishga topshirish" | 1280×900, uz | ✔ |
| Vazifa berish, qo'shimcha ish qo'shish va telefon bo'yicha tasdiqlash | 1280×900, uz | ✔ |
| Tekshiruv (A3): izohsiz qaytarish yopiq, qaytarish, ikkinchi urinish, qabul; oxirgi vazifadan keyin ariza `ready_for_pickup` | 1280×900, uz (usta qadamlari Mini App orqali emas, skript orqali bajarildi) | ✔ |
| Konsolda xato | hamma ekranda | yo'q |
| **Planshetda qabul to'liq o'tadi (PLAN)** | | **Bajarilmadi**: A2 faqat 1280×900 da ko'rildi; 1024 px va haqiqiy planshet yo'q |
| **10 ta foto, haqiqiy telefonda, tarmoqni o'chirib (PLAN, TZ 16.4)** | | **Bajarilmadi** |
| Kamera (`capture="environment"`) | | **Bajarilmadi** (fayl maydoniga rasm berildi) |
| Telegram'dagi xabarlar va tugmalar (`act:ok`, `extra:yes\|no`), `?task=<id>` havolasi | | **Bajarilmadi** (bot ishga tushirilmadi; xabar matnlari va outbox yozuvlari testlarda) |
| Telegram Desktop o'lchami; telefon haqiqiy Telegram'da | | **Bajarilmadi** (faqat 390×844 brauzer) |
| Admin A2 va A3 rus tilida | | **Bajarilmadi** |

## 6. Rejadan chetga chiqishlar

PLAN 22-bo'limda yozilgan (2026-11-18, 16 qator). Asosiylari:

- Yangi marshrutlar: `GET /api/client/orders/:id/act`, `GET /api/admin/tasks`, `GET /api/admin/tasks/:id`, `GET /api/admin/masters` (PLAN 13 yangilandi). Reja ularni sanab o'tmagan edi, lekin T6 va A3 ularsiz ishlamaydi.
- Oflayn navbat kodi `shells/master` ichida emas, `lib/photo-queue/` va `ui/` da (shell'lar o'zaro import qilmaydi qoidasi).
- Foto o'chirish tugmasi: ko'rinadigan doira 28 px, bosiladigan maydon 56 px; tasdiq so'ralmaydi.
- **A6 "Bugun" ga "tekshiruvdagi hisobotlar" hisoblagichi qo'shilmadi.** 4-bosqich hisoboti uni shu bosqichga qoldirgan edi, lekin PLAN 18 ning 5-bosqich ro'yxatida u yo'q. Hisobotlar A3 dagi "Tekshiruv" tabida ko'rinadi.

## 7. Ma'lum kamchiliklar va ochiq savollar

- Foto o'chirish tasdiqsiz: foto katagining o'ng yuqori burchagi 56×56 px, tasodifiy bosish mumkin. Qurilmada tekshirilmadi.
- Navbatdagi amal doimiy xato bilan rad etilsa (vazifa admin tomonidan o'zgargan, fayl rasm emas) u navbatdan olinib usta xabardor qilinadi; foto qayta olinishi kerak. Qanday ko'rinishi qurilmada tekshirilmadi.
- Telefonda IndexedDB mavjud bo'lmasa (ba'zi maxfiy rejimlar) navbat nima qilishi tekshirilmadi.
- Foto kichraytirish (≈ 2 Mp) natijasi hajmi o'lchanmadi; server ≤ 3 MB qabul qiladi, canvas'dan berilgan sinov rasmlari o'tdi.
- Mini App'da ma'lumotni o'chirish so'rovi tugmasi hali yo'q (4-bosqichdan ochiq qolgan savol: T13 dizaynida yo'q, qaysi ekranda bo'lishi hal qilinmagan).
- 100 mijozli parallel testning vaqti chegaraga yaqinligi (4-bo'lim).
- Yordamchi ustaga alohida ekran yo'q: u faqat ma'lumot uchun ko'rsatiladi, vazifani o'zi ko'rmaydi.

## 8. Keyingi bosqichga ta'sir

6-bosqich (topshirish va to'lov) shularga tayanadi: ariza `ready_for_pickup` ga o'zi o'tadi va
`order.ready` xabari ketadi; qo'shimcha ish bandlari (`approval`) jamiga kiradi, shuning uchun
`checkout` narxni `approved` va `not_required` bandlardan hisoblashi kerak; `media` va `FileStore`
topshirishdagi fotolar uchun tayyor; `Outbox.tell` va `staff.*` xabarlari mexanizmi. `admin.today`
ga "tekshiruvdagi hisobotlar" va "bugungi kassa" 6-bosqichda qo'shilishi mumkin.

## 9. Foydalanuvchi bajarishi uchun

1. `.env` ga `MEDIA_URL_SECRET` (kamida 32 belgi) va test bot tokenini yozing; `npm run dev`.
2. Telefonda (yoki Telegram'da) usta sifatida vazifani oching, 10 ta foto oling, samolyot rejimini
   yoqib hisobot topshiring, internetni yoqing: hisobot o'zi yetib borishi kerak.
3. Mijoz sifatida botda "Tasdiqlayman" va qo'shimcha ishda "Roziman" / "Kerak emas" tugmalarini
   bosing, xabarlarni uz va ru tilida ko'ring.
4. Planshetda (yoki 1024 px oynada) qabul dalolatnomasini boshidan oxirigacha to'ldiring.
5. Ustaning vazifa ekranini qo'lqop bilan bosib ko'ring, foto o'chirish tugmasi qulay-qulay emasligini
   baholang.
