# APM JKN Bot

Layanan HTTP lokal (Windows) yang mengendalikan **Aplikasi Sidik Jari BPJS** dan **Aplikasi FRISTA** dari browser APM/SIMRS. Service berjalan di background pada workstation Anjungan Pendaftaran Mandiri (APM) dan merespons request `POST` dari halaman web APM untuk membuka aplikasi, login otomatis, input data, lalu menutup window.

```
┌─────────────┐    fetch()    ┌──────────────────┐    keyboard    ┌────────────────────┐
│  Web APM /  │ ────────────▶ │  apm-jkn-bot     │ ────────────▶ │ Aplikasi Sidik     │
│  SIMRS      │   POST /      │  (Node.js HTTP)  │   send()     │ Jari / FRISTA      │
│  (browser)  │ ◀──────────── │  port 3684       │              │ (Windows)          │
└─────────────┘    JSON       └──────────────────┘              └────────────────────┘
```

> **Catatan keamanan**: Service di-bind ke `127.0.0.1` saja, tidak terekspos ke jaringan.

## Fitur

- **FP (Aplikasi Sidik Jari BPJS)** — login via keyboard (Tab+Enter), input nomor kartu
- **FRISTA (Face Recognition BPJS)** — login via keyboard (Tab+Space), input NIK
- Multi-target — FP dan FRISTA bisa berjalan paralel
- Auto-start on boot via PM2 + Windows Startup
- Auto-restart jika crash
- Validasi konfigurasi saat startup (fail-fast)
- Logging terstruktur (winston) ke console + file rotation

## Instalasi

### Prasyarat

- Windows 10/11
- Aplikasi Sidik Jari BPJS dan/atau FRISTA sudah ter-install

### Langkah Instalasi

