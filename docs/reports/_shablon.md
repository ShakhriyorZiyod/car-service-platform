# Bosqich N — <nomi>: hisobot

| | |
|---|---|
| Sana | YYYY-MM-DD |
| Holat | Qabulga tayyor / Kamchilik bilan / Bloklangan |
| Reja | `docs/PLAN.md`, 18-bo'lim, Bosqich N |

## 1. Natija

Bosqich maqsadiga erishildimi: 2–3 jumla.

## 2. Qilingan ish

| Qism | Nima qilindi | Asosiy fayllar |
|---|---|---|
| Baza | Jadvallar, migratsiyalar | `apps/server/src/db/...` |
| Server | Modullar, use-case'lar, route'lar | `apps/server/src/modules/...` |
| Bot | Xabarlar, tugmalar | |
| Mini App | Ekranlar (dizayn kodlari bilan) | `apps/tma/src/...` |
| Admin | Ekranlar (dizayn kodlari bilan) | `apps/admin/src/...` |

## 3. Biznes-qoidalar va testlar

| Qoida | Test fayli | Natija |
|---|---|---|
| | `apps/server/test/...` | ✔ / ✘ |

Testlar soni: N ta, hammasi yashil / N tasi yiqildi (chiqishi quyida).

## 4. Tekshiruvlar

```
npm run typecheck   → natija
npm run lint        → natija
npm test            → natija
npm run build       → natija
npm run check:bundle→ natija (tma: client X KB, master Y KB)
```

## 5. Qo'lda tekshiruv

| Tekshiruv (PLAN dagi ro'yxatdan) | Qayerda (qurilma, mavzu, til) | Natija |
|---|---|---|
| | | ✔ / ✘ / bajarilmadi |

## 6. Rejadan chetga chiqishlar

Qo'shilgan, olib tashlangan yoki keyinga qoldirilgan narsa, sababi va PLAN 22-bo'limdagi qarorga havola.
Bo'lmasa: "Yo'q".

## 7. Ma'lum kamchiliklar va ochiq savollar

Hal qilinmagan muammolar, ularning ta'siri va qaysi bosqichda yopilishi.

## 8. Keyingi bosqichga ta'sir

Keyingi bosqich nimaga tayanadi, nima o'zgardi.
