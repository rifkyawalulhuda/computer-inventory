# Codebase Index

## Ringkasan

`computer-inventory` adalah aplikasi inventory perangkat dengan frontend statis multi-page di root repository dan backend API Express + Prisma di folder `backend/`.

Stack utama:

- Frontend: HTML, CSS, vanilla JavaScript, jQuery, Select2
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL via Prisma
- Fitur domain: auth, master department, master user, data perangkat, flow approval, request ganti job code, transfer site, email notifikasi, generate BAST PDF

## Cara Menjalankan

Root scripts:

- `npm run dev:lan`: jalankan backend dan static frontend bersamaan
- `npm run dev:web:lan`: jalankan frontend statis di port `88`
- `npm run dev:api`: jalankan backend saja

Endpoint lokal default:

- Frontend: `http://localhost:88/auth-login.html`
- API: `http://localhost:3001/api`

## Struktur Utama

### Root frontend

- `auth-login.html`: login
- `index.html`: dashboard, metrics, notification bell, ringkasan flow
- `data-perangkat.html`: tabel utama data perangkat, import/export, delete, back-to-kddi
- `data-perangkat-form.html`: create/edit perangkat, request perubahan job code / transfer site
- `flow-proses.html`: approval flow perangkat dan request perubahan perangkat
- `department.html`: CRUD department dan import template Excel
- `master-user.html`: CRUD user
- `profile-details.html`: profil user dan update password/foto

### Frontend shared scripts

- `assets/js/runtime-config.js`: bootstrap `window.APP_CONFIG`
- `assets/js/app-config.js`: resolve `AppConfig.API_BASE`, `API_ORIGIN`, dan asset URL
- `assets/js/auth-client.js`: token/session storage, guard auth, bearer auth wrapper
- `assets/js/theme-mode.js`: theme handling

### Backend

- `backend/src/server.ts`: start server
- `backend/src/app.ts`: middleware, static `/img`, route mounting `/api`
- `backend/src/routes/auth.ts`: login, profile, current user
- `backend/src/routes/departments.ts`: list, CRUD, template, import department
- `backend/src/routes/master-users.ts`: list dan CRUD user
- `backend/src/routes/devices.ts`: list device sederhana
- `backend/src/routes/device-records.ts`: inti bisnis perangkat, import/export, flow, dashboard, change request
- `backend/src/middleware/auth.ts`: bearer token auth dan role guard
- `backend/src/lib/auth.ts`: token auth
- `backend/src/lib/mailer.ts`: email notifikasi workflow
- `backend/src/lib/bast-pdf.ts`: generate PDF BAST
- `backend/src/lib/profile-photo.ts`: simpan dan resolve foto profil
- `backend/src/lib/prisma.ts`: singleton Prisma client

### Database / schema

- `backend/prisma/schema.prisma`: model domain utama
- `backend/prisma/migrations/`: histori perubahan skema

### Pendukung

- `README.md`: quick start
- `CONTEXT.md`: ringkasan domain dan perubahan terbaru
- `docs/`: dokumentasi tema/vendor dan diagram proyek
- `partials/`: partial HTML tambahan
- `netlify.toml`: konfigurasi deploy frontend

## Arsitektur Singkat

Frontend tidak memakai SPA framework. Setiap halaman HTML berisi script inline yang:

1. memanggil `AuthClient.requireAuth()` atau `requireRole()`
2. mengambil `window.AppConfig.API_BASE`
3. memanggil backend langsung memakai `fetch()` atau `AuthClient.fetchWithAuth()`
4. merender tabel, modal, dan form di halaman itu sendiri

Backend melayani API JSON di `/api`, menggunakan Prisma untuk akses PostgreSQL, lalu mengirim email dan PDF untuk alur tertentu.

## Halaman ke Endpoint

### `auth-login.html`

- `POST /auth/login`

### `profile-details.html`

- `GET /auth/me`
- `PATCH /auth/profile`

### `department.html`

- `GET /departments`
- `GET /departments/template`
- `POST /departments/import`
- `POST /departments`
- `PUT /departments/:id`
- `DELETE /departments/:id`

### `master-user.html`

- `GET /departments`
- `GET /master-users`
- `POST /master-users`
- `PUT /master-users/:id`
- `DELETE /master-users/:id`

### `data-perangkat.html`

- `GET /departments`
- `GET /master-users`
- `GET /device-records`
- `GET /device-records/import-template`
- `POST /device-records/import`
- `POST /device-records/export`
- `POST /device-records`
- `DELETE /device-records/:id`
- `POST /device-records/:id/back-to-kddi`

