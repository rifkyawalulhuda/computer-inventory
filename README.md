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

Jika backend dipisah domain (mis. Railway), ubah `assets/js/runtime-config.js`:

```js
window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.API_BASE = "https://your-backend.up.railway.app/api";
```

## Deploy Backend ke Railway

Lihat panduan lengkap di:

- `docs/deploy-railway.md`