1. **Copy project** ke folder tujuan (mis. `C:\apm-jkn\`)

2. **Buat `.env`** dari template:
   ```powershell
   Copy-Item .env.example .env
   ```

3. **Edit `.env`** — sesuaikan:
   - Path executable aplikasi (`FP_INS_PATH`, `FRISTA_INT_PATH`)
   - Username & password (`FP_USERNAME`, `FP_PASSWORD`, `FRISTA_USERNAME`, `FRISTA_PASSWORD`)
   - Window title jika berbeda (`FP_WIN_TITLE`, `FRISTA_WIN_TITLE`)

4. **Jalankan installer** sebagai Administrator:
   ```powershell
   # Klik kanan install.ps1 → Run with PowerShell
   # Atau:
   Set-ExecutionPolicy Bypass -Scope Process -Force
   .\install.ps1
   ```

5. **Selesai!** Service otomatis berjalan via PM2.

### Apa yang dilakukan `install.ps1`?

| Step | Keterangan |
|---|---|
| Install Node.js | Download & install Node.js 20 LTS (kalau belum ada) |
| Aktifkan pnpm | Via corepack (built-in Node.js) |
| Install dependencies | `pnpm install --prod` |
| Install PM2 | `npm install pm2 -g` |
| Start service | `pm2 start src/server.js --name apm-jkn-bot` |
| Save process list | `pm2 save --force` |
| Setup auto-start | Copy `pm2-startup.bat` ke folder Startup Windows |

### Verifikasi

```powershell
# Cek status PM2
pm2 status

# Cek health endpoint
Invoke-RestMethod -Uri http://127.0.0.1:3684/

# Lihat log realtime
pm2 logs apm-jkn-bot
```

Response health check:
```json
{
  "name": "apm-jkn-bot",
  "version": "0.1.0",
  "message": "Layanan APM JKN siap. Kirim POST untuk trigger aksi.",
  "targets": ["fp", "frista"],
  "actions": ["scan", "test_load", "close", "hide"]
}
```

## Auto-Start on Boot

Service otomatis jalan saat PC/APM dinyalakan:

1. PM2 menyimpan process list ke `~/.pm2/dump.pm2` saat `pm2 save`
2. File `pm2-startup.bat` di folder **Startup** Windows menjalankan `pm2 resurrect` saat boot
3. Semua service yang sebelumnya running akan otomatis start ulang

```powershell
# Simpan ulang process list (setelah ada perubahan)
pm2 save

# Cek apakah startup sudah terkonfigurasi
Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\pm2-startup.bat"
```

### Manajemen Service

```powershell
pm2 status                    # Lihat status semua process
pm2 logs apm-jkn-bot          # Log realtime
pm2 restart apm-jkn-bot       # Restart service
pm2 stop apm-jkn-bot          # Stop service
pm2 delete apm-jkn-bot        # Hapus dari PM2
pm2 save                      # Simpan process list (WAJIB setelah perubahan)
```

## Konfigurasi (`.env`)

| Variabel | Default | Keterangan |
|---|---|---|
| `SERVER_PORT` | `3684` | Port HTTP server |
| `LOG_LEVEL` | `info` | Level log: `error`, `warn`, `info`, `debug` |
| `SIMRS_WIN_TITLE` | (kosong) | Judul window SIMRS Chrome, untuk toggle on-top |
| **FP (Sidik Jari)** | | |
| `FP_WIN_TITLE` | `Aplikasi Registrasi Sidik Jari` | Judul window |
| `FP_INS_PATH` | | Path lengkap `After.exe` |
| `FP_USERNAME` | (wajib) | Username login |
| `FP_PASSWORD` | (wajib) | Password login |
| `FP_MOVE_LEFT` | `680` | Posisi window X (px) |
| `FP_MOVE_DOWN` | `600` | Posisi window Y (px) |
| **FRISTA** | | |
| `FRISTA_WIN_TITLE` | `Aplikasi FRISTA` | Judul window |
| `FRISTA_INT_PATH` | | Path lengkap `frista.exe` |
| `FRISTA_USERNAME` | (wajib) | Username login |
| `FRISTA_PASSWORD` | (wajib) | Password login |
| `FRISTA_MOVE_LEFT` | `680` | Posisi window X (px) |
| `FRISTA_MOVE_DOWN` | `600` | Posisi window Y (px) |

> **Path dengan spasi** harus di-quote pakai single-quote: `FP_INS_PATH='C:\Program Files (x86)\...\After.exe'`

### Konfigurasi FRISTA (`config.conf`)

File `config.conf` berisi konfigurasi khusus FRISTA:

```ini
[Config]
camera_id = 0
api = https://frista.bpjs-kesehatan.go.id/frista-api
```

| Field | Keterangan |
|---|---|
| `camera_id` | ID kamera yang dipakai untuk face recognition (default: `0`) |
| `api` | Endpoint API FRISTA BPJS Kesehatan |

## API Reference

Service menerima `POST` ke `/` dengan body `application/json`.

### Actions

| `action` | `target` | Keterangan |
|---|---|---|
| `scan` | `fp` / `frista` | Buka app → login → input card_number |
| `test_load` | `fp` / `frista` | Buka app → login → tutup (verifikasi kredensial) |
| `close` | `fp` / `frista` | Tutup paksa window |
| `hide` | `fp` / `frista` | Bersihkan state & toggle on-top |

### Parameters

| Parameter | Type | Keterangan |
|---|---|---|
| `action` | string | **Wajib.** `scan`, `test_load`, `close`, `hide` |
| `target` | string | `fp` (default) atau `frista` |
| `card_number` | string | Nomor kartu BPJS/NIK (untuk `scan`) |
| `exit` | boolean | `true` = tunggu window close (opsional) |
| `wait` | number | Jeda setelah login dalam ms (opsional, default 5000) |

### Contoh Penggunaan

#### JavaScript (fetch)

```js
// Scan sidik jari
const res = await fetch('http://127.0.0.1:3684/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'scan',
    target: 'fp',
    card_number: '0001234567890',
    exit: true,
    wait: 5000
  })
});

// Scan FRISTA
const res = await fetch('http://127.0.0.1:3684/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'scan',
    target: 'frista',
    card_number: '0001234567890'
  })
});
```

#### PowerShell

```powershell
# Health check
Invoke-RestMethod -Uri http://127.0.0.1:3684/

# Test load FRISTA
$body = '{"action":"test_load","target":"frista"}'
Invoke-RestMethod -Uri http://127.0.0.1:3684/ -Method POST -ContentType "application/json" -Body $body

# Scan FRISTA dengan nomor kartu
$body = '{"action":"scan","target":"frista","card_number":"0001234567890"}'
Invoke-RestMethod -Uri http://127.0.0.1:3684/ -Method POST -ContentType "application/json" -Body $body

