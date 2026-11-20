# CarService: dizayn tizimi (v1)

Asosiy manba `docs/design/` dagi PDF'lar:

| Fayl | Nima bor | Sahifalar |
|---|---|---|
| `CarService — UI dizayn.pdf` | Rollar va sharoitlar, 12 qadamli yo'l, ekranlar xaritasi | 3 |
| `CarService — UI dizayn(Mijoz - Telegram Mini App).pdf` | T0–T14 | 20 |
| `CarService — UI dizayn(Usta PWA).pdf` | U0–U4 | 5 |
| `CarService — UI dizayn(Administrator - web panel).pdf` | A0–A13 | 14 |
| `CarService — UI dizayn(Rahbar - Analitika).pdf` | R1–R4 (v2) | 4 |

PDF'lar rastr: skrinshot va OCR matn qatlami. Shu sababli ranglar sahifalarni render qilib, piksellardan
o'lchangan (2026-11-18). Shrift nomi va o'lchamlari PDF ichida yo'q, ko'z bilan baholangan (9-bo'lim).
Kod ekranlarni shu hujjat va PDF bo'yicha quradi. Farqlar faqat 8-bo'limda yozilganlar.

---

## 1. Tamoyillar (umumiy PDF, 1-sahifa)

| Rol | Sharoit | Dizayn javobi |
|---|---|---|
| Mijoz | Telegram ichida telefon, ko'pincha bir qo'lda | Narx zona tanlanayotganda kuzov sinfi bo'yicha ko'rinadi; holat treki va bot xabarlari; qo'shimcha ishni bir tugma bilan tasdiqlash |
| Administrator | Peshtaxtada noutbuk, qabul zonasida 10" planshet | Qo'ng'iroqsiz ariza taymeri; kuzov sxemasi va majburiy 4 foto; bokslar jadvalida "hozir" chizig'i |
| Usta | Shaxsiy telefon, qo'lqop, boksda tarmoq zaif | 56 px tugmalar, kam matn kiritish; oflayn foto navbati |
| Rahbar | Ofisda kompyuter, yo'lda telefon | Har ko'rsatkich formulasi bilan (v2) |

Umumiy qoidalar:

- Holat faqat rang bilan emas, matn va nuqta bilan ham ko'rsatiladi (TZ 15.7).
- Raqamlar (narx, vaqt, davlat raqami, KPI) tor shriftda, katta va qalin.
- Soya yo'q, yuzalar tekis. Karta fondan oq rang va 1 px chegara bilan ajraladi.
- Tanlangan element: urg'u rangidagi 2 px chegara va urg'u rangining och foni.
- Har ekranning bo'sh, yuklanish (skelet) va xato holati bor (mijoz PDF, 17–20-sahifalar).

---

## 2. Ranglar

`packages/shared/src/styles/tokens.css` da CSS o'zgaruvchilari sifatida beriladi. Mini App va admin
shu bitta faylni import qiladi. Komponentlarda rang to'g'ridan-to'g'ri yozilmaydi, faqat token
ishlatiladi.

### 2.1 Asosiy

| Token | Och mavzu | Qorong'i (faqat TMA) | Qayerda |
|---|---|---|---|
| `--bg` | `#EDF1F4` | `#10171D` | Sahifa foni |
| `--surface` | `#FFFFFF` | `#19232C` | Karta, ro'yxat, header, pastki panel |
| `--surface-muted` | `#F3F7FA` | `#22303B` | Input foni, segment, ichki blok (masalan, mahsulot xususiyatlari) |
| `--border` | `#D8DBE0` | `#2C363F` | Karta va input chegarasi |
| `--text` | `#14212A` | `#E8EDF1` | Asosiy matn |
| `--text-muted` | `#57616A` | `#8A939C` | Ikkinchi darajali matn, izoh |
| `--ink` | `#14212A` | `#22303B` | To'q yuzalar: faol ariza kartasi, usta header'i, to'q tugma, tanlangan kun |
| `--on-ink` | `#FFFFFF` | `#E8EDF1` | To'q yuzadagi matn |
| `--accent` | `#BA471A` | `#BA471A` | Asosiy tugma, faol tab, tanlangan chegara |
| `--accent-text` | `#BA471A` | `#E07445` | Urg'u rangidagi matn va havola ("Qo'shish", "Batafsil ko'rish") |
| `--accent-soft` | `#FBECE5` | `#3A2419` | Tanlangan element foni |
| `--on-accent` | `#FFFFFF` | `#FFFFFF` | Urg'u tugmadagi matn |

### 2.2 Ma'noli ranglar

| Token | Matn / belgi | Och fon | Qayerda |
|---|---|---|---|
| `--info`, `--info-soft` | `#2958BC` | `#E8EEFC` | Ma'lumot bloki, "Yangi" holati, "Tekshiruvda" |
| `--teal`, `--teal-soft` | `#0E766D` | `#E3F3F2` | "Tasdiqlangan" holati, admin "Tasdiqladi" tugmasi |
| `--warning`, `--warning-soft` | `#9A5A00` | `#FBF0DC` | "Ishda", "Kam qoldi", "navbatda" belgisi, qabul nuqsonlari bloki (`#FFF9ED`) |
| `--success`, `--success-soft` | `#276B32` | `#E6F2E8` | "Topshirishga tayyor", "Tayyor", "yuklandi", "Qabul qilindi" |
| `--danger`, `--danger-soft` | `#B32318` | `#FBE9E7` | Xato, "Qayta ishlash", "Rad etdi", taymer ogohlantirishi |

Qorong'i mavzuda ma'noli ranglarning faqat `--teal-soft` (`#0E3B38`) qiymati o'lchangan. Qolganlari
3-bosqichda ko'z bilan tanlanadi va shu jadvalga yoziladi (9-bo'lim).

