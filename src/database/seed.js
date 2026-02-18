const sql = require('mssql');
const bcrypt = require('bcrypt');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Database seed script
 * Populates database with initial data for development/testing
 */
class DatabaseSeeder {
  constructor() {
    this.pool = null;
  }

  /**
   * Connect to database
   */
  async connect() {
    try {
      logger.info('Connecting to database...');
      this.pool = await new sql.ConnectionPool(config.database).connect();
      logger.info('Database connected');
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.close();
      logger.info('Database connection closed');
    }
  }

  /**
   * Check if data already exists
   * @param {string} tableName
   * @returns {Promise<boolean>}
   */
  async hasData(tableName) {
    try {
      const result = await this.pool.request()
        .query(`SELECT COUNT(*) as count FROM ${tableName}`);
      
      return result.recordset[0].count > 0;
    } catch (error) {
      logger.error(`Failed to check data in ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Seed users
   */
  async seedUsers() {
    try {
      if (await this.hasData('Users')) {
        logger.info('Users table already has data, skipping...');
        return;
      }

      logger.info('Seeding users...');

      const users = [
        {
          Username: 'superadmin',
          DisplayName: 'Super Administrator',
          Email: 'superadmin@astraotoparts.com',
          Role: 'SuperAdmin',
          UseLDAP: false,
          PasswordHash: await bcrypt.hash('Admin123!', 10),
          IsActive: true
        },
        {
          Username: 'admin.event',
          DisplayName: 'Admin Event',
          Email: 'admin.event@astraotoparts.com',
          Role: 'AdminEvent',
          UseLDAP: false,
          PasswordHash: await bcrypt.hash('Admin123!', 10),
          IsActive: true
        },
        {
          Username: 'it.lead',
          DisplayName: 'IT Lead',
          Email: 'it.lead@astraotoparts.com',
          Role: 'ITLead',
          UseLDAP: false,
          PasswordHash: await bcrypt.hash('Admin123!', 10),
          IsActive: true
        },
        {
          Username: 'dept.head',
          DisplayName: 'Department Head',
          Email: 'dept.head@astraotoparts.com',
          Role: 'DepartmentHead',
          UseLDAP: false,
          PasswordHash: await bcrypt.hash('Admin123!', 10),
          IsActive: true
        }
      ];

      for (const user of users) {
        await this.pool.request()
          .input('Username', sql.NVarChar, user.Username)
          .input('DisplayName', sql.NVarChar, user.DisplayName)
          .input('Email', sql.NVarChar, user.Email)
          .input('Role', sql.NVarChar, user.Role)
          .input('UseLDAP', sql.Bit, user.UseLDAP)
          .input('PasswordHash', sql.NVarChar, user.PasswordHash)
          .input('IsActive', sql.Bit, user.IsActive)
          .query(`
            INSERT INTO Users (Username, DisplayName, Email, Role, UseLDAP, PasswordHash, IsActive)
            VALUES (@Username, @DisplayName, @Email, @Role, @UseLDAP, @PasswordHash, @IsActive)
          `);
      }

      logger.info(`Seeded ${users.length} users`);
    } catch (error) {
      logger.error('Failed to seed users:', error);
      throw error;
    }
  }

  /**
   * Seed business units
   */
  async seedBusinessUnits() {
    try {
      if (await this.hasData('BusinessUnits')) {
        logger.info('BusinessUnits table already has data, skipping...');
        return;
      }

      logger.info('Seeding business units...');

      const businessUnits = [
        { Code: 'BU001', Name: 'Manufacturing' },
        { Code: 'BU002', Name: 'Sales & Marketing' },
        { Code: 'BU003', Name: 'Finance & Accounting' },
        { Code: 'BU004', Name: 'Human Resources' },
        { Code: 'BU005', Name: 'Information Technology' }
      ];

      for (const bu of businessUnits) {
        await this.pool.request()
          .input('Code', sql.NVarChar, bu.Code)
          .input('Name', sql.NVarChar, bu.Name)
          .query(`
            INSERT INTO BusinessUnits (Code, Name, IsActive)
            VALUES (@Code, @Name, 1)
          `);
      }

      logger.info(`Seeded ${businessUnits.length} business units`);
    } catch (error) {
      logger.error('Failed to seed business units:', error);
      throw error;
    }
  }

  /**
   * Seed divisions
   */
  async seedDivisions() {
    try {
      if (await this.hasData('Divisions')) {
        logger.info('Divisions table already has data, skipping...');
        return;
      }

      logger.info('Seeding divisions...');

      // Get BU IDs
      const buResult = await this.pool.request()
        .query('SELECT BusinessUnitId, Code FROM BusinessUnits');
      
      const buMap = {};
      buResult.recordset.forEach(bu => {
        buMap[bu.Code] = bu.BusinessUnitId;
      });

      const divisions = [
        { Code: 'DIV001', Name: 'Production', BusinessUnitCode: 'BU001' },
        { Code: 'DIV002', Name: 'Quality Control', BusinessUnitCode: 'BU001' },
        { Code: 'DIV003', Name: 'Sales Operations', BusinessUnitCode: 'BU002' },
        { Code: 'DIV004', Name: 'Marketing', BusinessUnitCode: 'BU002' },
        { Code: 'DIV005', Name: 'Financial Planning', BusinessUnitCode: 'BU003' },
        { Code: 'DIV006', Name: 'Accounting', BusinessUnitCode: 'BU003' },
        { Code: 'DIV007', Name: 'Recruitment', BusinessUnitCode: 'BU004' },
        { Code: 'DIV008', Name: 'Training & Development', BusinessUnitCode: 'BU004' },
        { Code: 'DIV009', Name: 'Infrastructure', BusinessUnitCode: 'BU005' },
        { Code: 'DIV010', Name: 'Application Development', BusinessUnitCode: 'BU005' }
      ];

      for (const div of divisions) {
        const buId = buMap[div.BusinessUnitCode];
        if (buId) {
          await this.pool.request()
            .input('Code', sql.NVarChar, div.Code)
            .input('Name', sql.NVarChar, div.Name)
            .input('BusinessUnitId', sql.Int, buId)
            .query(`
              INSERT INTO Divisions (Code, Name, BusinessUnitId, IsActive)
              VALUES (@Code, @Name, @BusinessUnitId, 1)
            `);
        }
      }

      logger.info(`Seeded ${divisions.length} divisions`);
    } catch (error) {
      logger.error('Failed to seed divisions:', error);
      throw error;
    }
  }

  /**
   * Seed departments
   */
  async seedDepartments() {
    try {
      if (await this.hasData('Departments')) {
        logger.info('Departments table already has data, skipping...');
        return;
      }

      logger.info('Seeding departments...');

      // Get Division IDs
      const divResult = await this.pool.request()
        .query('SELECT DivisionId, Code FROM Divisions');
      
      const divMap = {};
      divResult.recordset.forEach(div => {
        divMap[div.Code] = div.DivisionId;
      });

      const departments = [
        { Code: 'DEPT001', Name: 'Assembly Line 1', DivisionCode: 'DIV001' },
        { Code: 'DEPT002', Name: 'Assembly Line 2', DivisionCode: 'DIV001' },
        { Code: 'DEPT003', Name: 'QC Testing', DivisionCode: 'DIV002' },
        { Code: 'DEPT004', Name: 'QC Inspection', DivisionCode: 'DIV002' },
        { Code: 'DEPT005', Name: 'Regional Sales', DivisionCode: 'DIV003' },
        { Code: 'DEPT006', Name: 'Digital Marketing', DivisionCode: 'DIV004' },
        { Code: 'DEPT007', Name: 'Budget Planning', DivisionCode: 'DIV005' },
        { Code: 'DEPT008', Name: 'General Ledger', DivisionCode: 'DIV006' },
        { Code: 'DEPT009', Name: 'Talent Acquisition', DivisionCode: 'DIV007' },
        { Code: 'DEPT010', Name: 'IT Support', DivisionCode: 'DIV009' },
        { Code: 'DEPT011', Name: 'Software Development', DivisionCode: 'DIV010' }
      ];

      for (const dept of departments) {
        const divId = divMap[dept.DivisionCode];
        if (divId) {
          await this.pool.request()
            .input('Code', sql.NVarChar, dept.Code)
            .input('Name', sql.NVarChar, dept.Name)
            .input('DivisionId', sql.Int, divId)
            .query(`
              INSERT INTO Departments (Code, Name, DivisionId, IsActive)
              VALUES (@Code, @Name, @DivisionId, 1)
            `);
        }
      }

      logger.info(`Seeded ${departments.length} departments`);
    } catch (error) {
      logger.error('Failed to seed departments:', error);
      throw error;
    }
  }

  /**
   * Seed functions
   */
  async seedFunctions() {
    try {
      if (await this.hasData('Functions')) {
        logger.info('Functions table already has data, skipping...');
        return;
      }

      logger.info('Seeding functions...');

      const functions = [
        { Code: 'FN001', Name: 'ERP System' },
        { Code: 'FN002', Name: 'CRM System' },
        { Code: 'FN003', Name: 'HR Management' },
        { Code: 'FN004', Name: 'Financial Reporting' },
        { Code: 'FN005', Name: 'Inventory Management' },
        { Code: 'FN006', Name: 'Quality Management' },
        { Code: 'FN007', Name: 'Document Management' },
        { Code: 'FN008', Name: 'Business Intelligence' }
      ];

      for (const func of functions) {
        await this.pool.request()
          .input('Code', sql.NVarChar, func.Code)
          .input('Name', sql.NVarChar, func.Name)
          .query(`
            INSERT INTO Functions (Code, Name, IsActive)
            VALUES (@Code, @Name, 1)
          `);
      }

      logger.info(`Seeded ${functions.length} functions`);
    } catch (error) {
      logger.error('Failed to seed functions:', error);
      throw error;
    }
  }

  /**
   * Seed applications
   */
  async seedApplications() {
    try {
      if (await this.hasData('Applications')) {
        logger.info('Applications table already has data, skipping...');
        return;
      }

      logger.info('Seeding applications...');

      const applications = [
        { Code: 'APP001', Name: 'SAP ERP', Description: 'Enterprise Resource Planning System' },
        { Code: 'APP002', Name: 'Salesforce CRM', Description: 'Customer Relationship Management' },
        { Code: 'APP003', Name: 'Workday HCM', Description: 'Human Capital Management' },
        { Code: 'APP004', Name: 'Oracle Financials', Description: 'Financial Management System' },
        { Code: 'APP005', Name: 'WMS Pro', Description: 'Warehouse Management System' },
        { Code: 'APP006', Name: 'QMS Plus', Description: 'Quality Management System' },
        { Code: 'APP007', Name: 'SharePoint', Description: 'Document Management Platform' },
        { Code: 'APP008', Name: 'Power BI', Description: 'Business Intelligence Platform' },
        { Code: 'APP009', Name: 'ServiceNow', Description: 'IT Service Management' },
        { Code: 'APP010', Name: 'Jira', Description: 'Project Management Tool' }
      ];

      for (const app of applications) {
        await this.pool.request()
          .input('Code', sql.NVarChar, app.Code)
          .input('Name', sql.NVarChar, app.Name)
          .input('Description', sql.NVarChar, app.Description)
          .query(`
            INSERT INTO Applications (Code, Name, Description, IsActive)
            VALUES (@Code, @Name, @Description, 1)
          `);
      }

      logger.info(`Seeded ${applications.length} applications`);
    } catch (error) {
      logger.error('Failed to seed applications:', error);
      throw error;
    }
  }

  /**
   * Seed configuration
   */
  async seedConfiguration() {
    try {
      if (await this.hasData('Configuration')) {
        logger.info('Configuration table already has data, skipping...');
        return;
      }

      logger.info('Seeding configuration...');

      const configs = [
        { ConfigKey: 'system.name', ConfigValue: 'CSI Portal', Description: 'System name' },
        { ConfigKey: 'system.version', ConfigValue: '1.0.0', Description: 'System version' },
        { ConfigKey: 'email.enabled', ConfigValue: 'true', Description: 'Enable email notifications' },
        { ConfigKey: 'sap.sync.enabled', ConfigValue: 'true', Description: 'Enable SAP synchronization' },
        { ConfigKey: 'survey.duplicate.prevention', ConfigValue: 'true', Description: 'Enable duplicate response prevention' },
        { ConfigKey: 'audit.retention.days', ConfigValue: '730', Description: 'Audit log retention period (days)' }
      ];

      for (const cfg of configs) {
        await this.pool.request()
          .input('ConfigKey', sql.NVarChar, cfg.ConfigKey)
          .input('ConfigValue', sql.NVarChar, cfg.ConfigValue)
          .input('Description', sql.NVarChar, cfg.Description)
          .query(`
            INSERT INTO Configuration (ConfigKey, ConfigValue, Description)
            VALUES (@ConfigKey, @ConfigValue, @Description)
          `);
      }

      logger.info(`Seeded ${configs.length} configuration entries`);
    } catch (error) {
      logger.error('Failed to seed configuration:', error);
      throw error;
    }
  }

  /**
   * Run all seed operations
   */
  async seed() {
    try {
      await this.connect();

      logger.info('Starting database seeding...');

      await this.seedUsers();
      await this.seedBusinessUnits();
      await this.seedDivisions();
      await this.seedDepartments();
      await this.seedFunctions();
      await this.seedApplications();
      await this.seedConfiguration();

      logger.info('Database seeding completed successfully');

      return {
        success: true,
        message: 'All seed data inserted successfully'
      };
    } catch (error) {
      logger.error('Database seeding failed:', error);
      throw error;
    } finally {
      await this.close();
    }
  }
}

// Run seeding if executed directly
if (require.main === module) {
  const seeder = new DatabaseSeeder();
  
  seeder.seed()
    .then(result => {
      console.log('\n✓ Database seeding completed');
      console.log('\nDefault users created:');
      console.log('  - superadmin / Admin123!');
      console.log('  - admin.event / Admin123!');
      console.log('  - it.lead / Admin123!');
      console.log('  - dept.head / Admin123!');
      console.log('\nYou can now start the application: npm start');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Database seeding failed:', error.message);
      process.exit(1);
    });
}

module.exports = DatabaseSeeder;
