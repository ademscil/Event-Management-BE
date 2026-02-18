const sql = require('mssql');
const bcrypt = require('bcrypt');
const config = require('./src/config');

async function insertTestUsers() {
    let pool;
    
    try {
        console.log('🔌 Connecting to database...');
        pool = await sql.connect(config.database);
        console.log('✅ Connected to database:', config.database.database);
        
        const users = [
            {
                username: 'superadmin',
                password: 'admin123',
                displayName: 'Super Admin',
                email: 'superadmin@aop.com',
                role: 'SuperAdmin'
            },
            {
                username: 'adminevent',
                password: 'admin123',
                displayName: 'Admin Event',
                email: 'adminevent@aop.com',
                role: 'AdminEvent'
            },
            {
                username: 'itlead',
                password: 'admin123',
                displayName: 'IT Lead',
                email: 'itlead@aop.com',
                role: 'ITLead'
            },
            {
                username: 'depthead',
                password: 'admin123',
                displayName: 'Department Head',
                email: 'depthead@aop.com',
                role: 'DepartmentHead'
            }
        ];

        console.log('\n🗑️  Deleting existing test users...');
        await pool.request()
            .query(`DELETE FROM Users WHERE Username IN ('superadmin', 'adminevent', 'itlead', 'depthead')`);
        console.log('✅ Existing test users deleted');

        console.log('\n👤 Creating test users...\n');
        
        for (const user of users) {
            try {
                // Generate password hash
                const passwordHash = await bcrypt.hash(user.password, 10);
                
                // Insert user
                await pool.request()
                    .input('username', sql.NVarChar(50), user.username)
                    .input('passwordHash', sql.NVarChar(255), passwordHash)
                    .input('displayName', sql.NVarChar(100), user.displayName)
                    .input('email', sql.NVarChar(100), user.email)
                    .input('role', sql.NVarChar(50), user.role)
                    .input('isActive', sql.Bit, 1)
                    .input('useLDAP', sql.Bit, 0)
                    .query(`
                        INSERT INTO Users (
                            UserId, Username, PasswordHash, DisplayName, Email, 
                            Role, IsActive, UseLDAP, CreatedAt
                        )
                        VALUES (
                            NEWID(), @username, @passwordHash, @displayName, @email,
                            @role, @isActive, @useLDAP, GETDATE()
                        )
                    `);
                
                console.log(`✅ Created: ${user.username.padEnd(15)} | ${user.role.padEnd(20)} | Password: ${user.password}`);
            } catch (error) {
                console.error(`❌ Failed to create ${user.username}:`, error.message);
            }
        }

        // Verify users created
        console.log('\n📋 Verifying users in database...\n');
        const result = await pool.request()
            .query(`
                SELECT Username, DisplayName, Email, Role, IsActive, UseLDAP, CreatedAt
                FROM Users
                WHERE Username IN ('superadmin', 'adminevent', 'itlead', 'depthead')
                ORDER BY Role
            `);

        if (result.recordset.length === 0) {
            console.log('❌ No users found! Something went wrong.');
        } else {
            console.log('✅ Users in database:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            result.recordset.forEach(user => {
                console.log(`   ${user.Username.padEnd(15)} | ${user.DisplayName.padEnd(25)} | ${user.Role.padEnd(20)} | Active: ${user.IsActive}`);
            });
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }

        console.log('\n✅ Test users setup completed!');
        console.log('\n📝 Login Credentials (all passwords: admin123):');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('   Username: superadmin  | Role: SuperAdmin');
        console.log('   Username: adminevent  | Role: AdminEvent');
        console.log('   Username: itlead      | Role: ITLead');
        console.log('   Username: depthead    | Role: DepartmentHead');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n🚀 Now you can start the server: npm start');
        console.log('🌐 Then open: http://localhost:3000/admin/login.html\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('🔌 Database connection closed');
        }
    }
}

// Run the script
insertTestUsers();
