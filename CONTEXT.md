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
- workflow perubahan Job Code dan transfer perangkat antar site/department
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
- `data-email.html`: daftar data email
- `data-email-form.html`: form tambah/edit data email
- `flow-proses.html`: halaman flow approval perangkat dan request perubahan Job Code / transfer site
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
- `data-email.html`: list akun email, filter, import/export, aksi data, dan drawer detail email
- `data-email-form.html`: form create/update akun email
- `flow-proses.html`: monitoring approval perangkat, request perubahan Job Code / transfer site, reject note, tanda tangan digital, cetak BAST
- `department.html`: CRUD department dan import Excel
- `master-user.html`: CRUD user admin/user

Perubahan UI terbaru yang penting:

- `data-perangkat-form.html` memiliki field baru `Site Code Sistem POMS`
- field `Site Code Sistem POMS` memakai dropdown yang mengambil opsi dari master `Department.code`
- field `Site Code Sistem POMS` tidak menentukan relasi department perangkat, hanya menyimpan nilai site code terpisah
- field `Site Code Sistem POMS` ditempatkan sebelum field `Department`
- field `Site Code Sistem POMS` hanya bisa diedit oleh role admin saat edit perangkat
- drawer detail di `data-perangkat.html` dan `data-perangkat-form.html` sudah menampilkan `Site Code Sistem POMS`
- import Excel dan template Excel `Data Perangkat` sudah menyertakan kolom `Site Code Sistem POMS`
- user tidak bisa lagi mengubah `Job Code` langsung dari form edit perangkat
- form edit user menyediakan tombol `Ubah Job Code` yang membuka popup request workflow
- popup request mendukung kategori `Ganti Job Code` dan `Transfer ke Site lain`
- dropdown `PIC Tujuan` untuk kategori `Transfer ke Site lain` harus mengambil user dari `Department Tujuan`, bukan requester yang sedang login
- `flow-proses.html` menampilkan item gabungan antara flow approval perangkat biasa dan request `DeviceChangeRequest`
- tabel utama di `flow-proses.html` sudah tidak menampilkan kolom `Lease Status`, tetapi status lease masih tersedia di drawer detail
- `flow-proses.html` mendukung aksi request baru: `approve`, `reject`, dan `assign-job-code`
- confirm box aksi approve di `flow-proses.html` sudah tidak memakai `window.confirm`, tetapi modal custom yang mengikuti template
- tab status `Pending` di `flow-proses.html` memakai warna aktif oranye mengikuti status pending
- kolom `Department` dan `PIC Name` di tabel `Flow Proses` diprioritaskan dari requester/submitted-by agar tampil sebagai histori, bukan mengikuti PIC/department perangkat terbaru
- `index.html` bell notification menampilkan request `Ganti Job Code` dan `Transfer Site` untuk admin atau PIC reviewer yang sedang dituju
- dropdown notifikasi di `index.html` dipisah menjadi section `Workflow` dan `Lease`
- urutan notifikasi sekarang mengutamakan item terbaru di paling atas; item lama terdorong ke bawah saat ada notifikasi baru
- reject untuk flow `Ganti Job Code` dan `Transfer Site` tidak lagi menjadi prioritas utama di notifikasi workflow dan tidak menambah badge reject pada navbar/sidebar flow
- tombol `All Notifications` di dropdown bell sekarang membuka modal notifikasi penuh dengan daftar history yang lebih lengkap, bukan langsung pindah halaman
- modal `All Notifications` memakai sumber data yang sama dengan dropdown bell, tetapi tanpa limit 5 item per section dan dengan pesan notifikasi yang tidak dipotong
- dashboard `index.html` sekarang punya menu `Data Email` di bawah `Data Perangkat`
- fitur `Data Email` mengikuti pola `Data Perangkat` untuk list, form, drawer detail, import template, import Excel, dan export
- role admin bisa create/edit/import/export semua Data Email
- role user hanya bisa melihat Data Email milik department sendiri dan hanya boleh mengubah `Password` serta `Keterangan`
- kolom `Perangkat` pada `Data Email` mengambil hostname perangkat yang terhubung lewat relasi langsung atau fallback kecocokan email lama
- field `Data Email` yang dipakai saat ini: `No`, `Department`, `Job Code`, `Nama User`, `Email`, `Location`, `Jenis License`, `Password`, `Keterangan`, dan `Perangkat`
- dropdown `Jenis License` mengikuti value literal: `Miccrosoft 365 Business Basic`, `Miccrosoft 365 Business Standard`, dan `Miccrosoft 365 E1`
- `data-email-form.html` memakai mode create/edit terpisah seperti halaman form existing, dengan readonly berbasis role langsung di frontend dan backend

