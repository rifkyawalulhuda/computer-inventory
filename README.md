# Computer Inventory

Project inventory perangkat dengan frontend statis (HTML/CSS/JS) dan backend `Node.js + Express + Prisma + PostgreSQL`.

## Jalankan Lokal

```bash
npm run dev:lan
```

- Frontend: `http://localhost:88/auth-login.html`
- Backend API: `http://localhost:3001/api`

## Konfigurasi API_BASE (Siap Domain Public)

Konfigurasi endpoint API sekarang dipusatkan di:

- `assets/js/runtime-config.js`
- `assets/js/app-config.js`

Default behavior:

- Lokal (`localhost`/`127.0.0.1`) -> `http://<host>:3001/api`
- Domain public -> `/api` (same-origin)

Jika backend dipisah domain, ubah `assets/js/runtime-config.js`:

```js
window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.API_BASE = "https://api.example.com/api";
```

## Backup Database PostgreSQL di Windows

Sudah tersedia script backup otomatis:

- [`backup-postgresql.bat`](backup-postgresql.bat)
- [`scripts/backup-postgresql.ps1`](scripts/backup-postgresql.ps1)

Script ini:

- membaca `DATABASE_URL` dari `backend/.env`
- menjalankan `pg_dump`
- menyimpan backup ke `backups/postgresql`
- menghapus backup lama yang sudah melewati 14 hari

Jalankan manual:

```powershell
.\backup-postgresql.bat
```

Kalau `pg_dump.exe` belum ada di `PATH`, set env `PG_DUMP_PATH` ke lokasi executable `pg_dump.exe` sebelum menjalankan script.

Untuk auto backup harian, daftarkan `backup-postgresql.bat` ke Windows Task Scheduler dengan trigger sesuai kebutuhan Anda.
