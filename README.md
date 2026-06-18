# APM JKN Bot

Layanan HTTP lokal (Windows) yang mengendalikan **Aplikasi Sidik Jari BPJS** dan **Aplikasi FRISTA** dari browser APM/SIMRS. Service ini berjalan di background pada workstation Anjungan Pendaftaran Mandiri (APM) dan merespons request `POST` dari halaman web APM untuk membuka aplikasi sidik jari / FRISTA, login otomatis, lalu menutup window setelah proses selesai.

```
┌─────────────┐    fetch()    ┌──────────────────┐    AutoIt     ┌────────────────────┐
│  Web APM /  │ ────────────▶ │  apm-jkn-bot     │ ────────────▶ │ Aplikasi Sidik     │
│  SIMRS      │   POST /      │  (Node.js HTTP)  │   keyboard/   │ Jari / FRISTA      │
│  (browser)  │ ◀──────────── │  port 3684       │   mouse      │ (Windows)          │
└─────────────┘    JSON       └──────────────────┘              └────────────────────┘
```

> **Catatan keamanan**: Service di-bind ke `127.0.0.1` saja, tidak terekspos ke jaringan. Jangan ubah ke `0.0.0.0` kecuali Anda paham implikasinya.

## Fitur

- Mengendalikan Aplikasi Sidik Jari BPJS Kesehatan (`After.exe`) via `node-autoit-koffi`
- Mendukung multi-target: `fp` (default) dan `frista` (stub, belum diimplementasi)
- Multi-instance per target — FP dan FRISTA bisa berjalan paralel
- Validasi konfigurasi saat startup (fail-fast)
- Validasi request body pakai zod
- Logging terstruktur (winston) ke console + file rotation
- Smoke test berbasis curl

## Instalasi

### Prasyarat

- Windows 10/11
- Node.js >= 20 (otomatis di-install oleh `install.ps1`)
- Aplikasi Sidik Jari BPJS dan/atau FRISTA sudah ter-install

### Langkah

