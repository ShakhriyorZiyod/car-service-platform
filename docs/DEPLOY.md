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

**1. Dasturlar.** PostgreSQL 16+, nginx, certbot, git, rsync. Node.js 24 o'z papkasiga:

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
curl http://127.0.0.1:3000/health        # {"ok":true}
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

Har kecha 03:00 da baza (`pg_dump`, custom format) va fotolar papkasi, bir xil vaqt belgisi bilan:
`carservice-<vaqt>.dump` va `carservice-<vaqt>.uploads.tar.gz`.

- `daily/` — 30 kun saqlanadi;
- `monthly/` — har oyning birinchi zaxirasi, bir yil (qattiq havola, joy egallamaydi);
- yozilayotgan fayl `.part` nomida, tugagach va `pg_restore --list` / `gzip --test` dan o'tgach nomlanadi;
- `BACKUP_REMOTE` (`/etc/car-service.env`) to'ldirilsa, butun papka `rsync` bilan boshqa joyga ko'chiriladi
  (masalan, `backup@boshqa-server:/srv/car-service-backups/`; SSH kaliti `carservice` foydalanuvchisida).
  O'chirilgan fayllar u yerda o'chirilmaydi: tashqi nusxa o'z joyida alohida tozalanadi.

**Muhim:** `BACKUP_REMOTE` bo'sh bo'lsa, zaxira faqat shu serverda turadi va server bilan birga yo'qoladi.

## Tiklash

```bash
ls /var/backups/car-service/daily
sudo -u carservice bash /opt/car-service/deploy/restore.sh /var/backups/car-service/daily/carservice-<vaqt>.dump
```

`yes` deb tasdiqlashni so'raydi, xizmatni to'xtatadi, bazani **bitta tranzaksiyada** almashtiradi (xato
bo'lsa baza o'zgarmay qoladi), fotolarni yonida ochib keyin almashtiradi va xizmatni yoqadi.

**Har chorakda tiklash sinovi** (PLAN 17). Ishlayotgan bazaga tegmaydi:

```bash
sudo -u postgres psql -c "CREATE DATABASE carservice_restore_check OWNER carservice;"
sudo -u carservice CHECK_DATABASE_URL=postgres://carservice:<parol>@localhost:5432/carservice_restore_check \
  bash /opt/car-service/deploy/restore.sh /var/backups/car-service/daily/carservice-<vaqt>.dump
sudo -u postgres psql -c "DROP DATABASE carservice_restore_check;"
```

Natijada arizalar, to'lovlar, foydalanuvchilar, fotolar va migratsiyalar soni chiqadi; ularni panel bilan
solishtiring.

## Foydali buyruqlar

```bash
journalctl -u car-service -f            # loglar (telefon, ism, token yozilmaydi)
sudo systemctl restart car-service
sudo -u postgres psql carservice        # baza
```

Logda `another instance is polling this bot (409 Conflict)` bo'lsa, shu token bilan boshqa nusxa ishlayapti
(masalan, kimdir lokal `npm run dev` ni production tokeni bilan yoqqan). Ishlab chiqishda faqat test bot
ishlatiladi.
