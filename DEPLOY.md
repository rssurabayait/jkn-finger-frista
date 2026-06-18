# Deployment Guide

Dokumen ini menjelaskan cara deploy APM JKN Bot di 2 environment:
1. **Komputer dev** (Linux/Windows) untuk development & testing
2. **APM production** (Windows) untuk runtime di rumah sakit

---

## 1. Setup Telegram Bot (sekali, di komputer manapun)

Sebelum deploy ke APM, setup dulu bot Telegram-nya. Cukup sekali, token & chat ID dipakai **sama untuk semua mesin APM**.

### 1.1. Buat Bot Baru
1. Buka Telegram, cari **@BotFather**
2. Kirim `/newbot`
3. Ikuti instruksi, beri nama & username (misal: `apm_rsks_bot`)
4. Simpan **token** yang diberikan (contoh: `8575006242:AAGeDuCbgxvAnv_YsKMUCkyYJDtk7hBvhis`)

### 1.2. Dapatkan Chat ID
**Untuk personal chat (1 orang):**
1. Buka bot Anda di Telegram (klik link `t.me/<username_bot>`)
2. Klik **Start** atau kirim pesan apa saja
3. Buka di browser:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
4. Cari `result[0].message.chat.id` → itu Chat ID Anda

**Untuk group chat (tim):**
1. Buat group Telegram, tambahkan bot Anda ke group
2. Kirim pesan apa saja di group
3. Buka `getUpdates` di browser
4. Cari `result[0].message.chat.id` → Group ID biasanya dimulai `-100`

---

## 2. Komputer Dev (Linux/Windows)

### 2.1. Install Dependency
```bash
# Install Node.js 20 LTS
# Linux (Fedora):
sudo dnf install nodejs npm
# atau pakai nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20

# Enable pnpm via corepack
corepack enable
corepack prepare pnpm@latest --activate

# Install project dependencies
pnpm install
```

### 2.2. Konfigurasi .env
```bash
cp .env.example .env
nano .env  # atau editor lain
```

Isi:
```env
SERVER_PORT=3684
LOG_LEVEL=info

# Identifikasi mesin (dev)
MACHINE_NAME=DEV-LAPTOP-HTM

# Telegram (opsional, untuk testing)
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=8575006242:AAGeDuCbgxvAnv_YsKMUCkyYJDtk7hBvhis
TELEGRAM_CHAT_ID=5936543216

# ... (FP_*, FRISTA_* lainnya seperti .env.example)
```

### 2.3. Test Telegram (Linux only)
Tidak bisa run server di Linux (butuh `node-autoit-koffi` Windows), tapi bisa test Telegram:
```bash
node --env-file=.env scripts/test-telegram.js
```

Akan kirim 5+ pesan test ke Telegram. Sambil script jalan (30 detik), coba kirim `/on`, `/off`, `/status`, `/logs` ke bot dari Telegram Anda.

### 2.4. Jalankan di Windows (untuk test AutoIt)
```bash
pnpm dev
```

Akan start server di `http://127.0.0.1:3684`. Test:
```bash
# Health check
curl http://127.0.0.1:3684/

# Trigger test load
curl -X POST http://127.0.0.1:3684/ \
  -H "Content-Type: application/json" \
  -d '{"action":"test_load","target":"fp"}'
```

---

## 3. APM Production (Windows)

### 3.1. Persiapan (di komputer dev)
1. Pastikan kode sudah lengkap: `git clone` atau copy folder project
2. **WAJIB test dulu** di Windows lokal sebelum copy ke APM

### 3.2. Cara Copy ke Mesin APM
**Opsi A: Git (recommended)**
```bash
# Di komputer dev, push ke repo
git add .
git commit -m "Release v0.2.0"
git push

# Di APM, clone
git clone <repo-url> C:\apm-jkn
cd C:\apm-jkn
```

**Opsi B: Manual copy**
1. Zip folder project (exclude `node_modules`, `logs`, `.env`)
2. Copy ke APM via USB/network share
3. Extract ke `C:\apm-jkn`