### 2.3 Holat → rang

| Ob'ekt | Holat | Yorliq (uz) | Rang |
|---|---|---|---|
| Ariza | `new` | Yangi | info |
| | `confirmed` | Tasdiqlangan | teal |
| | `in_work` | Ishda | warning |
| | `ready_for_pickup` | Topshirishga tayyor | success |
| | `completed` | Bajarildi | neytral (`--surface-muted` fon, `--text` matn) |
| | `cancelled` | Bekor qilingan | danger |
| | `no_show` | Kelmadi | danger |
| Vazifa | `assigned` | "16:00 dan" (vaqt) | neytral |
| | `in_progress` | Ishda | warning |
| | `on_review` | Tekshiruvda | info |
| | `rework` | Qayta ishlash | danger (karta chegarasi ham qizil) |
| | `accepted` | Qabul qilindi | success |
| Zona (mijoz treki) | — | Tayyor / Jarayonda / Navbatda | success / warning / muted |
| Foto | — | yuklandi / navbatda | success / warning |
| Jadval kartasi | yangi | slot ushlab turilgan | info, uzuq chegara |
| | tasdiqlangan / ishda | | teal-soft / warning-soft |
| | bloklangan | | kulrang qiya chiziqlar |

Holat yorlig'i (`StatusChip`) = nuqta + matn, `--*-soft` fon, `--*` matn.

### 2.4 Davlat raqami chipi

Ikkala mavzuda ham oq fonli: `#FFFFFF` fon, `#14212A` matn, 2 px `#14212A` chegara, ichida hudud kodi
va raqam orasida vertikal chiziq (`01 | A 777 BA`). Haqiqiy raqamga o'xshashi uchun mavzuga qarab
o'zgarmaydi (mijoz PDF, 16-sahifa). Kiritish maydonida o'ngda "UZ" bayroqchasi bor.

---

## 3. Tipografiya

