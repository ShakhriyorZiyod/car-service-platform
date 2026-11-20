# Serverga o'rnatish

Docker yo'q: Node.js, PostgreSQL, nginx va systemd (PLAN 17). Bitta server va **bitta** nusxa: bot long
polling bilan ishlaydi, ikkinchi nusxa Telegram'dan `409` oladi va to'xtaydi.

Kerak bo'ladi:

- Ubuntu 22.04 yoki yangiroq, kamida 2 GB RAM (build vaqtida ko'proq kerak bo'ladi), 20 GB disk;
- domen (masalan, `car.example.uz`), u shu serverga qarab turgan bo'lsin;
- **production bot** tokeni: BotFather'da test botdan alohida yaratiladi;
- egasining telefoni: unga panel loginini beramiz, 2-qadam kodi shu odamning Telegram'iga keladi.

Hosting O'zbekistonda tavsiya qilinadi (shaxsiy ma'lumotlar, PLAN 21-bo'lim, 5-savol). Bu hali ochiq savol.

| Nima | Qayerda |
|---|---|
| Kod | `/opt/car-service` |
| Node.js 24 | `/opt/node-24` (tizimdagi Node'ga tegilmaydi) |
| Sozlama | `/etc/car-service.env` (`chmod 640`, `root:carservice`) |
| Fotolar | `/var/lib/car-service/uploads` (systemd yaratadi) |
| Zaxira | `/var/backups/car-service/{daily,monthly}` |
| Loglar | `journalctl -u car-service` (ilova), `/var/log/nginx/car-service.*.log` |

## Birinchi o'rnatish

Serverda allaqachon Caddy va PostgreSQL ishlayotgan bo'lsa (umumiy server), avval pastdagi
**"Caddy'li umumiy server"** bo'limini o'qing: 1- va 7-qadamlar boshqacha.

**1. Dasturlar.** PostgreSQL 14+ (14 va 18 da sinalgan), nginx, certbot, git; tashqi zaxira uchun
rsync. Node.js 24 o'z papkasiga:

```bash
sudo apt install -y postgresql nginx certbot python3-certbot-nginx git rsync curl
curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt | grep linux-x64.tar.xz   # aniq nomini oling
sudo mkdir -p /opt/node-24
curl -fsSL https://nodejs.org/dist/latest-v24.x/node-v24.<x.y>-linux-x64.tar.xz \
  | sudo tar -xJ -C /opt/node-24 --strip-components=1
/opt/node-24/bin/node -v
```

**2. Foydalanuvchi, kod va papkalar:**

```bash
sudo useradd --system --create-home --shell /usr/bin/bash carservice
sudo mkdir -p /opt/car-service /var/backups/car-service
sudo chown carservice: /opt/car-service /var/backups/car-service
sudo -u carservice git clone <repo-manzili> /opt/car-service
```

**3. Baza.** Baza egasi `btree_gist` kengaytmasini migratsiyada o'zi yaratadi (PostgreSQL 13+ da u
"ishonchli" kengaytma):

```bash
sudo -u postgres psql -c "CREATE ROLE carservice LOGIN PASSWORD 'kuchli-parol';"
sudo -u postgres psql -c "CREATE DATABASE carservice OWNER carservice;"
```

Migratsiya `permission denied to create extension` desa, bir marta:
`sudo -u postgres psql -d carservice -c "CREATE EXTENSION btree_gist;"`

**4. Sozlama.** `MEDIA_URL_SECRET` uchun: `openssl rand -hex 32`.

```bash
sudo cp /opt/car-service/deploy/env.example /etc/car-service.env
sudo nano /etc/car-service.env          # PUBLIC_URL, TELEGRAM_BOT_TOKEN, DATABASE_URL, MEDIA_URL_SECRET
sudo chown root:carservice /etc/car-service.env
sudo chmod 640 /etc/car-service.env
```

**5. Build, migratsiya, ma'lumotnomalar va egasi:**