### 3.3. Install di APM
Jalankan **PowerShell as Administrator** di mesin APM:
```powershell
cd C:\apm-jkn
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\install.ps1
```

Script akan otomatis:
1. Install Node.js 20 LTS (kalau belum ada)
2. Enable pnpm via corepack
3. Install dependencies production
4. Install PM2 globally
5. Copy `.env.example` ke `.env` (kalau belum ada)
6. **Tanya konfigurasi Telegram** (token, chat ID, nama mesin)
7. Start bot dengan PM2
8. Setup auto-start saat Windows boot

### 3.4. Verifikasi
Setelah install, cek:
```powershell
# Lihat status PM2
pm2 list

# Lihat log
pm2 logs apm-jkn-bot

# Lihat log hanya error/warn
pm2 logs apm-jkn-bot --err
```

Anda harusnya menerima pesan di Telegram:
```
[APM-LOKET-01] Server started di http://127.0.0.1:3684
```

### 3.5. Deploy ke Banyak APM
Untuk deploy ke banyak mesin (misal: Loket-01, IGD-02, RJ-03), tiap mesin:

1. Clone/copy kode yang **sama** dari repo
2. Jalankan `install.ps1`
3. Saat ditanya Telegram, gunakan **token & chat ID yang SAMA** tapi **MACHINE_NAME berbeda**:
   - APM-LOKET-01 → `MACHINE_NAME=APM-LOKET-01`
   - APM-IGD-02 → `MACHINE_NAME=APM-IGD-02`
   - APM-RJ-03 → `MACHINE_NAME=APM-RJ-03`

Semua pesan dari semua APM akan masuk ke **satu chat Telegram yang sama**, dibedakan oleh prefix `[APM-XXX-YY]`.

---

## 4. Perintah Berguna (PM2)

```powershell
# Status semua proses
pm2 list

# Logs real-time
pm2 logs apm-jkn-bot

# Restart bot
pm2 restart apm-jkn-bot

# Stop bot
pm2 stop apm-jkn-bot

# Hapus dari PM2
pm2 delete apm-jkn-bot

# Hapus auto-start
pm2 unstartup

# Simpan list proses (untuk auto-start)
pm2 save
```

---

## 5. Troubleshooting

### Bot tidak start
```powershell
pm2 logs apm-jkn-bot --err
```
Cek error di log. Biasanya:
- `ConfigError: Konfigurasi .env tidak valid` → cek `.env` ada dan isinya benar
- `EADDRINUSE` → port 3684 dipakai proses lain, ganti `SERVER_PORT` di `.env`

### Pesan tidak masuk Telegram
1. Cek `TELEGRAM_ENABLED=true` di `.env`
2. Test manual: `curl "https://api.telegram.org/bot<TOKEN>/getMe"` → harus reply `ok:true`
3. Cek CHAT_ID benar: `curl "https://api.telegram.org/bot<TOKEN>/getUpdates"`
4. Kalau CHAT_ID group, pastikan bot sudah ditambah ke group
5. Restart: `pm2 restart apm-jkn-bot`

### Auto-start tidak jalan setelah reboot
```powershell
pm2 save
pm2-startup  # generate command untuk dijalankan
# Copy command yang muncul, jalankan sebagai Administrator
```

### Update kode di APM
```powershell
cd C:\apm-jkn
git pull  # atau copy file baru
pnpm install --prod
pm2 restart apm-jkn-bot
```

---

## 6. Checklist Deploy

- [ ] Bot sudah dibuat di @BotFather
- [ ] Token disimpan
- [ ] Chat ID didapat (dari `getUpdates` setelah Start bot)
- [ ] Kode sudah di-test di Windows lokal
- [ ] Kode di-clone/copy ke APM
- [ ] `install.ps1` dijalankan di APM sebagai Administrator
- [ ] Telegram config diisi saat prompt install
- [ ] Pesan `[MACHINE_NAME] Server started` masuk ke Telegram
- [ ] Test request `POST /` dari APM web app berhasil
- [ ] Auto-start Windows setup selesai
- [ ] Reboot APM, cek bot auto-start dan kirim heartbeat ke Telegram