1. **Extract** project ini ke sebuah folder (mis. `C:\apm-jkn\`)
2. **Buat `.env`** dari template:
   ```powershell
   Copy-Item .env.example .env
   ```
3. **Edit `.env`** — sesuaikan path installer, kredensial, dan window title sesuai instalasi lokal Anda.
4. **Jalankan installer** sebagai Administrator:
   - Klik kanan `install.ps1` → **Run with PowerShell**
   - Jika muncul prompt Execution Policy, ketik `A` (Yes to All)
5. Setelah selesai, service berjalan via **PM2** dengan nama proses `apm-jkn-bot`, listen di `http://127.0.0.1:3684`.

> `install.ps1` mengaktifkan **pnpm** via **corepack** (built-in Node.js), sehingga tidak perlu install pnpm terpisah.

### Verifikasi service berjalan

```powershell
pm2 status
pm2 logs apm-jkn-bot
```

Atau cek endpoint health:

```powershell
curl http://127.0.0.1:3684/
```

Response:
```json
{
  "name": "apm-jkn-bot",
  "version": "0.1.0",
  "message": "Layanan APM JKN siap. Kirim POST untuk trigger aksi.",
  "targets": ["fp", "frista"],
  "actions": ["scan", "test_load", "close", "hide"]
}
```

## Konfigurasi

Semua konfigurasi ada di file `.env`. Template lengkap di `.env.example`.

| Variabel | Default | Keterangan |
|---|---|---|
| `SERVER_PORT` | `3684` | Port HTTP server |
| `LOG_LEVEL` | `info` | Level log: `error`, `warn`, `info`, `debug` |
| `SIMRS_WIN_TITLE` | (kosong) | Judul window SIMRS di Chrome, untuk toggle on-top. Kosongkan jika tidak perlu |
| `FP_WIN_TITLE` | `Aplikasi Registrasi Sidik Jari` | Judul window Aplikasi Sidik Jari |
| `FP_INS_PATH` | `C:\...\After.exe` | Path lengkap installer/executable |
| `FP_USERNAME` | (wajib) | Username login Aplikasi Sidik Jari |
| `FP_PASSWORD` | (wajib) | Password login |
| `FP_MOVE_LEFT` | `680` | Offset window ke kiri (px) |
| `FP_MOVE_DOWN` | `600` | Offset window ke bawah (px) |
| `FRISTA_*` | (lihat `.env.example`) | Sama seperti di atas, untuk target FRISTA |

> **Path Windows dengan spasi** (mis. `Program Files (x86)`) perlu di-quote pakai single-quote di `.env`. Contoh: `FP_INS_PATH='C:\Program Files (x86)\...\After.exe'`

## Penggunaan

Service menerima `POST` ke `/` dengan body `application/x-www-form-urlencoded` atau `application/json`.

### Aksi yang tersedia

| `action` | `target` | Keterangan |
|---|---|---|
| `scan` | `fp` / `frista` | Buka aplikasi, login (kalau perlu), input `card_number` |
| `test_load` | `fp` / `frista` | Buka aplikasi, login, lalu tutup (untuk verifikasi kredensial) |
| `close` | `fp` / `frista` | Tutup paksa window aplikasi |
| `hide` | `fp` / `frista` | Bersihkan state & toggle window on-top |

### Contoh: Trigger scan dari web APM (JavaScript)

**Target: Aplikasi Sidik Jari BPJS** (default)
```js
async function openFingerprint() {
  const response = await fetch('http://127.0.0.1:3684/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'scan',
      target: 'fp',           // opsional, default 'fp'
      card_number: '0001234567890',
      exit: true,             // tunggu window close (opsional, default false)
      wait: 5000              // ms, jeda setelah login (opsional, default 5000)
    })
  });

  if (response.ok) {
    // Sukses setelah window sidik jari tertutup
  } else {
    const err = await response.json();
    alert(err.message);
  }
}
```

**Target: FRISTA** (saat ini stub)
```js
async function openFrista() {
  const response = await fetch('http://127.0.0.1:3684/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'scan',
      target: 'frista'
    })
  });
  // ...
}
```

### Contoh dengan form-urlencoded (backward-compatible)

```js
body: new URLSearchParams({
  action: 'scan',
  target: 'fp',
  card_number: '0001234567890',
  exit: 'true',
  wait: '5000'
})
```

### Contoh dengan curl (untuk testing)

```bash
# Health check
curl http://127.0.0.1:3684/

# Test load (verifikasi kredensial)
curl -X POST http://127.0.0.1:3684/ \
  -H "Content-Type: application/json" \
  -d '{"action":"test_load","target":"fp"}'

# Scan BPJS
curl -X POST http://127.0.0.1:3684/ \
  -H "Content-Type: application/json" \
  -d '{"action":"scan","target":"fp","card_number":"0001234567890","exit":true,"wait":5000}'

# Tutup aplikasi
curl -X POST http://127.0.0.1:3684/ \
  -H "Content-Type: application/json" \
  -d '{"action":"close","target":"fp"}'
```

## Multi-target & Concurrency

Setiap `target` (`fp`, `frista`) memiliki instance bot sendiri dengan `abort` flag independen. Artinya:

- `target=fp` sedang scan dan `target=frista` di-trigger → keduanya jalan paralel.
- `action=close` untuk `target=fp` hanya men-set abort flag untuk instance FP, tidak menggangu FRISTA.

## Observasi Koordinat FRISTA

Bot FRISTA perlu koordinat klik untuk: field username, field password, tombol login, input NIK/No Kartu, dan tombol trigger face recognition. Koordinat disimpan di `.env` (bukan hardcode) supaya teknisi RS bisa tweak tanpa edit kode.

### Tools

1. **Download & install** [AutoIt full installer](https://www.autoitscript.com/site/autoit/downloads/) (~30MB). Pilih "Full Installation" supaya dapat `Au3Info.exe`.
2. **Jalankan** `C:\Program Files (x86)\AutoIt3\Au3Info.exe`
3. **Buka FRISTA** manual dan login (jangan tutup)
4. **Drag Finder Tool** (icon kotak-kecil) dari Au3Info ke field/button manapun

### Yang Dicatat

Di tab **Mouse** Au3Info, lihat bagian "Position relative to window" → catat X dan Y. Di tab **Control**, catat juga `ClassnameNN` (mis. `Edit1`) untuk robustness (future improvement).

### Field yang Diperlukan

| Field (di .env) | Fungsi |
|---|---|
| `FRISTA_OFFSETS_USERNAME_FIELD_X/Y` | Klik field username di layar login |
| `FRISTA_OFFSETS_PASSWORD_FIELD_X/Y` | Klik field password |
| `FRISTA_OFFSETS_LOGIN_BUTTON_X/Y` | Klik tombol "Login" |
| `FRISTA_OFFSETS_CARD_INPUT_X/Y` | Klik field NIK/No Kartu setelah login |
| `FRISTA_OFFSETS_SCAN_BUTTON_X/Y` | Klik tombol trigger face recognition |

### Workflow

1. Drag Finder ke field username → catat X,Y → tulis ke `.env` (ganti `0` dengan nilai asli)
2. Ulangi untuk field/button lainnya
3. `pnpm dev` → `curl -X POST http://127.0.0.1:3684/ -H "Content-Type: application/json" -d '{"action":"test_load","target":"frista"}'`
4. Amati FRISTA: apakah terbuka, kredensial terisi, lalu tertutup?
5. Kalau ada yang miss, cek `logs/app.log` untuk konfirmasi koordinat yang dipakai bot
6. Kalau error, screenshot tersimpan otomatis di `logs/errors/<timestamp>-frista.png` (best-effort via PowerShell + .NET)

### Catatan

- **DPI scaling harus 100%** di Windows Display Settings, atau koordinat akan meleset proporsional dengan scale factor
- Field `0/0` di `.env` akan di-skip dengan warning — tidak crash
- Screenshot di-capture via PowerShell (`Add-Type` + `System.Drawing`) sebagai fallback kalau library `node-autoit-koffi` tidak expose `screenshot`. Mengambil **seluruh layar** (bukan crop ke window).

## Struktur Project

```
apm-jkn/
├── src/
│   ├── config.js          # zod-validated env loader
│   ├── logger.js          # winston setup
│   ├── errors.js          # AppError & subclass
│   ├── server.js          # HTTP server, request validation
│   └── bot/
│       ├── index.js       # dispatcher
│       ├── fp.js          # handler Aplikasi Sidik Jari
│       ├── frista.js      # handler FRISTA (stub)
│       └── helpers.js     # delay, ensureWindow, forceClose
├── test/
│   └── smoke.sh           # curl-based smoke test
├── logs/                  # log rotation output (auto-generated)
├── .env                   # konfigurasi lokal (TIDAK di-commit)
├── .env.example           # template konfigurasi
├── eslint.config.js       # ESLint v9 flat config
├── .prettierrc
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml    # konfigurasi pnpm (allowBuilds)
├── install.ps1            # installer Windows
├── pm2-start.bat          # resurrect PM2 saat startup
└── README.md
```

## Development

```bash
# Install deps
pnpm install

# Run dengan hot-reload
pnpm dev

# Lint
pnpm lint

# Format
pnpm format

# Smoke test (server harus sudah berjalan)
pnpm smoke
```

### Menambah Target Baru (mis. Bridging VClaim)

1. Tambahkan konfigurasi di `src/config.js` (schema & loader)
2. Tambah env block di `.env` & `.env.example`
3. Buat `src/bot/<target>.js` dengan export `{ testLoad, scan, close, hide }`
4. Daftarkan di `src/bot/index.js` (`handlers = { fp, frista, vclaim }`)

## Troubleshooting

### `ConfigError: Konfigurasi .env tidak valid`

Periksa file `.env`. Variabel wajib hilang atau format salah. Lihat pesan error spesifik dari zod (mis. `targets.fp.WIN_TITLE: String must contain at least 1 character(s)`).

### `Error: Cannot find module 'node-autoit-koffi'`

Jalankan `pnpm install` lagi. Modul ini butuh build script native — pastikan `pnpm-workspace.yaml` punya:
```yaml
allowBuilds:
  koffi: true
  ref-napi: true
```

### `EADDRINUSE: address already in use :::3684`

Port sudah dipakai. Cek:
```powershell
netstat -ano | findstr :3684
taskkill /PID <pid> /F
```

Atau ubah `SERVER_PORT` di `.env`.

### Window Aplikasi tidak ditemukan

- Pastikan `FP_WIN_TITLE` di `.env` cocok dengan judul window tepat (case-sensitive)
- Cek via **Window Spy** (tool bawaan AutoIt) atau Task Manager → Details → buka aplikasi
- Untuk Windows 10/11 dengan DPI scaling,judul window kadang beda — verifikasi manual

### Service tidak start saat boot

Cek PM2 startup:
```powershell
pm2 status
pm2 save
pm2-startup    # akan print instruksi setup
```

File `pm2-startup.bat` di Startup folder menjalankan `pm2 resurrect` saat Windows boot.

## Lisensi

MIT — lihat [LICENSE](./LICENSE).

## Kredit

- [`node-autoit-koffi`](https://www.npmjs.com/package/node-autoit-koffi) — binding AutoIt untuk Node.js, dipakai untuk simulasi keyboard/mouse ke aplikasi Windows.
- [zod](https://zod.dev/) — validasi runtime.
- [winston](https://github.com/winstonjs/winston) — logging.