```bash
cd /opt/car-service
export PATH=/opt/node-24/bin:$PATH
sudo -u carservice env PATH=$PATH npm ci
sudo -u carservice env PATH=$PATH npm run build
sudo -u carservice env PATH=$PATH bash -c 'set -a; . /etc/car-service.env; set +a; npm run db:migrate && npm run seed:reference'
sudo -u carservice env PATH=$PATH bash -c 'set -a; . /etc/car-service.env; set +a; npm run owner:create -- --phone=+998901234567 --login=owner --name="Ism Familiya"'
```

`owner:create` parolni so'raydi. `seed:reference` markalar, modellar, ish turlari, zonalar va bekor qilish
sabablarini qo'shadi (faqat bo'sh jadvalga, qayta ishga tushirish xavfsiz). **`seed:demo` production'da
ishga tushirilmaydi:** narxlar, bokslar va ish vaqtini egasi panelda kiritadi (`docs/EGA_UCHUN.md`).

**6. Xizmat:**

```bash
sudo cp deploy/car-service.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now car-service
journalctl -u car-service -n 30          # "bot started" va "http server listening"
curl http://127.0.0.1:3300/health        # {"ok":true} (HTTP_PORT)
```

**7. nginx va HTTPS.** Avval sertifikat, chunki sozlama unga ishora qiladi:

```bash
sudo certbot certonly --nginx -d car.example.uz
sudo cp deploy/nginx.example.conf /etc/nginx/sites-available/car-service
sudo nano /etc/nginx/sites-available/car-service        # car.example.uz ni almashtiring
sudo ln -s /etc/nginx/sites-available/car-service /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Tekshiring:

- `curl -I https://car.example.uz/` va `curl -I https://car.example.uz/admin/` — `Cache-Control: no-cache`;
  panelda `Content-Security-Policy` va `X-Frame-Options: DENY` bor, Mini App'da `X-Frame-Options` **yo'q**
  (Telegram Web uni iframe'da ochadi);
- `/assets/...` va `/admin/assets/...` dagi fayl — `immutable`;
- panelga kirib, biror narsani saqlang: `403 forbidden` chiqsa, nginx `Host` ni uzatmayapti (PLAN 15).

**8. Yangilash huquqi va tungi zaxira:**

```bash
echo 'carservice ALL=NOPASSWD: /usr/bin/systemctl restart car-service, /usr/bin/systemctl stop car-service, /usr/bin/systemctl start car-service' | sudo tee /etc/sudoers.d/car-service
echo '0 3 * * * carservice /usr/bin/bash /opt/car-service/deploy/backup.sh 2>&1 | logger -t car-service-backup' | sudo tee /etc/cron.d/car-service
```

**9. Bot.** BotFather'da production botga nom, tavsif va rasm bering. Menyu tugmasini ilova o'zi
o'rnatadi (`PUBLIC_URL`). Egasi botda **Start** bosadi, ilovani ochadi va
telefonini ulashadi: shundan keyin 2-qadam kodi unga keladi va panelga kira oladi.

## Ishga tushgandan keyin tekshirish

1. Egasi `https://car.example.uz/admin/` ga login, parol va botga kelgan kod bilan kiradi.
2. Sozlamalar: ustaxona, ish vaqti, bokslar, prays (`docs/EGA_UCHUN.md`, "Birinchi kun").
3. Boshqa Telegram akkauntdan bron qilinadi: adminlarga xabar, panelda ariza.
4. `journalctl -u car-service -n 50` da xato yo'q.

## Yangilash

```bash
sudo -u carservice bash /opt/car-service/deploy/deploy.sh
```

Tartib: zaxira → `git pull` → `npm ci` → build → `check:bundle` → migratsiya → qayta ishga tushirish →
`/health` 60 soniya kutiladi. Build yiqilsa, ishlayotgan xizmat o'zgarmaydi. Migratsiyalar faqat qo'shadi
(PLAN 7.1), shuning uchun eski kod yangi bazada ishlab turaveradi.

Yangi versiya yomon chiqsa: `git checkout <eski-commit>`, `npm ci && npm run build`, xizmatni qayta ishga
tushiring. Migratsiya ham orqaga qaytishi kerak bo'lsa — zaxiradan tiklash (pastda).

## Zaxira

Har kecha 03:00 da baza va fotolar, bir xil vaqt belgisi bilan:

- `carservice-<vaqt>.dump` — baza (`pg_dump`, custom format);
- `carservice-<vaqt>.uploads/` — o'sha paytdagi fotolar papkasi.

Fotolar yozilgandan keyin hech qachon o'zgarmaydi (nomi tasodifiy). Shuning uchun har kechaning
nusxasi oldingi kechaning nusxasiga **qattiq havola** (hard link) qilib olinadi va diskda faqat yangi
fotolar joy egallaydi: 1 GB fotoning 30 kunlik zaxirasi taxminan 1 GB, 30 GB emas.

- `daily/` — 30 kun saqlanadi;
- `monthly/` — har oyning birinchi zaxirasi, bir yil (qattiq havola);
- eski nusxalar fayl vaqti bo'yicha emas, **nomidagi sana** bo'yicha o'chiriladi;
- yozilayotgan nusxa `.part` nomida turadi. Dump `pg_restore --list` dan o'tgach, fotolar esa soni
  manbadagidan kam emasligi tekshirilgach nomlanadi;
- `BACKUP_REMOTE` (`/etc/car-service.env`) to'ldirilsa, butun papka `rsync -aH` bilan (havolalar
  saqlanadi) boshqa joyga ko'chiriladi (masalan, `backup@boshqa-server:/srv/car-service-backups/`; SSH
  kaliti `carservice` foydalanuvchisida, `rsync` o'rnatilgan bo'lishi kerak). O'chirilgan nusxalar u yerda
  o'chirilmaydi: tashqi nusxa o'z joyida alohida tozalanadi.

