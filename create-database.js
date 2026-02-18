require('dotenv').config();
const sql = require('mssql');

// Connect to master database first to create CSI database
const config = {
  server: process.env.DB_SERVER,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'master', // Connect to master database
  port: parseInt(process.env.DB_PORT, 10) || 1433,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
    connectionTimeout: 15000,
    requestTimeout: 15000
  }
};

console.log('Connecting to SQL Server...');
console.log('Server:', config.server);
console.log('User:', config.user);

async function createDatabase() {
  let pool;
  
  try {
    // Connect to master database
    pool = await sql.connect(config);
    console.log('✓ Connected to SQL Server');
    
    // Check if database exists
    const checkDb = await pool.request().query(`
      SELECT name FROM sys.databases WHERE name = 'CSI'
    `);
    
    if (checkDb.recordset.length > 0) {
      console.log('✓ Database CSI already exists');
    } else {
      console.log('Creating database CSI...');
      
      // Create database
      await pool.request().query(`
        CREATE DATABASE CSI
      `);
      
      console.log('✓ Database CSI created successfully');
    }
    
    await pool.close();
    console.log('\n✓ Database setup complete!');
    console.log('You can now run: npm run migrate');
    process.exit(0);
    
  } catch (error) {
    console.error('\n✗ Database creation failed:');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    
    if (pool) {
      await pool.close();
    }
    
    process.exit(1);
  }
}

createDatabase();