## Backend

Backend entry points:

- `backend/src/server.ts`: start server dari `HOST` dan `PORT`
- `backend/src/app.ts`: registrasi middleware, static `/img`, dan semua route `/api`

Route yang terpasang:

- `healthRouter`: health check
- `authRouter`: login, profile, session
- `deviceRouter`: list device sederhana
- `deviceRecordRouter`: fitur utama data perangkat dan flow proses
- `emailRecordRouter`: fitur utama data email
- `departmentRouter`: CRUD department + import/export template
- `masterUserRouter`: CRUD user

Middleware:

- `backend/src/middleware/auth.ts`: validasi bearer token dan role guard

Library internal:

- `backend/src/lib/auth.ts`: pembuatan dan validasi token auth
- `backend/src/lib/prisma.ts`: singleton Prisma client
- `backend/src/lib/mailer.ts`: email notifikasi flow approval/reject/BAST dan email workflow `DeviceChangeRequest`
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
- `GET /api/email-records`
- `GET /api/email-records/:id`
- `POST /api/email-records`
- `PUT /api/email-records/:id`
- `DELETE /api/email-records/:id`
- `GET /api/email-records/import-template`
- `POST /api/email-records/import`
- `POST /api/email-records/export`
- `GET /api/device-records`
- `POST /api/device-records`
- `POST /api/device-records/:id/change-requests`
- `POST /api/device-change-requests/:id/approve`
- `POST /api/device-change-requests/:id/reject`
- `POST /api/device-change-requests/:id/assign-job-code`

Area `device-records` juga menangani:

- import/export Excel
- flow submit/approve/reject/resubmit
- workflow request perubahan `Job Code` dan `Transfer Site`
- tanda tangan digital user dan pengirim
- generate/cetak BAST
- update lease status tertentu seperti `Back To KDDI`
- penyimpanan field `Site Code Sistem POMS`
- pembatasan edit field tertentu berdasarkan role, termasuk `Site Code Sistem POMS` yang hanya boleh diubah admin saat edit
- pembatasan perubahan `departmentJobCodeId` agar user wajib lewat workflow request
- `GET /api/master-users` untuk role user harus tetap menghormati query `jobCodeId` saat form transfer site meminta daftar PIC department tujuan
- `GET /api/device-records/flows` mengembalikan gabungan flow approval perangkat biasa dan item `DeviceChangeRequest`
- `GET /api/device-records/flows` untuk role user harus menjaga dua perilaku sekaligus:
- request perubahan (`DeviceChangeRequest`) tetap terlihat oleh requester, reviewer aktif, dan `targetPicUserId`
- flow approval perangkat lama (`Device.flowStatus`) tidak ikut pindah ke PIC penerima baru; user hanya melihat flow lama yang memang pernah dia submit/proses atau yang sedang pending ke dirinya
- mapping hasil `GET /api/device-records/flows` untuk kolom `Department` dan `PIC Name` diprioritaskan dari requester/submitted-by agar histori tetap stabil setelah perpindahan site/job code
- `GET /api/device-records/:id` untuk halaman edit perangkat harus tetap mengembalikan `Department` dan `PIC Name` dari current device state, bukan dari mapping histori flow
- edit langsung perangkat oleh admin yang mengubah `Site Code Sistem POMS`, `Department`, `Job Code`, atau `PIC` sekarang juga menyinkronkan `flowAssignedPicUserId` ke PIC terbaru
- edit langsung perangkat oleh admin yang memindahkan kepemilikan/penempatan device menulis marker notifikasi ke histori agar user terkait menerima notifikasi `UPDATED`
- notifikasi edit langsung admin harus bisa diterima oleh PIC lama, PIC baru, atau admin target jika device dipindahkan ke department/job code/PIC milik admin
- `GET /api/device-records/dashboard-summary` sekarang juga mengembalikan `adminEditNotifications` selain ringkasan lease/dashboard biasa
- payload flow gabungan membawa field seperti `flowItemType`, `requestTypeLabel`, `currentStepLabel`, `availableActions`, `Target PIC Name`, dan histori request
- area `email-records` menerapkan scope department untuk role user, validasi readonly di backend, import template Excel, import file Excel, dan export file Excel
- endpoint update `email-records` sengaja belum membuat workflow approval terpisah seperti `DeviceChangeRequest`; implementasi saat ini mengikuti rule paling aman yang konsisten dengan codebase, yaitu non-admin tidak bisa mengubah `Department`, `Job Code`, `Nama User`, `Email`, `Location`, dan `Jenis License` secara langsung

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
- `DeviceChangeRequest`
- `DeviceChangeRequestEvent`
- `EmailAccount`

