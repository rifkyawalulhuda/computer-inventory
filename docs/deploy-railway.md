# Deploy Backend ke Railway

Panduan ini untuk deploy API dari folder `backend` ke Railway.

## 1) Buat Service dari Repo

1. Login Railway dan buat project baru dari GitHub repo ini.
2. Pada service backend, set `Root Directory` menjadi `backend`.

## 2) Build dan Start Command

Gunakan command berikut di Railway service:

- Build Command:

```bash
npm ci && npm run prisma:generate && npm run build
```

- Start Command:

```bash
npm run prisma:migrate:deploy && npm run start
```

## 3) Environment Variables

Isi minimal:

- `DATABASE_URL` = koneksi PostgreSQL production
- `NODE_ENV` = `production`
- `HOST` = `0.0.0.0`
- `PORT` = otomatis dari Railway (boleh tidak diisi manual)
- `APP_WEB_BASE_URL` = URL frontend public, contoh `https://inventory.example.com/index.html`

Catatan:

- Railway akan inject `PORT`; backend sudah membaca `process.env.PORT`.
- Pastikan database sudah bisa diakses dari environment Railway.

## 4) Hubungkan Frontend ke API Railway

Set di `assets/js/runtime-config.js`:

```js
window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.API_BASE = "https://your-backend.up.railway.app/api";
```

Lalu deploy/publish frontend Anda.

## 5) Verifikasi

- Buka health check: `https://your-backend.up.railway.app/api/health`
- Buka frontend login, lalu coba sign in.