**Muhim:** `BACKUP_REMOTE` bo'sh bo'lsa, zaxira faqat shu serverda turadi va server bilan birga yo'qoladi.

## Tiklash

```bash
ls /var/backups/car-service/daily
sudo -u carservice bash /opt/car-service/deploy/restore.sh /var/backups/car-service/daily/carservice-<vaqt>.dump
```

`yes` deb tasdiqlashni so'raydi, xizmatni to'xtatadi, bazani **bitta tranzaksiyada** almashtiradi (xato
bo'lsa baza o'zgarmay qoladi), o'sha vaqtdagi fotolarni yonidagi papkaga ko'chiradi (havola emas, haqiqiy
nusxa: zaxira o'zgarmaydi), keyin almashtiradi va xizmatni yoqadi.

**Har chorakda tiklash sinovi** (PLAN 17). Ishlayotgan bazaga tegmaydi:

```bash
sudo -u postgres psql -c "CREATE DATABASE carservice_restore_check OWNER carservice;"
sudo -u carservice CHECK_DATABASE_URL=postgres://carservice:<parol>@localhost:5432/carservice_restore_check \
  bash /opt/car-service/deploy/restore.sh /var/backups/car-service/daily/carservice-<vaqt>.dump
sudo -u postgres psql -c "DROP DATABASE carservice_restore_check;"
```

Natijada arizalar, to'lovlar, foydalanuvchilar, fotolar va migratsiyalar soni chiqadi; ularni panel bilan
solishtiring.

## Caddy'li umumiy server

`autoservice.shaxriyorbek.uz` serveri (Eskiz, Ubuntu 22.04) shunday: unda boshqa loyihalar, Caddy
(80/443) va PostgreSQL 14 allaqachon ishlaydi, tizimdagi Node 22. Yuqoridagi tartibdan farqi:

- **Tizimga tegilmaydi.** nginx va certbot o'rnatilmaydi; `apt` bilan faqat yo'q narsa (`rsync` —
  tashqi zaxira kerak bo'lsa). Node 24 `/opt/node-24` da (1-qadam), tizimdagi Node 22 qoladi.
- **Baza** mavjud PostgreSQL 14 da, alohida rol va baza bilan (3-qadam o'zgarmaydi).
- **Port.** 3000 band: `HTTP_PORT=3300` (`deploy/env.example` da shunday). Bo'sh portni `ss -ltn` bilan
  tekshiring.
- **7-qadam o'rniga Caddy.** `deploy/Caddyfile.example` blokini `/etc/caddy/Caddyfile` oxiriga qo'shing
  (boshqa saytlarning bloklariga tegmang), so'ng:

  ```bash
  sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
  ```

  Sertifikatni Caddy o'zi oladi. Access log yozilmaydi (boshqa saytlardagidek): so'rov parametrlarida
  mijoz ismi yoki telefoni bo'lishi mumkin. `reload` boshqa saytlarni to'xtatmaydi.
- **Xotira.** Server boshqa loyihalar bilan umumiy: backend heap'i 256 MB bilan, butun xizmat
  `MemoryMax=512M` bilan cheklangan (`deploy/car-service.service`); `deploy.sh` build'ni `nice` bilan,
  past ustuvorlikda bajaradi. Kamida 2 GB RAM kerak (1 GB'da build va boshqa loyihalar xotirani
  bo'lisha olmaydi).

### Hozirgi production (2026-11-20)

`https://autoservice.shaxriyorbek.uz`, server `138.249.7.81` (SSH porti 2222). RAM 1 GB va boshqa
loyihalar bilan umumiy bo'lgani uchun o'rnatish yuqoridagi tartibdan farq qiladi:

- **Build serverda qilinmaydi.** `npm run build` ishlab chiquvchining kompyuterida bajariladi,
  `apps/server/dist`, `apps/tma/dist`, `apps/admin/dist` arxivlanib serverga yuklanadi va
  `/opt/car-service` ichida (`carservice` egaligida) ochiladi. Serverda faqat backend paketlari:
  `npm ci --omit=dev --workspace=@cs/server` (Node 24, `nice` bilan).
- **Migratsiya va `seed:reference`** kompyuterdan SSH tunnel orqali:
  `ssh -N -L 15432:127.0.0.1:5432 -p 2222 <user>@138.249.7.81`, so'ng
  `DATABASE_URL=postgres://carservice:<parol>@127.0.0.1:15432/carservice npm run db:migrate`.
  Parol `/etc/car-service.env` da.
- **Bu serverda `deploy/deploy.sh` ishga tushirilmaydi:** u build'ni serverda qiladi va bo'sh RAM
  (≈150 MB) bilan boshqa saytlarni bo'g'ib qo'yadi. Yangilash tartibi: kompyuterda `npm run check` →
  build → zaxira (`sudo -u carservice bash /opt/car-service/deploy/backup.sh`) → serverda `git pull`
  (`carservice` nomidan) → dist arxivini yuklab ochish → `npm ci --omit=dev --workspace=@cs/server` →
  tunnel orqali migratsiya → `sudo systemctl restart car-service` → `curl 127.0.0.1:3300/health`.
- **qanchaga** xizmatlari (`qanchaga-api`, `qanchaga-tgbot`, `qanchaga-web`) RAM bo'shatish uchun
  to'xtatilgan va avtomatik ishga tushishi o'chirilgan (egasi roziligi bilan). Qaytarish:
  `sudo systemctl enable --now qanchaga-api qanchaga-tgbot qanchaga-web` (RAM yetishiga ishonch hosil
  qiling).
- Caddy: `/etc/caddy/Caddyfile` oxirida `# >>> car-service` va `# <<< car-service` belgilari orasida;
  o'zgartirishdan oldingi nusxalar `/etc/caddy/Caddyfile.bak-*`.
- Tungi zaxira: `/etc/cron.d/car-service`; `carservice` xizmatni qayta ishga tushira oladi
  (`/etc/sudoers.d/car-service`). Backend ≈ 85 MB RAM ishlatadi.

## Foydali buyruqlar

```bash
journalctl -u car-service -f            # loglar (telefon, ism, token yozilmaydi)
sudo systemctl restart car-service
sudo -u postgres psql carservice        # baza
```

Logda `another instance is polling this bot (409 Conflict)` bo'lsa, shu token bilan boshqa nusxa ishlayapti
(masalan, kimdir lokal `npm run dev` ni production tokeni bilan yoqqan). Ishlab chiqishda faqat test bot
ishlatiladi.