Relasi bisnis utama:

- `Department` punya banyak `Device` dan `MasterUser`
- `Department` juga punya banyak `EmailAccount`
- `Device` terhubung ke category, model, location, assignment, IP, dan lease contract
- `EmailAccount` terhubung ke `Department`, `DepartmentJobCode`, optional `Location`, dan optional satu `Device`
- relasi utama perangkat-email memakai `Device.emailAccountId -> EmailAccount.id`
- `LeaseContract` menyimpan start/end date, days lease, lease status, history log
- `Device` menyimpan metadata flow approval seperti `flowStatus`, approver, reject note, signatures
- `DeviceChangeRequest` menyimpan workflow perubahan `Job Code` dan transfer site/device di luar `Device.flowStatus`
- `DeviceChangeRequestEvent` menyimpan audit trail setiap aksi request seperti create, approve, reject, dan assign job code
- untuk kompatibilitas data lama, tampilan perangkat di `Data Email` boleh fallback ke kecocokan `Device.userEmailRaw == EmailAccount.email` jika relasi langsung belum terset

Field perangkat yang perlu diperhatikan:

- `Device.pomsSiteCodeSystem`: site code tambahan untuk kebutuhan Sistem POMS
- field ini bersifat independen dari `Device.jobCodeId`
- validasinya tetap mengambil daftar site code dari master `Department`
- `Device.departmentJobCodeId`: untuk role user tidak lagi boleh diedit langsung, perubahan dilakukan melalui `DeviceChangeRequest`

Workflow baru yang perlu dipahami:

- `Ganti Job Code`: user mengajukan perubahan job code dalam department yang sama, lalu admin review dan jika approve maka `Device.departmentJobCodeId` diperbarui
- `Transfer ke Site lain`: user memilih department tujuan dan PIC tujuan, lalu request melewati review PIC tujuan, assign job code tujuan oleh PIC, dan final review admin
- setiap device hanya boleh memiliki satu request perubahan aktif berstatus `PENDING`
- PIC penerima tetap harus bisa melihat request transfer site yang ditujukan kepadanya di halaman `Flow Proses` walaupun request sudah berada di step `FINAL_ADMIN_REVIEW`

Catatan khusus `Data Email`:

- belum ada tabel workflow khusus `Data Email` yang setara `DeviceChangeRequest`
- jika nanti dibutuhkan workflow perubahan `Job Code` atau transfer department untuk akun email, pola yang paling konsisten adalah meniru struktur approval milik `Data Perangkat`, bukan memperbolehkan edit langsung oleh user
- import `Data Email` akan membuat atau mengupdate baris berdasarkan `Email` sebagai key unik

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
- penambahan tabel `device_change_requests`
- penambahan tabel `device_change_request_events`

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
- `index.html`
- `backend/src/routes/device-records.ts`
- `backend/src/routes/email-records.ts`
- `backend/src/lib/mailer.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260408193000_add_device_poms_site_code_system/migration.sql`
- `backend/prisma/migrations/20260408214500_add_device_change_request_workflow/migration.sql`
- `backend/prisma/migrations/20260409120000_add_email_accounts/migration.sql`
- `assets/js/app-config.js`
- `assets/js/auth-client.js`

## Batas Ringkasan

File ini fokus pada struktur aplikasi aktif, alur bisnis, dan file inti yang relevan untuk pengembangan harian.
