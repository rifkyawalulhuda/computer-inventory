# Computer Inventory Backend

Backend API untuk inventory perangkat komputer/laptop menggunakan `Node.js + Express + Prisma + PostgreSQL`.

## 1) Install

```bash
npm install
```

## 2) Environment

Copy `.env.example` ke `.env` lalu sesuaikan `DATABASE_URL`.

Contoh:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/computer_inventory?schema=public"
PORT=3001
NODE_ENV=development
```

Opsional: jalankan PostgreSQL via Docker:

```bash
docker compose up -d
```

## 3) Prisma migrate (lintas perangkat)

Untuk development lokal:

```bash
npm run prisma:migrate:dev -- --name init
```

Untuk server/staging/production:

```bash
npm run prisma:migrate:deploy
```

Generate Prisma client:

```bash
npm run prisma:generate
```

## 4) Jalankan API

```bash
npm run dev
```

Health check:

- `GET /api/health`

Contoh list perangkat:

- `GET /api/devices`

Department:

- `GET /api/departments`
- `POST /api/departments`
- `PUT /api/departments/:id`
- `DELETE /api/departments/:id`

Master User:

- `GET /api/master-users`
- `POST /api/master-users`
- `PUT /api/master-users/:id`
- `DELETE /api/master-users/:id`

Data Perangkat:

- `GET /api/device-records`
- `POST /api/device-records`

## Deploy ke Railway (Ringkas)

Jika deploy dari root repo, set `Root Directory` service ke `backend`.

Build command:

```bash
npm ci && npm run prisma:generate && npm run build
```

Start command:

```bash
npm run prisma:migrate:deploy && npm run start
```

Environment minimal:

```env
DATABASE_URL=postgresql://...
NODE_ENV=production
HOST=0.0.0.0
APP_WEB_BASE_URL=https://your-frontend-domain/index.html
```

## Tabel awal dari Excel

Skema awal diturunkan dari file `PC CLC Data List.xlsx` (sheet `PC Lease Data` dan `Daikin Installed`) dengan tabel:

- `devices`
- `device_categories`
- `device_models`
- `locations`
- `departments`
- `employees`
- `device_assignments`
- `lease_contracts`
- `device_ips`
- `remote_access_profiles`

Catatan: beberapa kolom disimpan sebagai `*_raw` agar data lama dari Excel bisa diimpor dulu tanpa kehilangan informasi.
