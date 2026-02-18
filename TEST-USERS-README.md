# Test Users untuk CSI Portal

## 📋 Credentials

Semua user menggunakan password yang sama: **admin123**

| Role              | Username    | Password  | Email                  |
|-------------------|-------------|-----------|------------------------|
| SuperAdmin        | superadmin  | admin123  | superadmin@aop.com     |
| AdminEvent        | adminevent  | admin123  | adminevent@aop.com     |
| ITLead            | itlead      | admin123  | itlead@aop.com         |
| DepartmentHead    | depthead    | admin123  | depthead@aop.com       |

## 🚀 Cara Install Test Users

### Opsi 1: Via SQL Server Management Studio (SSMS)

1. Buka SQL Server Management Studio
2. Connect ke SQL Server instance Anda
3. Buka file `test-users.sql`
4. Execute (F5)
5. Verify dengan query:
   ```sql
   SELECT Username, DisplayName, Role FROM Users WHERE CreatedBy = 'system';
   ```

### Opsi 2: Via Command Line (sqlcmd)

```bash
sqlcmd -S localhost -d CSI_Portal -i test-users.sql
```

### Opsi 3: Via Node.js Script

```bash
node -e "const sql = require('mssql'); const fs = require('fs'); const config = require('./src/config'); sql.connect(config.db).then(pool => { const query = fs.readFileSync('test-users.sql', 'utf8'); return pool.request().query(query); }).then(() => console.log('Users created')).catch(console.error);"
```

## 🧪 Testing Task 21 & 22

### 1. Start Server

```bash
npm start
```

### 2. Test Login (Task 21)

Buka browser: **http://localhost:3000/admin/login.html**

#### Test Case 1: SuperAdmin Login
- Username: `superadmin`
- Password: `admin123`
- Expected: Login berhasil, redirect ke dashboard
- Expected Menu: Dashboard, Event Management, Master Data (dengan submenu User, BU, Division, Department, Function, Application)

#### Test Case 2: AdminEvent Login
- Username: `adminevent`
- Password: `admin123`
- Expected: Login berhasil, redirect ke dashboard
- Expected Menu: Dashboard, Event Management, Approval, Best Comments, Reports, Master Data (submenu tanpa User), Mapping

#### Test Case 3: ITLead Login
- Username: `itlead`
- Password: `admin123`
- Expected: Login berhasil, redirect ke dashboard
- Expected Menu: Dashboard, Approval IT Lead

#### Test Case 4: DepartmentHead Login
- Username: `depthead`
- Password: `admin123`
- Expected: Login berhasil, redirect ke dashboard
- Expected Menu: Dashboard, Reports, Best Comments

#### Test Case 5: Invalid Login
- Username: `superadmin`
- Password: `wrongpassword`
- Expected: Error message "Invalid username or password"

#### Test Case 6: Empty Fields
- Username: (kosong)
- Password: (kosong)
- Expected: Validation error messages

### 3. Test Dashboard (Task 22)

Setelah login berhasil:

#### Sidebar Navigation
- ✅ Logo "CSI Portal" tampil
- ✅ Menu items sesuai role
- ✅ Click submenu → expand/collapse
- ✅ Arrow icon berubah (▼ ↔ ▲)
- ✅ Active page highlighted

#### Header
- ✅ User display name tampil
- ✅ User role tampil (dalam Bahasa Indonesia)
- ✅ Logout button tampil

#### Content Area
- ✅ Welcome card tampil
- ✅ Statistics section tampil (loading state atau data)

#### Logout
- ✅ Click logout → redirect ke login
- ✅ Token cleared dari localStorage
- ✅ Tidak bisa akses dashboard tanpa login

### 4. Browser Console Check

Tekan **F12** → Console tab:
- ✅ Tidak ada error merah
- ✅ API calls ke `/api/v1/auth/login` berhasil (status 200)
- ✅ API calls ke `/api/v1/auth/validate` berhasil (status 200)

### 5. LocalStorage Check

Tekan **F12** → Application tab → Local Storage:
- ✅ `csi_token` ada dan berisi JWT token
- ✅ `csi_refresh_token` ada
- ✅ `csi_user` ada dan berisi user object

## 🎯 Expected Sidebar Menu by Role

### SuperAdmin
```
🏠 Dashboard
📊 Event Management
📁 Master Data ▼
   └─ User
   └─ Business Unit
   └─ Division
   └─ Department
   └─ Function
   └─ Application
```

### AdminEvent
```
🏠 Dashboard
📊 Event Management
✅ Approval
💬 Best Comments
📈 Reports
📁 Master Data ▼
   └─ Business Unit
   └─ Division
   └─ Department
   └─ Function
   └─ Application
🔗 Mapping ▼
   └─ Function - Application
   └─ Department - Application
```

### ITLead
```
🏠 Dashboard
✅ Approval IT Lead
```

### DepartmentHead
```
🏠 Dashboard
📈 Reports
💬 Best Comments
```

## 🐛 Troubleshooting

### Login Gagal Terus
1. Check apakah users sudah ter-insert:
   ```sql
   SELECT * FROM Users WHERE Username IN ('superadmin', 'adminevent', 'itlead', 'depthead');
   ```

2. Check server logs untuk error message

3. Check browser console (F12) untuk error

### Server Tidak Start
```bash
# Check port 3000
netstat -ano | findstr :3000

# Kill process jika perlu
taskkill /PID <PID> /F
```

### Database Connection Error
Check `.env` file:
```
DB_SERVER=localhost
DB_DATABASE=CSI_Portal
DB_USER=your_user
DB_PASSWORD=your_password
```

## ✅ Success Criteria

Task 21 & 22 dianggap berhasil jika:
- ✅ Login page load dengan styling yang benar
- ✅ Login dengan 4 role berbeda berhasil
- ✅ Dashboard tampil sesuai role
- ✅ Sidebar menu berbeda per role
- ✅ Logout berfungsi dengan baik
- ✅ Tidak ada error di browser console
- ✅ Token management berfungsi (localStorage)

## 📝 Notes

- Semua user menggunakan **local authentication** (UseLDAP = 0)
- Password di-hash menggunakan **bcrypt** dengan salt rounds 10
- Password untuk testing: **admin123** (jangan gunakan di production!)
- Users dibuat dengan `CreatedBy = 'system'` untuk mudah di-identify
