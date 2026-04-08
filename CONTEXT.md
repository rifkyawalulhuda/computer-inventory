# Computer Inventory Context

## Ringkasan

Repository ini adalah aplikasi inventory perangkat berbasis:

- Frontend statis `HTML + CSS + vanilla JavaScript`
- Backend `Node.js + Express + TypeScript`
- ORM `Prisma`
- Database `PostgreSQL`

Fokus domain aplikasi:

- autentikasi user admin/user
- master data department
- master user
- data perangkat
- flow approval perangkat
- generate BAST PDF dan notifikasi email

## Cara Menjalankan

Dari root project:

```bash
npm run dev:lan
```

Service lokal utama:

- frontend: `http://localhost:88/auth-login.html`
- backend API: `http://localhost:3001/api`

Script root di `package.json`:

- `dev:lan`: jalankan backend dan static web sekaligus
- `dev:web:lan`: jalankan frontend statis di port 88
- `dev:api`: jalankan backend saja

## Struktur Root

File halaman utama:

- `auth-login.html`: halaman login
- `index.html`: dashboard utama
- `department.html`: master department
- `master-user.html`: master user
- `data-perangkat.html`: daftar data perangkat
- `data-perangkat-form.html`: form tambah/edit perangkat
- `flow-proses.html`: halaman flow approval perangkat
- `profile-details.html`: profil user

Folder penting:

- `assets/`: CSS, JavaScript, gambar, vendor frontend
- `backend/`: API, Prisma schema, mailer, PDF BAST
- `docs/`: dokumentasi tema/aset dan diagram proyek
- `partials/`: partial HTML tambahan
- `.github/workflows/`: workflow release GitHub
- `.cloudflared/`: file tunnel/cloudflared lokal
- `.netlify/` dan `netlify.toml`: konfigurasi deploy frontend ke Netlify

Folder besar yang bukan inti logika:

- `node_modules/`
- `backend/node_modules/`
- `backend/dist/`
- asset vendor/minified di `assets/vendors/`

## Frontend

Frontend memakai file HTML per halaman, bukan framework SPA.

Konfigurasi frontend utama:

- `assets/js/runtime-config.js`: menyiapkan `window.APP_CONFIG`
- `assets/js/app-config.js`: resolve `API_BASE`, `API_ORIGIN`, dan URL aset
- `assets/js/auth-client.js`: session storage/local storage, login redirect, bearer token, validasi sesi
- `assets/js/theme-mode.js`: mode tema

Pola frontend:

- setiap halaman memuat CSS tema dari `assets/css/`
- otorisasi halaman dilakukan dari script `AuthClient.requireAuth()`
- request API dilakukan ke `window.AppConfig.API_BASE`
- frontend menyimpan token auth di localStorage atau sessionStorage

Halaman operasional utama:

- `data-perangkat.html`: list perangkat, filter, import/export, aksi data, dan drawer detail perangkat
- `data-perangkat-form.html`: form create/update perangkat
- `flow-proses.html`: monitoring approval, reject note, tanda tangan digital, cetak BAST
- `department.html`: CRUD department dan import Excel
- `master-user.html`: CRUD user admin/user

Perubahan UI terbaru yang penting:

- `data-perangkat-form.html` memiliki field baru `Site Code Sistem POMS`
- field `Site Code Sistem POMS` memakai dropdown yang mengambil opsi dari master `Department.code`
- field `Site Code Sistem POMS` tidak menentukan relasi department perangkat, hanya menyimpan nilai site code terpisah
- drawer detail di `data-perangkat.html` dan `data-perangkat-form.html` sudah menampilkan `Site Code Sistem POMS`
- tabel utama di `flow-proses.html` sudah tidak menampilkan kolom `Lease Status`, tetapi status lease masih tersedia di data/detail lain

## Backend

Backend entry points:

- `backend/src/server.ts`: start server dari `HOST` dan `PORT`
- `backend/src/app.ts`: registrasi middleware, static `/img`, dan semua route `/api`

Route yang terpasang:

- `healthRouter`: health check
- `authRouter`: login, profile, session
- `deviceRouter`: list device sederhana
- `deviceRecordRouter`: fitur utama data perangkat dan flow proses
- `departmentRouter`: CRUD department + import/export template
- `masterUserRouter`: CRUD user