### `data-perangkat-form.html`

- `GET /departments`
- `GET /master-users`
- `GET /master-users?jobCodeId=...`
- `GET /device-records`
- `GET /device-records/:id`
- `POST /device-records`
- `PUT /device-records/:id`
- `POST /device-records/:id/change-requests`
- `POST /device-records/:id/flow/resubmit`
- `POST /device-records/:id/back-to-kddi`

### `flow-proses.html`

- `GET /device-records/flows`
- `GET /departments`
- `POST /device-change-requests/:id/assign-job-code`
- `POST /device-change-requests/:id/approve`
- `POST /device-change-requests/:id/reject`
- `POST /device-records/:id/flow/approve`
- `POST /device-records/:id/flow/reject`
- `POST /device-records/:id/flow/sender-signature`

### `index.html`

- `GET /device-records`
- `GET /device-records/dashboard-summary`
- `GET /device-records/flows`

## Route API Backend

### Auth

- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/profile`

### Department

- `GET /api/departments`
- `GET /api/departments/template`
- `POST /api/departments/import`
- `POST /api/departments`
- `PUT /api/departments/:id`
- `DELETE /api/departments/:id`

### Master user

- `GET /api/master-users`
- `POST /api/master-users`
- `PUT /api/master-users/:id`
- `DELETE /api/master-users/:id`

### Device list sederhana

- `GET /api/devices`

### Device records / flow

- `GET /api/device-records`
- `GET /api/device-records/dashboard-summary`
- `GET /api/device-records/flows`
- `GET /api/device-records/import-template`
- `POST /api/device-records/import`
- `POST /api/device-records/export`
- `GET /api/device-records/:id`
- `POST /api/device-records/:id/change-requests`
- `POST /api/device-change-requests/:id/approve`
- `POST /api/device-change-requests/:id/reject`
- `POST /api/device-change-requests/:id/assign-job-code`
- `POST /api/device-records`
- `PUT /api/device-records/:id`
- `POST /api/device-records/:id/flow/approve`
- `POST /api/device-records/:id/flow/reject`
- `POST /api/device-records/:id/flow/resubmit`
- `POST /api/device-records/:id/flow/sender-signature`
- `POST /api/device-records/:id/back-to-kddi`
- `DELETE /api/device-records/:id`

## Model Data Penting

Model inti di `backend/prisma/schema.prisma`:

- `Department`: master site / department
- `DepartmentJobCode`: job code dalam department
- `MasterUser`: akun login, role, relasi ke department
- `Device`: data perangkat utama, flow approval, site code POMS
- `LeaseContract`: periode lease, status, history
- `DeviceChangeRequest`: workflow ganti job code / transfer site
- `DeviceChangeRequestEvent`: audit trail request perubahan
- `DeviceIp`, `DeviceAssignment`, `RemoteAccessProfile`: detail tambahan perangkat

Relasi domain utama:

- `Department` punya banyak `MasterUser`, `Device`, dan `DepartmentJobCode`
- `Device` terhubung ke `Department`, `DepartmentJobCode`, `LeaseContract`, dan `DeviceChangeRequest`
- `DeviceChangeRequest` menyimpan reviewer aktif, target PIC, target department, target job code, dan histori event

## Area Paling Sentral

Kalau mau lanjut pengembangan, file yang paling sering jadi pusat perubahan:

- `backend/src/routes/device-records.ts`
- `backend/prisma/schema.prisma`
- `data-perangkat.html`
- `data-perangkat-form.html`
- `flow-proses.html`
- `index.html`
- `backend/src/lib/mailer.ts`
- `assets/js/app-config.js`
- `assets/js/auth-client.js`

## Catatan Implementasi

- `device-records.ts` adalah file backend terbesar dan berisi mayoritas aturan bisnis perangkat.
- `runtime-config.js` saat ini menginisialisasi `window.APP_CONFIG.API_BASE` dengan string kosong; logika resolusi base URL yang aktif ada di `assets/js/app-config.js`.
- Beberapa halaman frontend masih memeriksa `window.AuthClient.getRole()`, sementara helper yang tersedia di `auth-client.js` adalah `getUserRole()`. Area ini layak dicek saat debugging hak akses di UI.
- `CONTEXT.md` sudah menjadi sumber konteks bisnis yang sangat berguna dan sebaiknya dijaga tetap sinkron dengan perubahan fitur.