# Tutup aplikasi
$body = '{"action":"close","target":"frista"}'
Invoke-RestMethod -Uri http://127.0.0.1:3684/ -Method POST -ContentType "application/json" -Body $body
```

#### curl

```bash
# Health check
curl http://127.0.0.1:3684/

# Test load
curl -X POST http://127.0.0.1:3684/ \
  -H "Content-Type: application/json" \
  -d '{"action":"test_load","target":"fp"}'

# Scan
curl -X POST http://127.0.0.1:3684/ \
  -H "Content-Type: application/json" \
  -d '{"action":"scan","target":"fp","card_number":"0001234567890"}'
```

## Cara Kerja

### FP (Aplikasi Sidik Jari BPJS)

Keyboard-only approach — tidak perlu mouse, tidak perlu calibration:

```
Buka app → type username → Tab → type password → Enter (login)
→ type nomor kartu → (proses sidik jari otomatis)
```

### FRISTA (Face Recognition BPJS)

Keyboard-only approach — tidak perlu mouse, tidak perlu calibration:

```
Buka app → type username → Tab → type password → Tab → Space (login)
→ type NIK → user klik "Ambil Foto" manual
```

> **Catatan:** FRISTA memerlukan klik manual untuk tombol "Ambil Foto" karena tidak bisa diakses via Tab.

## Multi-target & Concurrency

Setiap `target` (`fp`, `frista`) memiliki instance bot sendiri dengan `abort` flag independen:

- `target=fp` sedang scan dan `target=frista` di-trigger → keduanya jalan paralel
- `action=close` untuk `target=fp` hanya men-stop instance FP, tidak mengganggu FRISTA

## Struktur Project

```
apm-jkn/
├── src/
│   ├── config.js          # zod-validated env loader
│   ├── logger.js          # winston setup
│   ├── errors.js          # AppError & subclass
│   ├── server.js          # HTTP server, request validation
│   └── bot/
│       ├── index.js       # dispatcher (target → handler → action)
│       ├── fp.js          # handler Aplikasi Sidik Jari (keyboard-only)
│       ├── frista.js      # handler FRISTA (keyboard-only)
│       └── helpers.js     # delay, ensureWindow, forceClose, dll
├── test/
│   └── smoke.sh           # curl-based smoke test
├── logs/                  # log rotation output (auto-generated)
├── config.conf            # konfigurasi FRISTA (camera_id, API endpoint)
├── .env                   # konfigurasi lokal (TIDAK di-commit)
├── .env.example           # template konfigurasi
├── eslint.config.js       # ESLint v9 flat config
├── .prettierrc
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml    # konfigurasi pnpm (allowBuilds)
├── install.ps1            # installer Windows (otentikasi Administrator)
├── pm2-start.bat          # resurrect PM2 saat startup
└── README.md
```

## Development

```bash
# Install dependencies
pnpm install

# Run dengan hot-reload (development)
pnpm dev

# Lint
pnpm lint

# Format
pnpm format
```

### Menambah Target Baru

1. Tambahkan konfigurasi di `src/config.js`
2. Tambah env block di `.env` & `.env.example`
3. Buat `src/bot/<target>.js` dengan export `{ testLoad, scan, close, hide }`
4. Daftarkan di `src/bot/index.js`

## Troubleshooting

### `ConfigError: Konfigurasi .env tidak valid`

Periksa file `.env`. Variabel wajib hilang atau format salah.

### `EADDRINUSE: address already in use :::3684`

```powershell
netstat -ano | findstr :3684
taskkill /PID <pid> /F
```

### Window Aplikasi tidak ditemukan

- Pastikan `FP_WIN_TITLE` / `FRISTA_WIN_TITLE` cocok dengan judul window (case-sensitive)
- Cek via Task Manager → Details → lihat judul window

### Service tidak start saat boot

```powershell
# Cek status
pm2 status

# Simpan ulang process list
pm2 save

# Cek file startup
Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\pm2-startup.bat"
```

### Node.js tidak ditemukan

```powershell
# Refresh env variables
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
```

### FRISTA tidak auto-login

- Pastikan Tab order di FRISTA: username → password → login button
- Login submit pakai **Space** (bukan Enter)
- Cek `pm2 logs apm-jkn-bot` untuk detail error

## Lisensi

MIT — lihat [LICENSE](./LICENSE).
