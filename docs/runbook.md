# Runbook — CSI Portal Backend

## Cara Start/Stop Server

### Development

```bash
# Masuk ke direktori backend
cd csi-dev-BE

# Install dependencies (pertama kali)
npm install

# Start development server (dengan nodemon auto-reload)
npm run dev

# Start production server
npm start

# Stop server
# Ctrl+C di terminal, atau kill process:
pkill -f "node server.js"
```

### Production (PM2)

```bash
# Install PM2 global
npm install -g pm2

# Start dengan PM2
pm2 start server.js --name csi-portal-be

# Stop
pm2 stop csi-portal-be

# Restart
pm2 restart csi-portal-be

# View logs
pm2 logs csi-portal-be

# Auto-start on reboot
pm2 startup
pm2 save
```

---

## Environment Variables

Copy `.env.example` ke `.env` dan isi semua variabel berikut:

```env
# Server
PORT=3000
NODE_ENV=production

# Database (MSSQL)
DB_SERVER=<hostname atau IP SQL Server>
DB_PORT=1433
DB_NAME=CSI
DB_USER=<username SQL Server>
DB_PASSWORD=<password SQL Server>
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false

# JWT
JWT_SECRET=<random string panjang, min 32 karakter>
JWT_REFRESH_SECRET=<random string berbeda, min 32 karakter>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# SMTP (Email)
SMTP_HOST=<smtp server>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<email pengirim>
SMTP_PASS=<password email>
SMTP_FROM=CSI Portal <noreply@example.com>

# Frontend URL (untuk CORS dan link email)
FRONTEND_URL=http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
LOG_DIR=./logs
```

---

## Database Setup Steps

### 1. Buat Database

```sql
CREATE DATABASE CSI;
GO
```

### 2. Buat User SQL Server

```sql
CREATE LOGIN csi_user WITH PASSWORD = 'StrongPassword123!';
USE CSI;
CREATE USER csi_user FOR LOGIN csi_user;
ALTER ROLE db_owner ADD MEMBER csi_user;
GO
```

### 3. Jalankan Migrations

Jalankan file SQL secara berurutan dari direktori `src/database/migrations/`:

```bash
# Menggunakan sqlcmd (SQL Server CLI)
for i in $(ls src/database/migrations/*.sql | sort); do
  echo "Running $i..."
  sqlcmd -S <server> -d CSI -U <user> -P <password> -i "$i"
done
```

Atau jalankan manual via SQL Server Management Studio (SSMS) satu per satu:
- `001_create_master_tables.sql`
- `002_create_mapping_tables.sql`
- ... (sampai)
- `028_add_performance_indexes.sql`

### 4. Seed Data Awal (Opsional)

```bash
# Jika ada seed script
node scripts/seed.js
```

---

## Common Troubleshooting

### Server tidak bisa start

**Gejala**: `Error: connect ECONNREFUSED 127.0.0.1:1433`

**Solusi**:
1. Pastikan SQL Server berjalan: `services.msc` → SQL Server (MSSQLSERVER)
2. Cek `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` di `.env`
3. Pastikan SQL Server mengizinkan TCP/IP connections (SQL Server Configuration Manager)

---

**Gejala**: `Login failed for user 'csi_user'`

**Solusi**:
1. Verifikasi credentials di `.env`
2. Pastikan SQL Server Authentication mode diaktifkan (bukan Windows-only)
3. Cek apakah user memiliki akses ke database `CSI`

---

**Gejala**: `JWT_SECRET is not defined`

**Solusi**:
1. Pastikan file `.env` ada dan berisi `JWT_SECRET`
2. Restart server setelah mengubah `.env`

---

### Email tidak terkirim

**Gejala**: Blast/reminder email gagal

**Solusi**:
1. Cek konfigurasi SMTP di `.env`
2. Test koneksi SMTP: `telnet <SMTP_HOST> <SMTP_PORT>`
3. Cek log di `logs/` untuk detail error
4. Pastikan firewall mengizinkan outbound ke port SMTP

---

### Response 401 di semua endpoint

**Gejala**: Semua API call mengembalikan 401

**Solusi**:
1. Pastikan `JWT_SECRET` di `.env` sama dengan yang digunakan saat token di-generate
2. Cek apakah token sudah expired (default 15 menit)
3. Cek apakah cookie `csi_refresh_token` masih valid

---

### Port sudah dipakai

**Gejala**: `Error: listen EADDRINUSE :::3000`

**Solusi**:
```bash
# Cari process yang menggunakan port 3000
lsof -i :3000
# atau di Windows:
netstat -ano | findstr :3000

# Kill process
kill -9 <PID>
# atau di Windows:
taskkill /PID <PID> /F
```

---

## Rollback Procedure

### Rollback Kode

```bash
# Lihat commit history
git log --oneline -10

# Rollback ke commit tertentu
git checkout <commit-hash>

# Atau revert commit terakhir
git revert HEAD

# Restart server setelah rollback
pm2 restart csi-portal-be
```

### Rollback Database Migration

Tidak ada auto-rollback. Untuk rollback manual:

1. Identifikasi migration yang perlu di-rollback
2. Buat script SQL inverse (DROP INDEX, DROP COLUMN, dll.)
3. Jalankan script inverse via SSMS atau sqlcmd
4. Dokumentasikan perubahan

**Contoh rollback migration 028 (indexes)**:

```sql
USE CSI;
GO
DROP INDEX IF EXISTS IX_Responses_SurveyId ON Responses;
DROP INDEX IF EXISTS IX_Responses_RespondentEmail ON Responses;
DROP INDEX IF EXISTS IX_Responses_ResponseApprovalStatus ON Responses;
DROP INDEX IF EXISTS IX_QuestionResponses_ResponseId ON QuestionResponses;
DROP INDEX IF EXISTS IX_QuestionResponses_TakeoutStatus ON QuestionResponses;
DROP INDEX IF EXISTS IX_AuditLogs_Timestamp ON AuditLogs;
DROP INDEX IF EXISTS IX_AuditLogs_UserId ON AuditLogs;
DROP INDEX IF EXISTS IX_AuditLogs_Action ON AuditLogs;
DROP INDEX IF EXISTS IX_ScheduledOperations_SurveyId ON ScheduledOperations;
DROP INDEX IF EXISTS IX_ScheduledOperations_Status ON ScheduledOperations;
GO
```

---

## Health Check

```bash
# Cek apakah server berjalan
curl http://localhost:3000/api/v1/health

# Expected response:
# {"success":true,"message":"API is healthy","timestamp":"..."}
```

---

## Log Files

Log tersimpan di `logs/` (sesuai konfigurasi `LOG_DIR`):

- `logs/combined.log` — semua log
- `logs/error.log` — error saja

```bash
# Lihat log terbaru
tail -f logs/combined.log

# Cari error
grep "ERROR" logs/combined.log | tail -50
```
