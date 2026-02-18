# SAP Integration Documentation

## Overview

The SAP Integration Service provides automated synchronization of organizational data (Business Units, Divisions, and Departments) from SAP to the CSI Portal database.

## Components

### 1. SAP Client (`sapClient.js`)

HTTP client for communicating with SAP REST/SOAP API.

**Features:**
- Axios-based HTTP client with configurable timeout (30 seconds)
- Automatic retry logic with exponential backoff (3 retries)
- Bearer token authentication
- Request/response interceptors for logging
- Error handling and categorization

**Configuration:**
```javascript
// .env file
SAP_API_URL=https://sap-api.company.com
SAP_API_KEY=your-api-key-here
SAP_SYNC_SCHEDULE=0 2 * * *  // Daily at 2 AM
```

**API Methods:**
- `fetchBusinessUnits()` - Fetch all Business Units
- `fetchDivisions(businessUnitCode)` - Fetch Divisions (optionally filtered by BU)
- `fetchDepartments(divisionCode)` - Fetch Departments (optionally filtered by Division)
- `fetchOrganizationalData()` - Fetch all organizational data
- `testConnection()` - Test SAP API connectivity

**Response Format:**
```javascript
{
  success: boolean,
  data: Object | null,
  error: string | null
}
```

### 2. SAP Sync Service (`sapSyncService.js`)

Orchestrates the synchronization process between SAP and the database.

**Features:**
- Syncs Business Units, Divisions, and Departments
- Creates new records for entities that don't exist
- Updates existing records when data changes
- Deactivates records that no longer exist in SAP
- Comprehensive error handling and logging
- Sync result tracking in database

**Sync Process:**

1. **Test Connection** - Verify SAP API is accessible
2. **Sync Business Units**
   - Fetch from SAP
   - Compare with existing records
   - Add new, update changed, deactivate removed
3. **Sync Divisions**
   - Fetch from SAP
   - Validate Business Unit references
   - Add new, update changed, deactivate removed
4. **Sync Departments**
   - Fetch from SAP
   - Validate Division references
   - Add new, update changed, deactivate removed
5. **Log Results** - Store sync statistics in SAPSyncLogs table

**Usage:**
```javascript
const sapSyncService = require('./services/sapSyncService');

// Run sync manually
const result = await sapSyncService.syncOrganizationalData();

// Get sync history
const history = await sapSyncService.getSyncHistory({ limit: 10 });
```

**Sync Result:**
```javascript
{
  success: boolean,
  statistics: {
    businessUnits: { added: 0, updated: 0, deactivated: 0, errors: 0 },
    divisions: { added: 0, updated: 0, deactivated: 0, errors: 0 },
    departments: { added: 0, updated: 0, deactivated: 0, errors: 0 },
    totalProcessed: 0,
    totalErrors: 0
  },
  errors: string[],
  timestamp: Date
}
```

## Database Schema

### SAPSyncLogs Table

Tracks all sync operations for audit and monitoring.

```sql
CREATE TABLE SAPSyncLogs (
    SyncLogId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SyncType NVARCHAR(50) NOT NULL,
    Status NVARCHAR(50) NOT NULL,
    StartTime DATETIME NOT NULL,
    EndTime DATETIME NOT NULL,
    RecordsProcessed INT NOT NULL DEFAULT 0,
    RecordsAdded INT NOT NULL DEFAULT 0,
    RecordsUpdated INT NOT NULL DEFAULT 0,
    RecordsDeactivated INT NOT NULL DEFAULT 0,
    ErrorCount INT NOT NULL DEFAULT 0,
    ErrorLog NVARCHAR(MAX) NULL,
    Details NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
);
```

## SAP API Expected Format

The SAP API should return data in the following format:

### Business Units
```json
{
  "businessUnits": [
    {
      "code": "BU001",
      "name": "Business Unit 1"
    }
  ]
}
```

### Divisions
```json
{
  "divisions": [
    {
      "code": "DIV001",
      "name": "Division 1",
      "businessUnitCode": "BU001"
    }
  ]
}
```

### Departments
```json
{
  "departments": [
    {
      "code": "DEPT001",
      "name": "Department 1",
      "divisionCode": "DIV001"
    }
  ]
}
```

## Scheduling

The sync can be scheduled using node-cron or similar scheduling library:

```javascript
const cron = require('node-cron');
const sapSyncService = require('./services/sapSyncService');
const config = require('./config');

// Schedule sync based on config
cron.schedule(config.sap.syncSchedule, async () => {
  console.log('Starting scheduled SAP sync...');
  const result = await sapSyncService.syncOrganizationalData();
  
  if (result.success) {
    console.log('SAP sync completed successfully');
  } else {
    console.error('SAP sync completed with errors:', result.errors);
  }
});
```

## Error Handling

### Retry Logic
- Server errors (5xx): Automatically retried up to 3 times with exponential backoff
- Client errors (4xx): Not retried, logged immediately
- Network errors: Retried up to 3 times

### Error Logging
- All errors logged to winston logger
- Sync errors stored in SAPSyncLogs table
- Individual entity errors collected and reported

## Monitoring

### Sync History
Query the SAPSyncLogs table to monitor sync operations:

```sql
-- Recent sync operations
SELECT TOP 10 *
FROM SAPSyncLogs
ORDER BY CreatedAt DESC;

-- Failed syncs
SELECT *
FROM SAPSyncLogs
WHERE Status = 'Failed'
ORDER BY CreatedAt DESC;

-- Sync statistics
SELECT 
    SyncType,
    COUNT(*) as TotalSyncs,
    SUM(RecordsAdded) as TotalAdded,
    SUM(RecordsUpdated) as TotalUpdated,
    SUM(RecordsDeactivated) as TotalDeactivated,
    SUM(ErrorCount) as TotalErrors
FROM SAPSyncLogs
GROUP BY SyncType;
```

## Testing

### Manual Testing
1. Configure SAP API credentials in .env
2. Run sync manually:
   ```bash
   node -e "require('./src/services/sapSyncService').syncOrganizationalData().then(r => console.log(r))"
   ```
3. Check SAPSyncLogs table for results
4. Verify data in BusinessUnits, Divisions, Departments tables

### Connection Testing
```javascript
const sapClient = require('./services/sapClient');

// Test connection
sapClient.testConnection().then(result => {
  if (result.success) {
    console.log('SAP connection successful');
  } else {
    console.error('SAP connection failed:', result.error);
  }
});
```

## Troubleshooting

### Common Issues

1. **Connection Timeout**
   - Check SAP_API_URL is correct
   - Verify network connectivity
   - Check firewall rules

2. **Authentication Failed**
   - Verify SAP_API_KEY is valid
   - Check API key permissions

3. **Missing Parent Records**
   - Ensure Business Units are synced before Divisions
   - Ensure Divisions are synced before Departments
   - Check SAP data for referential integrity

4. **Duplicate Code Errors**
   - Check for duplicate codes in SAP data
   - Verify code uniqueness constraints

## Requirements Mapping

This implementation satisfies the following requirements:

- **Requirement 3.6**: SAP integration for organizational data sync
- **Requirement 26.1**: Fetch current BU, Division, and Department data from SAP
- **Requirement 26.2**: Update existing records when changes are detected
- **Requirement 26.3**: Create new records for entities that don't exist
- **Requirement 26.4**: Mark records as inactive when they no longer exist in SAP
- **Requirement 26.5**: Log sync results including records added, updated, and deactivated
- **Requirement 26.6**: Handle SAP integration failures with error logging
- **Requirement 26.7**: Configurable sync schedule (default: daily at 2 AM)
