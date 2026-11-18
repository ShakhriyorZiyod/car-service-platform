/**
 * Mini App texts in Uzbek, the source dictionary: ru.ts must have the same shape. Visible text
 * uses ‘ (U+2018) for o‘ and g‘.
 */
export const uz = {
  stage: (n: number) => `${n}-bosqich`,
  notInTelegram: {
    title: 'Ilovani Telegram orqali oching',
    text: 'Botdagi «Ilovani ochish» tugmasini bosing.',
  },
  error: {
    title: 'Ma’lumot yuklanmadi',
    network: 'Internet yo‘q. Tarmoq qaytishi bilan qayta urinib ko‘ring.',
    server: 'Xizmatda nosozlik. 5 daqiqadan so‘ng urinib ko‘ring.',
    retry: 'Qayta urinish',
    code: (code: string) => `Xato kodi: ${code}`,
  },
  onboarding: {
    headline: 'Bron, narx va mashinangiz holati — bir joyda',
    benefits: {
      price: 'Narxni zonalar bo‘yicha oldindan bilasiz',
      time: 'Vaqtni o‘zingiz tanlaysiz',
      ready: 'Mashina tayyor bo‘lganda xabar keladi',
    },
    lang: 'Til',
    name: 'Ismingiz',
    consent: 'Shaxsiy ma’lumotlarim bron va xabarlar uchun ishlatilishiga roziman.',
    policy: 'Maxfiylik siyosati',
    sharePhone: 'Telefon raqamni ulashish',
    phoneHint:
      'Administrator bron bo‘yicha shu raqamga qo‘ng‘iroq qiladi. Raqam Telegram orqali yuboriladi.',
    later: 'Hozircha katalogni ko‘rish',
    needName: 'Ismingizni yozing.',
    needConsent: 'Davom etish uchun rozilik belgisini qo‘ying.',
    phoneTaken: 'Bu raqam boshqa akkauntga bog‘langan. Servisga murojaat qiling.',
    phoneFailed: 'Raqamni tasdiqlab bo‘lmadi. Qayta urinib ko‘ring.',
    failed: 'Saqlab bo‘lmadi. Qayta urinib ko‘ring.',
  },
  shells: {
    client: {
      title: 'Mijoz ilovasi',
      note: 'Bosh sahifa, garaj va bron 3-bosqichda tayyor bo‘ladi.',
    },
    master: {
      title: 'Usta ilovasi',
      note: 'Vazifalar va fotohisobot 5-bosqichda tayyor bo‘ladi.',
    },
    staff: {
      greeting: (name: string) => `Salom, ${name}`,
      youAre: (roles: string) => `Siz ${roles} sifatida ro‘yxatdasiz.`,
      panelHint: 'Ish paneli kompyuter yoki planshet brauzerida ochiladi.',
      openPanel: 'Panelni ochish',
      noPanel: 'Panel manzili hali sozlanmagan. Egasiga murojaat qiling.',
    },
  },
};
