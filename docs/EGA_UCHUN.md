# Egasi va administrator uchun yo'riqnoma

Ustaxona ikki joyda ishlaydi:

- **Telegram bot va Mini App** — mijozlar bron qiladi va ishni kuzatadi; ustalar vazifalarini bajaradi.
  Hamma bitta botni ochadi, kimga qaysi qism ochilishini dastur o'zi biladi.
- **Panel** — `https://<domen>/admin/`, kompyuter yoki planshet brauzerida. Administrator, rahbar va egasi
  shu yerda ishlaydi.

## Kirish

Login (yoki telefon) va parol. Egasi va rahbar uchun yana **2-qadam kodi**: u shu odamning Telegram'iga
botdan keladi, 5 daqiqa amal qiladi. Kod kelishi uchun botni bir marta ochib, Mini App'da telefon raqamini
ulashish kerak. 15 daqiqada 10 marta noto'g'ri parol kiritilsa, kirish vaqtincha to'xtaydi.

| Rol | Nima qiladi |
|---|---|
| Administrator | Arizalar, qo'ng'iroqlar, jadval, qabul, vazifalar, topshirish va to'lov, mijozlar. Chegirma limitgacha |
| Rahbar | Bugun, arizalar, jadval, mijozlar — faqat ko'radi |
| Egasi | Hammasi, va yana: sozlamalar, prays, xodimlar, audit jurnali, limitdan katta chegirma, ishdagi arizani bekor qilish, to'lov usulini tuzatish, mijoz ma'lumotini o'chirish |
| Usta | Panelga kirmaydi: vazifalari Mini App'da |

## Birinchi kun (egasi)

Sozlamalar bo'limida, shu tartibda:

1. **Ustaxona.** Nomi, manzil, telefon (mijoz "Servisga qo'ng'iroq qilish"ni bosganda shu raqam), xarita
   havolasi, maxfiylik siyosati havolasi. **Qoidalar**: vaqt qadami, eng yaqin bron, necha kun oldinga bron,
   mashinalar orasidagi zaxira, yangi arizani ushlab turish, qo'ng'iroqsiz ogohlantirish, rahbarga xabar,
   eslatmalar (masalan `24, 2`), administrator chegirma limiti (%). Har maydon ostida izoh bor.
2. **Ish jadvali va bayramlar.** Haftaning ishlaydigan kunlari, ochilish va yopilish, tanaffus; bayram
   kunlari. Ish vaqti bo'lmasa, mijoz vaqt tanlay olmaydi.
3. **Bokslar.** Har boks qaysi ish turlarini bajaradi. Bron faqat mos boksga tushadi.
4. **Prays va me'yorlar.** Har ish turi uchun zona × kuzov sinfi (S, M, L, XL): narx va daqiqadagi me'yoriy
   vaqt. Narx bo'sh qoldirilsa, "kelishiladi" bo'ladi. Katak bo'sh bo'lsa, zona shu sinfga taklif qilinmaydi.
5. **Markalar va modellar.** Kerakli model yo'q bo'lsa qo'shing. Mijoz "Boshqa" deb yozgan mashinalar
   mijoz kartasida ko'rinadi: ularni haqiqiy modelga bog'lang.
6. **Xodimlar va rollar.** Admin va rahbarga login va birinchi parol bering. Ustaga login kerak emas:
   uning telefonini kiriting, usta botda shu raqamni ulashganda o'z vazifalarini ko'radi.

Har o'zgarish **Audit jurnali**ga yoziladi (kim, qachon, nima edi, nima bo'ldi).

## Har kungi ish (administrator)

**Bugun.** Qo'ng'iroqsiz yangi arizalar, bugun keladiganlar, ishdagilar, topshirishga tayyorlar;
tekshiruvni kutayotgan hisobotlar va bugungi kassa. Sahifa har 10 soniyada yangilanadi.

**Arizalar (Kanban).** Mijoz Mini App'dan yuborgan ariza "Yangi" ustunida paydo bo'ladi, ovoz chiqadi.
Mijozga qo'ng'iroq qiling va natijani bosing:

- **Tasdiqladi** — ariza tasdiqlanadi, mijozga xabar ketadi;
- **Javobsiz** — vaqt yana bir oz ushlab turiladi;
- **Rad etdi** — sabab bilan bekor qilinadi.

Belgilangan vaqtdan ko'p qo'ng'iroqsiz qolgan ariza qizil bo'ladi, keyin rahbar va egasiga xabar boradi.
Hech kim qo'ng'iroq qilmasa, ushlab turish muddati tugagach ariza o'zi bekor bo'ladi va vaqt bo'shaydi.

**Yangi ariza** (telefon yoki o'zi kelgan mijoz): mijoz, mashina, ishlar, vaqt, tasdiq. "Mijoz telefonda
tasdiqladi" belgilansa, ariza darhol tasdiqlangan bo'ladi.

**Ariza ichida:** ishlar va narxlar, vaqtni ko'chirish, bekor qilish, "Kelmadi" (vaqt boshlangandan keyin).
Ishlar va vaqt ish boshlanguncha o'zgaradi.

**Jadval.** Bokslar bo'yicha kun, "hozir" chizig'i. Bo'sh vaqtni yopish (tushlik, ta'mir) — mijozga
ko'rinmaydi.

**Qabul (mashina kelganda).** Ariza → Qabul dalolatnomasi, planshetda:

1. Probeg va yoqilg'i, mashinadagi narsalar.
2. Tashqi ko'rinish: kuzov sxemasiga bosib nuqson belgilang (turi, izoh, foto).
3. Fotolar: old, orqa, chap, o'ng — to'rttasi majburiy.
4. Mijoz tasdig'i: "Mijozga yuborish" (mijoz botda yoki ilovada "Tasdiqlayman" bosadi) yoki "Og'zaki
   tasdiqladi".

Tasdiqdan keyin **Ishga topshirish**.

**Vazifalar.** Ariza ichida zonalarni ustaga bering (ko'rsatma bilan). Usta Mini App'da boshlaydi, oldin va
keyin fotolarini oladi va hisobot topshiradi (internet bo'lmasa, telefon saqlab turadi va keyin yuboradi).
**Ustalar hisobotlari**da fotolarni ko'rib **Hisobotni qabul qilish** yoki izoh bilan **Qayta ishlashga qaytarish**.

**Qo'shimcha ish.** Ish paytida topilsa, ariza ichida qo'shing: mijozga narx va yangi jami bilan so'rov ketadi,
u "Roziman" yoki "Kerak emas" bosadi. Mijoz telefonda javob bersa, o'zingiz belgilaysiz. Javob kelmaguncha
ariza tayyor bo'lmaydi.

Hamma vazifa qabul qilinganda ariza o'zi **Topshirishga tayyor** bo'ladi va mijozga "Mashinangiz tayyor"
xabari ketadi.

## Topshirish va to'lov

**Topshirish va kassa** bo'limi yoki ariza ichidagi **Topshirish** tugmasi:

1. Ishlar ro'yxati va kim bajargani; mijozga oldin va keyin fotolarini ko'rsating.
2. "Kelishiladi" ish bo'lsa, narxini yozing (bir marta; usiz to'lov qabul qilinmaydi).
3. Chegirma: foiz yoki so'm va sababi. Administrator limitgacha beradi, ko'prog'ini faqat egasi.
4. To'lov usuli: Naqd, Terminal, Kartaga o'tkazma yoki **Aralash** (har usulga summa, "Qoldiq" 0 bo'lishi
   kerak).
5. Chekni onlayn-KKM yoki virtual kassada chiqaring va **Fiskal chek raqami**ni yozing.
6. **To'lovni qabul qilish va yakunlash.** Ariza "Bajarildi" bo'ladi, mijozga rahmat va 1–5 yulduzli baho
   so'rovi ketadi. Mijoz izohni ilovada yozadi.

Tugma faqat summa mos kelib, chek raqami yozilganda yonadi. Ikki marta bosilsa ham to'lov bir marta
yoziladi.

**Xato usul tanlangan bo'lsa** (masalan, naqd o'rniga terminal), egasi topshirish sahifasida usulni
o'zgartiradi. Summa o'zgarmaydi, o'zgarish audit jurnaliga yoziladi. Pulni qaytarish dasturda yo'q.

