const bcrypt = require('bcrypt');

async function generateTestUsers() {
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

    console.log('-- ========================================');
    console.log('-- CSI Portal - Test Users');
    console.log('-- Password untuk semua user: admin123');
    console.log('-- UseLDAP: 0 (local authentication)');
    console.log('-- ========================================\n');
    console.log('USE CSI_Portal;\nGO\n');

    for (const user of users) {
        const hash = await bcrypt.hash(user.password, 10);
        
        console.log(`-- ${user.role}: ${user.username} / ${user.password}`);
        console.log(`INSERT INTO Users (`);
        console.log(`    UserId,`);
        console.log(`    Username,`);
        console.log(`    PasswordHash,`);
        console.log(`    DisplayName,`);
        console.log(`    Email,`);
        console.log(`    Role,`);
        console.log(`    IsActive,`);
        console.log(`    UseLDAP,`);
        console.log(`    CreatedAt,`);
        console.log(`    CreatedBy`);
        console.log(`)`);
        console.log(`VALUES (`);
        console.log(`    NEWID(),`);
        console.log(`    '${user.username}',`);
        console.log(`    '${hash}',`);
        console.log(`    '${user.displayName}',`);
        console.log(`    '${user.email}',`);
        console.log(`    '${user.role}',`);
        console.log(`    1,`);
        console.log(`    0,`);
        console.log(`    GETDATE(),`);
        console.log(`    'system'`);
        console.log(`);\nGO\n`);
    }

    console.log('-- ========================================');
    console.log('-- Verify users created');
    console.log('-- ========================================');
    console.log('SELECT Username, DisplayName, Email, Role, IsActive, UseLDAP FROM Users WHERE CreatedBy = \'system\';');
    console.log('GO\n');

    console.log('\n✅ SQL script generated successfully!');
    console.log('\n📋 Test Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    users.forEach(user => {
        console.log(`${user.role.padEnd(20)} | ${user.username.padEnd(15)} | admin123`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

generateTestUsers().catch(console.error);