- **Asosiy shrift:** tizim shrifti
  (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`). Telegram ichida tabiiy
  ko'rinadi va yuklab olish talab qilmaydi.
- **Raqamlar uchun shrift:** dizaynda narx, vaqt, davlat raqami va KPI tor (condensed) groteskda
  yozilgan. Aniq nomi PDF'da yo'q (9-bo'lim). Taklif: `Barlow Semi Condensed` 600. Uni faqat lotin harflari va
  raqamlar subset'i bilan, woff2 formatida o'zimiz host qilamiz (`@fontsource/barlow-semi-condensed`,
  latin 600: 22.4 KB, byudjet 24 KB), `font-display: swap` bilan: shrift kelguncha tizim shrifti
  ko'rinadi. Tezlik byudjetiga kiradi (PLAN 3.2). `font-variant-numeric: tabular-nums`.
- Mijoz uchun o'lchamlar 390 px kenglikdagi ekranga mo'ljallangan. Dizayn canvas'i 0.75 masshtabda bo'lgani
  uchun qiymatlar taxminiy (±2 px) va 3-bosqichda ko'z bilan tekshiriladi.

| Rol | Uslub | O'lcham / qator | Og'irlik | Misol |
|---|---|---|---|---|
| TMA | `title-xl` | 24 / 30 | 700 | "Salom, Aziz", "Buyurtmalarim" |
| | `title` | 20 / 26 | 600 | Header sarlavhasi, bo'lim ("Mening garajim") |
| | `body` | 16 / 22 | 400–500 | Ro'yxat qatori, matn |
| | `secondary` | 14 / 20 | 400 | Izoh, vaqt, "2023, oq rang" |
| | `caption` | 12 / 16 | 500 | Chip, kalendar belgisi ("bugun", "band") |
| | `num-xl` | 32 / 36 | 600, raqam shrifti | Dastlabki chek jami |
| | `num` | 18 / 22 | 600, raqam shrifti | Narx qatori, vaqt slotlari, davlat raqami |
| Usta | `plate-xl` | 32 / 36 | 600, raqam shrifti | Vazifa header'idagi davlat raqami |
| Admin | `page-title` | 26 / 32 | 700 | "Arizalar", "Jadval" |
| | `section` | 16 / 22 | 600 | Karta sarlavhasi |
| | `body` | 14 / 20 | 400–500 | Jadval, forma |
| | `small` | 12 / 16 | 400–500 | Kartadagi ikkinchi darajali matn |
| | `kpi` | 32 / 36 | 600, raqam shrifti | "Bugun" hisoblagichlari |

---

## 4. O'lchamlar

| Nima | Qiymat |
|---|---|
| Oraliq shkalasi | 4, 8, 12, 16, 20, 24, 32 px |
| TMA yon chekkasi | 16 px |
| Admin sahifa chekkasi | 24 px; chap menyu kengligi 220 px |
| Radius | `sm` 8 (chip, kichik input), `md` 12 (tugma, input, slot), `lg` 16 (karta), `pill` 999 (filtr chipi) |
| Bosiladigan maydon | Mijoz ≥ 44 px, asosiy tugma 52 px; usta ≥ 56 px (TZ 48 px dan katta, dizayn bo'yicha); admin ≥ 36 px, tor ekranda (≤ 900 px: planshet, telefon, Telegram) ≥ 44 px |
| Chegara | 1 px `--border`; tanlangan 2 px `--accent` |
| Soya | Yo'q |

---

## 5. Komponentlar: Mini App (`apps/tma/src/ui`)

Har komponent faqat tokenlardan foydalanadi va och va qorong'i mavzuda tekshiriladi.

| Komponent | Ko'rinishi | Dizayndagi joyi |
|---|---|---|
| `ScreenHeader` | Sarlavha va o'ngda qadam hisoblagichi ("3-qadam / 5") yoki holat chipi | T3, T6 |
| `StepProgress` | 5 segment, o'tilganlari `--accent`, qolgani `--border` | T3–T5 |
| `BottomBar` | Pastga yopishgan oq panel: chapda xulosa (narx, vaqt), ostida bitta yoki ikkita tugma | T3, T4, T5 |
| `Button` | `primary` (urg'u, 52 px, radius 12, to'liq kenglik), `secondary` (oq, chegarali), `dark` (`--ink`, usta "Hisobot topshirish"), `danger-outline` | hamma joyda |
| `TextLink` | `--accent-text`, 600 | "Qo'shish", "Hozircha katalogni ko'rish" |
| `Card`, `ListRow` | Oq karta, radius 16; qator: sarlavha + izoh + o'ngda qiymat | T1, T13 |
| `ActiveOrderCard` | `--ink` fonli karta: raqam, holat chipi, ishlar, sana, "Batafsil ko'rish" | T1 |
| `ServiceTile` | 3 ustunli to'r: ikonka (urg'u rangida) + nom; tanlangani urg'u chegara va och fon | T1 |
| `ChoiceChip` | Pill chip (marka, model, rang doirasi) | T2 |
| `ZoneRow` | Checkbox + zona nomi + davomiylik + narx; tanlangani urg'u chegara va och fon | T3 |
| `MonthCalendar` | 7 ustun; o'tgan kun xira, "bugun" belgisi, to'liq band kun qiya chiziq va "band", tanlangani `--ink` | T4 |
| `DayStrip` | Gorizontal kunlar qatori (bo'sh joy yo'q kun uchun) | mijoz PDF, 18-sahifa |
| `SlotGrid` | 4 ustunli vaqtlar; band vaqt uzuq chegara va ustidan chizilgan; tanlangani urg'u chegara va och fon | T4 |
| `PlateChip`, `PlateInput` | 2.4-bo'lim | T1, T2 |
| `Money` | Raqam shrifti, "so'm" qo'shimchasi; `0` va `null` ("kelishiladi") holatlari | hamma joyda |
| `StatusChip` | 2.3-bo'lim | T6, T9, U1 |
| `StatusTracker` | Vertikal: belgi doirasi (o'tgan yashil, joriy urg'u, keyingisi bo'sh), sarlavha, vaqt | T6 |
| `Notice` | `info` (ko'k fon + i ikonka), `warning`, `danger` | T5, T6 |
| `ApprovalCard` | Urg'u chegarali karta: matn + "Kerak emas" / "Roziman" | T6 |
| `EmptyState` | Doira ichida ikonka, sarlavha, matn, asosiy tugma, ostida izoh | mijoz PDF, 17-sahifa |
| `ErrorState`, `OfflineBanner` | Yuqorida `--ink` banner "Internet yo'q..."; markazda illyustratsiya, "Qayta urinish", "Servisga qo'ng'iroq qilish" | mijoz PDF, 19-sahifa |
| `Skeleton` | Ekranning aynan joylashuvini takrorlaydi; 300 ms dan tez yuklansa ko'rsatilmaydi | mijoz PDF, 20-sahifa |
| `TabBar` | Ikonka + yorliq, faoli `--accent`; mijozda 4 band (8-bo'lim), ustada 2 band | T1, U1 |
| `Segmented` | Ikki-uch variantli almashtirgich | T0 (til), U4 |
| `Toggle` | Urg'u rangida | T13 |
| `RatingStars` | 5 ta kvadrat tugma ichida yulduz | T12 |
| `PhotoTile`, `CaptureTile` | Foto katagi, ustida "yuklandi"/"navbatda" belgisi; urg'u rangida uzuq chegarali "Suratga olish" | U2, U3 |
| `Timer` | "0:42 / me'yor 1:00", raqam shrifti | U1, U3 |

**Telegram bilan ishlash.** Orqaga qaytish uchun Telegram'ning `BackButton`i ishlatiladi (TZ 4-bo'lim,
Android'da tizim tugmasi ham ishlaydi). Dizayndagi sahifa ichidagi "‹" belgisi faqat Telegram'dan
tashqarida (brauzerda ishlab chiqishda) ko'rinadi. Asosiy amal Telegram `MainButton`i emas, sahifadagi
`BottomBar` tugmasi orqali bajariladi, chunki dizaynda tugma ustida xulosa bor va ba'zan ikkita tugma
yonma-yon turadi (PLAN 22-bo'lim).

**Mavzu.** Mijoz va usta ilovasi Telegram'ning `colorScheme` qiymatiga qarab och yoki qorong'i
tokenlarni qo'llaydi (`data-theme`). Dizaynning o'z palitrasi ishlatiladi, `--tg-theme-*` emas: dizayn
ikkala mavzu uchun aniq ranglarni bergan. Mijoz va usta profilida **"Mavzu: Avto / Och / Qorong'i"**
almashtirgichi bor (`ui/ThemeSwitch.tsx`): "Avto" Telegram'ga ergashadi, boshqasi uni bekor qiladi.
Tanlov Telegram CloudStorage'da (qurilmalar orasida bir xil) va birinchi chizish uchun localStorage'da
saqlanadi (PLAN 22, 2026-11-19).

**`*-soft` fonidagi matn.** `--info-soft`, `--warning-soft`, `--success-soft`, `--danger-soft` qorong'i
mavzuda ham och qoladi (9-bo'lim, 2-savol). Shuning uchun ular ustidagi matn doim juft rang bilan
yoziladi (`--info`, `--warning` ...), hech qachon `--text` bilan emas: `--text` qorong'ida och bo'ladi.

**Ikonkalar.** Dizayndagi ikonkalar chiziqli, Lucide uslubida. Shuning uchun `lucide-react` ishlatiladi:
bundle'ga faqat import qilingan ikonkalar tushadi.

---

## 6. Komponentlar: admin panel (`apps/admin/src/ui`)

Admin panel och va qorong'i mavzuda ishlaydi: tokenlar TMA bilan bir xil (`data-theme`), yangi rang
yo'q. Yuqori panelda "Avto / Och / Qorong'i" ikonkalari (`lib/theme.ts`): "Avto" kompyuter mavzusiga
(`prefers-color-scheme`) ergashadi, tanlov shu brauzerning localStorage'ida (PLAN 22, 2026-11-19).

Tor ekranda (≤ 900 px: telefon, Telegram oynasi, tik planshet) panel o'sha komponentlar bilan ishlaydi
(PLAN 22, 2026-11-20): `Sidebar` chapdan chiqadigan panel bo'ladi (yuqori paneldagi ☰, ✕, fon yoki
boshqa sahifaga o'tish yopadi); `Topbar` ikki qatorga tushadi, ≤ 640 px da qidiruv alohida qatorda,
ism, rol va avatar yashiriladi, "Chiqish" faqat ikonka. Ikki ustunli sahifalar bitta ustunga tushadi
(o'ng ustun pastga). `DataTable`, `ScheduleGrid` va `PriceMatrix` sahifani kengaytirmaydi, o'z
qutisi ichida yonga suriladi. Dialog ekran kengligida. Tugma, filtr va menyu bandlari ≥ 44 px.

| Komponent | Ko'rinishi | Dizayndagi joyi |
|---|---|---|
| `Sidebar` | Logo (to'q kvadrat ichida qalqon) + "CarService" + ustaxona nomi; menyu bandlari, faolining foni `--accent-soft`; o'ngda urg'u rangida hisoblagich | hamma sahifa |
| `Topbar` | Qidiruv ("Raqam, telefon yoki davlat raqami"), sana, initsiallar avatari, ism va rol | A1 |
| `PageHeader` | Sarlavha + segment ("Kanban/Jadval", "Kun/Hafta") + filtr tugmalari + asosiy amal | A1, A4 |
| `AlertBanner` | `--danger-soft` fonli qator, soat ikonkasi | A1 ("№1051 23 daqiqadan beri qo'ng'iroqsiz") |
| `KanbanColumn` | Rangli kvadrat + nomi + soni; oq kartalar | A1 |
| `OrderCard` | Raqam + manba (TMA/Telefon), o'ngda taymer yoki vaqt; mashina + kichik `PlateChip`; ishlar; mijoz va boks; ostida amal tugmalari yoki progress (vazifalar "2 / 4") | A1 |
| `CallActions` | "Tasdiqladi" (`--teal` to'la), "Javobsiz" (chegarali), "Rad etdi" (`--danger` chegarali) | A1 |
| `KpiCard` | Yorliq, katta raqam, izoh; e'tibor kerak bo'lsa `--accent` chegara va `--danger` raqam | A6 |
| `DataTable` | Sarlavha 12 px muted, qator ≈ 56 px, raqamlar o'ngda raqam shriftida | A10, A13 |
| `ScheduleGrid` | Qatorlar bokslar, ustunlar soatlar; kartalar holat rangida; "hozir" chizig'i `--accent` va pastida "Hozir 14:57" yorlig'i; bloklangan oraliq qiya chiziqli | A4 |
| `StepChips` | Qabul qadamlari: bajarilgani `--success-soft`, joriysi `--accent-soft` ("3. Fotolar: 3 / 4") | A2 |
| `BodySchema` | Mashina SVG ko'rinishlari (yuqoridan, chap, o'ng, old, orqa, salon); bosilgan joyga raqamli belgi, rangi nuqson turiga qarab | A2 |
| `DefectList` | Raqamli belgi + tur + izoh + foto katagi | A2 |
| `PhotoGrid` | Katakchalar va urg'u rangida uzuq chegarali "Suratga olish" | A2, A3, A8 |
| `ReportView` | "Oldin" va "Keyin" fotolar galereyasi, usta izohi, eslatma maydoni, "Qayta ishlashga qaytarish" / "Hisobotni qabul qilish" | A3 |
| `PaymentForm` | Usul tugmalari (Naqd, Terminal, O'tkazma, Aralash), har usulga summa, "Qoldiq", chegirma | A8 |
| `StickyActionBar` | Pastki panel: chapda ogohlantirish matni, o'ngda tugmalar | A2 |
| `UnsavedBar` | `--ink` fonli panel: "2 ta o'zgarish..." + "Bekor qilish" / "Saqlash" | A12 |
| `PriceMatrix` | Zona × S/M/L/XL jadvali, katakda narx inputi va ostida me'yoriy vaqt | A12 |

---

## 7. Ekranlar xaritasi va v1 holati

`To'liq` — dizayn bo'yicha. `O'zg.` — 8-bo'limdagi o'zgartirish bilan. `v2` — v1 da yo'q.

### 7.1 Mijoz (Mini App, `apps/tma/src/shells/client`)

| Kod | Ekran | PDF sahifa | v1 | Bosqich |
|---|---|---|---|---|
| T0 | Birinchi kirish: til, ism, rozilik, telefon | 8 | To'liq | 1 |
| T1 | Bosh sahifa (och / qorong'i) | 1 / 16 | O'zg. | 3 |
| — | Bo'sh garaj | 17 | To'liq | 3 |
| T2 | Garajga mashina qo'shish | 2 | To'liq | 3 |
| T3 | Xizmat va zonalar | 3 | To'liq | 3 |
| T4 | Sana va vaqt; bo'sh vaqt yo'q holati | 4 / 18 | To'liq | 3 |
| T5 | Dastlabki chek | 5 | To'liq | 3 |
| T8 | Ariza yuborildi | 9 | To'liq | 3 |
| T9 | Buyurtmalarim: faol va tarix | 10 | O'zg. | 3 |
| T6 | Ariza kuzatuvi, qo'shimcha ish | 6 | O'zg. | 3, 5 |
| T12 | Natija va baho | 13 | O'zg. | 6 |
| T13 | Profil | 14 | O'zg. | 1, 3 |
| T14 | Bot xabarlari | 15 | O'zg. | 3–6 |
| — | Xato va oflayn holat | 19 | To'liq | 3 |
| — | Skelet | 20 | To'liq | 3 |
| T7, T10, T11 | Do'kon, mahsulot, savat | 7, 11, 12 | v2 | — |

### 7.2 Usta (Mini App, `apps/tma/src/shells/master`)

| Kod | Ekran | PDF sahifa | v1 | Bosqich |
|---|---|---|---|---|
| U0 | Telefon va PIN bilan kirish | 1 | Yo'q: kirish Telegram orqali | — |
| U1 | Vazifalar: bugun, qayta ishlash, bajarilgan | 2 | To'liq | 5 |
| U2 | Boshlashdan oldin | 3 | To'liq | 5 |
| U3 | Ish va fotohisobot | 4 | O'zg. | 5 |
| U4 | Ko'rsatkichlarim | 5 | v2 | — |

### 7.3 Administrator (`apps/admin`)

| Kod | Ekran | PDF sahifa | v1 | Bosqich |
|---|---|---|---|---|
| A0 | Kirish va 2-qadam kodi | 6 | To'liq | 1 |
| A6 | Bugun | 7 | O'zg. | 4, 6 |
| A1 | Arizalar: Kanban | 1 | O'zg. | 4 |
| A7 | Yangi ariza | 8 | To'liq | 4 |
| A4 | Jadval: bokslar (kun) | 4 | O'zg. | 4 |
| A2 | Qabul dalolatnomasi | 2 | O'zg. | 5 |
| A3 | Vazifalar va ustalar hisoboti | 3 | O'zg. | 5 |
| A8 | Topshirish va to'lov | 9 | O'zg. | 6 |
| A10 | Mijozlar: ro'yxat va karta | 11 | To'liq | 4 |
| A12 | Sozlamalar: prays va me'yorlar | 13 | O'zg. | 2 |
| A13 | Sozlamalar: xodimlar va rollar | 14 | O'zg. | 1 |
| — | Sozlamalar: bokslar, ish jadvali va bayramlar, markalar va modellar, ustaxona | 13–14 dagi tab'lar | Dizayn uslubida | 2 |
| — | Audit jurnali | 13–14 dagi tab | Dizayn uslubida | 1 |
| A9, A5, A11 | Do'kon buyurtmalari, ombor, kirim | 10, 5, 12 | v2 | — |

### 7.4 Rahbar

R1–R4 (`Rahbar - Analitika.pdf`) v2 da. v1 da rahbar admin panelga kiradi va "Bugun", "Arizalar",
"Jadval" va "Mijozlar" bo'limlarini faqat o'qish rejimida ko'radi.

---

## 8. v1 da dizayndan farqlar

Har biri PLAN 1.2 va 22-bo'limdagi qarorlardan kelib chiqadi.

| Joy | Dizaynda | v1 da | Sabab |
|---|---|---|---|
| Hamma joyda | "Chilonzor filiali" | Ustaxona nomi sozlamadan | Bitta ustaxona, filial tushunchasi yo'q |
| T1, TabBar | Do'kon kartasi, 5 bandli menyu | Do'kon kartasi yo'q; menyu: Bosh, Garaj, Buyurtmalar, Profil | Do'kon v2 da |
| T6 | "Qabul dalolatnomasi, PDF" | "Qabul dalolatnomasi" ilova ichida: ko'rsatkichlar, nuqsonlar va fotolar; tasdiqlanmagan bo'lsa "Tasdiqlayman" | Imzo va PDF v2 da |
| T9 | Xizmat va do'kon buyurtmalari aralash | Faqat xizmat arizalari | Do'kon v2 da |
| T12 | Bajarilgan ishlar dalolatnomasi PDF, fiskal chek fayli | PDF yo'q; fiskal chek raqami matn sifatida | PDF va kassa API v2 da |
| T13 | "Filial" qatori | Yo'q | Bitta ustaxona |
| T13, usta profili | Mavzu tanlovi yo'q | "Mavzu: Avto / Och / Qorong'i" | Foydalanuvchi so'rovi (PLAN 22, 2026-11-19) |
| Hamma admin ekranlari | Faqat och | Och va qorong'i, Topbar'da almashtirgich | Foydalanuvchi so'rovi (PLAN 22, 2026-11-19) |
| A10 (mijoz kartasi) | Telegram ID yo'q | "Telegram ID: …" chipi (anonimlashtirilganda yo'q) | Foydalanuvchi so'rovi (PLAN 22, 2026-11-19) |
| T14 | PDF ilova | Qisqa xulosa va "Tasdiqlayman" tugmasi | Imzo va PDF v2 da |
| U0 | Telefon va PIN | Yo'q, Telegram orqali kiriladi | Usta ilovasi Mini App |
| U1, TabBar | Vazifalar, Ko'rsatkichlarim, Profil | Vazifalar, Profil | Ko'rsatkichlar v2 da |
| U2 | "Bular siz tufayli emas — dalolatnomada mijoz imzosi bor" | "... mijoz tasdiqlagan" | Imzo yo'q, tasdiq bor |
| U2 | "Qabulda qayd etilgan nuqsonlar, shu zonalarda" | Dalolatnomadagi barcha nuqsonlar | Nuqson va zona o'rtasida bog'lanish yo'q |
| U3 | Sarflangan materiallar, ovozli izoh | Yo'q; faqat matnli izoh | Ombor va ovoz v2 da |
| A1, Sidebar | Do'kon buyurtmalari, Ombor | Yo'q | v2 da |
| A2 | 4-qadam "Imzolar" | 4-qadam "Mijoz tasdig'i": botga yuborish yoki "og'zaki tasdiqladi"; tugma "Ishga topshirish" | Bot orqali tasdiq |
| A3 | Sarflangan materiallar | Yo'q | Ombor v2 da |
| A4 | "Hafta" ko'rinishi, kartani sudrab ko'chirish | Faqat "Kun"; ko'chirish ariza ichidagi "Ko'chirish" tugmasi orqali | Soddalik, v2 da |
| A6 | "Omborda kam qoldi" | Yo'q | Ombor v2 da |
| A8 | Imzolar; "Tugma mijoz imzosidan keyin faollashadi"; chek KKM'ga avtomatik | Imzo yo'q; "Fiskal chek raqami" maydoni; tugma summa mos kelib, chek raqami kiritilganda faollashadi | Qo'lda fiskal |
| A12 | Materiallar ustuni; "Xabar shablonlari" tab'i | Yo'q | v2 da |
| A13 | Har rol uchun huquq almashtirgichlari | Rol tavsifi faqat o'qish uchun, faqat "Chegirma limiti, %" tahrirlanadi | Huquqlar kodda qat'iy (PLAN 8-bo'lim) |

---

## 9. Ochiq savollar (dizaynerga)

1. Raqamlar va davlat raqami uchun shrift nomi va litsenziyasi. Javob bo'lmaguncha `Barlow Semi
   Condensed` (SIL OFL) ishlatiladi.
2. Qorong'i mavzudagi ma'noli ranglar (info, warning, success, danger) va ularning och fonlari.
3. Kuzov sxemasi uchun SVG fayllar (yuqoridan, chap, o'ng, old, orqa, salon). Berilmasa, 5-bosqichda
   oddiy kontur chizmalar o'zimiz chizamiz.
4. Bo'sh holat illyustratsiyalari: dizayndagi kabi ikonka va doira yetarlimi.