## Mijozlar

Ism, telefon yoki davlat raqami bo'yicha qidiruv; doimiy, uzoq kelmagan, Telegramsiz mijozlar. Kartada
mashinalar, arizalar, ichki izoh (mijoz ko'rmaydi). "Telegramsiz" belgisi — bot unga yoza olmaydi
(Telegram ulanmagan yoki botni bloklagan): xabarlar bormaydi, qo'ng'iroq qiling.

**Ma'lumotni o'chirish.** Mijoz ilovada so'rasa, egasiga xabar keladi. Egasi mijoz kartasida
**Ma'lumotlarni o'chirish**ni bosadi: ism, telefon, Telegram bog'lanishi, izoh va davlat raqamlari
o'chadi, arizalar va to'lovlar qoladi. Buni qaytarib bo'lmaydi.

## Ombor

**Avval (egasi):** Sozlamalar → **Mahsulotlar**: toifalar, keyin mahsulot kartasi — nomi (ikki tilda), artikul,
shtrix-kod, toifa, birlik, qadoq, chakana narx (do'konda sotiladigan tovar uchun), minimal qoldiq, fotolar
(5 tagacha). Do'konda sotiladigan tovar donada hisoblanadi: har qadoq ("0,5 l", "1 l") — alohida mahsulot.
Yetkazib beruvchilar **Ombor → Yetkazib beruvchilar**da.

**Qoldiq qo'lda o'zgartirilmaydi.** U faqat hujjat orqali o'zgaradi. Hujjat avval qoralama bo'ladi va
**o'tkazilganda** qoldiqni o'zgartiradi. O'tkazilgan hujjatni o'zgartirib bo'lmaydi: xato bo'lsa, teskari
hujjat yozing (ortiqcha kirim bo'lsa — hisobdan chiqarish yoki inventarizatsiya).

- **Kirim qilish** — tovar keldi: yetkazib beruvchi, nakladnoy raqami va sanasi, surati; mahsulotni
  qidiring yoki skaner bilan o'qiting (Enter bilan qo'shiladi), miqdor va kirim narxi. O'ng tomonda
  "O'tkazilgandan keyin" qoldiq qanday bo'lishini ko'rsatadi. O'rtacha tannarx o'zi qayta hisoblanadi.
- **Hisobdan chiqarish** — brak, muddati o'tgan, ichki ehtiyoj yoki boshqa sabab (majburiy). Buyurtma
  uchun rezervdagi tovarni chiqarib bo'lmaydi.
- **Inventarizatsiya** — sanalgan miqdorni yozing; farq o'zi harakat bo'ladi, hisobdagi miqdor hujjatda
  qoladi.

**Qoldiqlar** ro'yxatida "Kam qoldi" va "Tugagan" belgilari, **Minimumdan past** filtri bor. Minimumdan past
tovarlar "Bugun" sahifasida ko'rinadi, adminlar va egasiga botga kuniga bir marta xabar keladi.
**Harakatlar jurnali** — kim, qachon, qaysi hujjat bilan nima qildi. Kirim narxi va tannarxni faqat
rahbar va egasi ko'radi.

## Muammo bo'lsa

- **Panel saqlamayapti, "huquqingiz yo'q"** — sizning rolingizga bu amal berilmagan (jadvalga qarang).
- **2-qadam kodi kelmayapti** — botni oching, Start bosing, Mini App'da telefonni ulashing. Kod daqiqada
  bir marta yuboriladi.
- **"Ariza holati o'zgargan"** — boshqa xodim yoki mijoz shu paytda o'zgartirgan. Sahifa yangilanadi,
  qaytadan bosing.
- **Ilova ochilmayapti, bot javob bermayapti** — texnik xodimga: `docs/DEPLOY.md`, "Foydali buyruqlar".