Middleware:

- `backend/src/middleware/auth.ts`: validasi bearer token dan role guard

Library internal:

- `backend/src/lib/auth.ts`: pembuatan dan validasi token auth
- `backend/src/lib/prisma.ts`: singleton Prisma client
- `backend/src/lib/mailer.ts`: email notifikasi flow approval/reject/BAST
- `backend/src/lib/bast-pdf.ts`: generate PDF BAST
- `backend/src/lib/profile-photo.ts`: simpan dan resolve foto profil user

## API Summary

Endpoint penting yang terlihat dari source dan README backend:

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/profile`
- `GET /api/devices`
- `GET /api/departments`
- `POST /api/departments`
- `PUT /api/departments/:id`
- `DELETE /api/departments/:id`
- `GET /api/master-users`
- `POST /api/master-users`
- `PUT /api/master-users/:id`
- `DELETE /api/master-users/:id`
- `GET /api/device-records`
- `POST /api/device-records`

Area `device-records` juga menangani:

- import/export Excel
- flow submit/approve/reject/resubmit
- tanda tangan digital user dan pengirim
- generate/cetak BAST
- update lease status tertentu seperti `Back To KDDI`
- penyimpanan field `Site Code Sistem POMS`
- pembatasan edit field tertentu berdasarkan role, termasuk `Site Code Sistem POMS` yang hanya boleh diubah admin saat edit

## Data Model

Prisma schema utama ada di `backend/prisma/schema.prisma`.

Model domain yang penting:

- `Department`
- `DepartmentJobCode`
- `MasterUser`
- `Location`
- `DeviceCategory`
- `DeviceModel`
- `Employee`
- `Device`
- `DeviceIp`
- `DeviceAssignment`
- `LeaseContract`
- `RemoteAccessProfile`

Relasi bisnis utama:

- `Department` punya banyak `Device` dan `MasterUser`
- `Device` terhubung ke category, model, location, assignment, IP, dan lease contract
- `LeaseContract` menyimpan start/end date, days lease, lease status, history log
- `Device` menyimpan metadata flow approval seperti `flowStatus`, approver, reject note, signatures

Field perangkat yang perlu diperhatikan:

- `Device.pomsSiteCodeSystem`: site code tambahan untuk kebutuhan Sistem POMS
- field ini bersifat independen dari `Device.jobCodeId`
- validasinya tetap mengambil daftar site code dari master `Department`

## Environment Backend

Contoh variabel ada di `backend/.env.example`:

- `DATABASE_URL`
- `HOST`
- `PORT`
- `NODE_ENV`
- `MAIL_NOTIFICATIONS_ENABLED`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `APP_WEB_BASE_URL`

Catatan:

- backend expose static file pada `/img`
- email notifikasi aktif jika konfigurasi SMTP valid
- link email mengarah ke `APP_WEB_BASE_URL`

## Database & Migration

Prisma migration berada di:

- `backend/prisma/migrations/`

Isi migration menunjukkan evolusi schema seperti:

- inisialisasi schema awal
- penyesuaian department/job code
- penambahan master user
- penambahan flow process perangkat
- penambahan relasi pengirim approval
- penambahan kolom `poms_site_code_system` pada tabel `devices`

## Dokumentasi dan Aset Tambahan

Di folder `docs/` saat ini masih ada:

- `documentations.html`
- `Flow Alur Ganti Job Code.drawio`
- asset dokumentasi tema di `docs/assets/`
- HTML dokumentasi vendor di `docs/html/`

Di folder `partials/`:

- `customizer.html`

## Catatan Kerja

Jika mau melanjutkan pengembangan, area yang paling sentral biasanya:

- `flow-proses.html`
- `data-perangkat.html`
- `data-perangkat-form.html`
- `backend/src/routes/device-records.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260408193000_add_device_poms_site_code_system/migration.sql`
- `assets/js/app-config.js`
- `assets/js/auth-client.js`

## Batas Ringkasan

File ini fokus pada struktur aplikasi aktif, alur bisnis, dan file inti yang relevan untuk pengembangan harian.
