# Email Service Documentation

## Overview

The Email Service provides comprehensive email functionality for the CSI Portal, including:
- Email template rendering with EJS
- Survey invitation blasts
- Survey reminders
- Approval/rejection notifications
- Batch sending with rate limiting
- Email logging and duplicate prevention
- Scheduled operations processing

## Architecture

### Components

1. **emailService.js** - Main email service with template rendering and sending
2. **scheduledOperationsProcessor.js** - Background job processor for scheduled emails
3. **Email Templates** - EJS templates in `src/templates/email/`

### Email Templates

- `survey-invitation.ejs` - Survey invitation email
- `survey-reminder.ejs` - Survey reminder email
- `approval-notification.ejs` - Takeout approval notification
- `rejection-notification.ejs` - Takeout rejection notification

## Configuration

Email service requires the following environment variables in `.env`:

```env
# Email Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=CSI Portal <noreply@example.com>

# Base URL for survey links
BASE_URL=http://localhost:3000
```

## Usage

### Basic Email Sending

```javascript
const emailService = require('./services/emailService');

// Send a single email
const result = await emailService.sendEmail({
    to: 'user@example.com',
    subject: 'Test Email',
    template: 'survey-invitation',
    data: {
        recipientName: 'John Doe',
        surveyTitle: 'IT Satisfaction Survey',
        // ... other template data
    },
    surveyId: 'survey-uuid',
    emailType: 'Blast'
});

if (result.success) {
    console.log('Email sent:', result.messageId);
} else {
    console.error('Email failed:', result.error);
}
```

### Survey Blast

```javascript
// Send survey invitation to target recipients
const results = await emailService.sendSurveyBlast({
    surveyId: 'survey-uuid',
    targetCriteria: {
        businessUnitIds: ['bu-uuid-1', 'bu-uuid-2'],
        divisionIds: [],
        departmentIds: ['dept-uuid-1'],
        functionIds: []
    },
    emailTemplate: 'survey-invitation', // optional, defaults to 'survey-invitation'
    embedCover: true, // optional, includes hero image in email
    duplicatePreventionHours: 24 // optional, defaults to 24 hours
});

console.log(`Sent: ${results.sent}, Failed: ${results.failed}, Skipped: ${results.skipped}`);
```

### Survey Reminders

```javascript
// Send reminders to non-respondents
const results = await emailService.sendReminders({
    surveyId: 'survey-uuid',
    emailTemplate: 'survey-reminder', // optional
    embedCover: true, // optional
    duplicatePreventionHours: 24 // optional
});

console.log(`Sent: ${results.sent}, Failed: ${results.failed}`);
```

### Approval/Rejection Notifications

```javascript
// Send approval notification
await emailService.sendApprovalNotification({
    recipientEmail: 'admin@example.com',
    recipientName: 'Admin User',
    surveyTitle: 'IT Satisfaction Survey',
    respondentEmail: 'respondent@example.com',
    questionText: 'How satisfied are you?',
    approvalReason: 'Valid reason for takeout',
    approverName: 'IT Lead Name',
    approvalDate: '2024-01-15'
});

// Send rejection notification
await emailService.sendRejectionNotification({
    recipientEmail: 'admin@example.com',
    recipientName: 'Admin User',
    surveyTitle: 'IT Satisfaction Survey',
    respondentEmail: 'respondent@example.com',
    questionText: 'How satisfied are you?',
    rejectionReason: 'Not a valid reason for takeout',
    rejectorName: 'IT Lead Name',
    rejectionDate: '2024-01-15'
});
```

### Batch Sending

```javascript
// Send multiple emails with rate limiting
const emails = [
    {
        to: 'user1@example.com',
        subject: 'Survey Invitation',
        template: 'survey-invitation',
        data: { /* template data */ },
        surveyId: 'survey-uuid',
        emailType: 'Blast'
    },
    // ... more emails
];

const results = await emailService.sendBatch(
    emails,
    50,    // batch size (default: 50)
    1000   // delay between batches in ms (default: 1000)
);

console.log(`Total: ${results.total}, Sent: ${results.sent}, Failed: ${results.failed}`);
```

## Scheduled Operations

### Starting the Processor

The scheduled operations processor should be started when the application starts:

```javascript
// In server.js or app.js
const scheduledOperationsProcessor = require('./services/scheduledOperationsProcessor');

// Start the processor
scheduledOperationsProcessor.start();

// Stop on application shutdown
process.on('SIGTERM', () => {
    scheduledOperationsProcessor.stop();
});
```

### How It Works

1. The processor runs every minute (cron: `* * * * *`)
2. Queries `ScheduledOperations` table for pending operations where `NextExecutionAt <= GETDATE()`
3. Executes each operation (blast or reminder)
4. Updates operation status and calculates next execution time for recurring operations
5. Logs results to `EmailLogs` table

### Scheduling Operations

Operations are scheduled through the `surveyService.js`:

```javascript
// Schedule a blast (one-time)
await surveyService.scheduleBlast({
    surveyId: 'survey-uuid',
    scheduledDate: new Date('2024-01-20T09:00:00'),
    frequency: 'once',
    emailTemplate: 'survey-invitation',
    embedCover: true,
    targetCriteria: {
        businessUnitIds: ['bu-uuid'],
        divisionIds: [],
        departmentIds: [],
        functionIds: []
    }
});

// Schedule a recurring reminder (weekly)
await surveyService.scheduleReminder({
    surveyId: 'survey-uuid',
    scheduledDate: new Date('2024-01-20T09:00:00'),
    frequency: 'weekly',
    dayOfWeek: 1, // Monday (0=Sunday, 6=Saturday)
    scheduledTime: '09:00',
    emailTemplate: 'survey-reminder',
    embedCover: true
});
```

### Frequency Options

- `once` - Execute once at scheduled date/time
- `daily` - Execute daily at scheduled time
- `weekly` - Execute weekly on specified day at scheduled time
- `monthly` - Execute monthly on same date at scheduled time

## Features

### Duplicate Prevention

Prevents sending duplicate emails to the same recipient within a configurable time window:

```javascript
const wasSent = await emailService.wasEmailSentRecently(
    'user@example.com',
    'survey-uuid',
    24 // hours
);

if (wasSent) {
    console.log('Email already sent recently, skipping');
}
```

### Email Validation

```javascript
const isValid = emailService.validateEmail('user@example.com');
```

### Email Logging

All emails are automatically logged to the `EmailLogs` table with:
- Survey ID
- Recipient email and name
- Subject
- Email type (Blast, Reminder, Notification)
- Status (Sent, Failed, Pending)
- Error message (if failed)
- Sent timestamp

### Template Rendering

```javascript
// Render a template with data
const html = await emailService.renderTemplate('survey-invitation', {
    recipientName: 'John Doe',
    surveyTitle: 'IT Satisfaction Survey',
    // ... other data
});

// Get raw template content
const templateContent = await emailService.getTemplate('survey-invitation');
```

## Error Handling

The email service includes comprehensive error handling:

1. **SMTP Errors** - Logged and returned in result object
2. **Template Errors** - Throws error with descriptive message
3. **Database Errors** - Logged but doesn't prevent email sending
4. **Validation Errors** - Invalid emails are skipped with warning

Example error handling:

```javascript
try {
    const result = await emailService.sendEmail(options);
    
    if (!result.success) {
        console.error('Email failed:', result.error);
        // Handle failure
    }
} catch (error) {
    console.error('Unexpected error:', error);
    // Handle exception
}
```

## Testing

Run email service tests:

```bash
npm test -- src/services/__tests__/emailService.test.js
```

## Monitoring

### Check Processor Status

```javascript
const status = scheduledOperationsProcessor.getStatus();
console.log('Is running:', status.isRunning);
console.log('Is scheduled:', status.isScheduled);
```

### Manual Trigger (for testing)

```javascript
await scheduledOperationsProcessor.triggerProcessing();
```

### Query Email Logs

```sql
-- Recent emails
SELECT TOP 100 *
FROM EmailLogs
ORDER BY SentAt DESC;

-- Failed emails
SELECT *
FROM EmailLogs
WHERE Status = 'Failed'
ORDER BY SentAt DESC;

-- Emails by survey
SELECT 
    EmailType,
    Status,
    COUNT(*) as Count
FROM EmailLogs
WHERE SurveyId = 'survey-uuid'
GROUP BY EmailType, Status;
```

## Best Practices

1. **Rate Limiting** - Use batch sending with appropriate delays to avoid SMTP throttling
2. **Duplicate Prevention** - Always check for recent sends before blasting
3. **Email Validation** - Validate email addresses before sending
4. **Error Handling** - Always check result.success and handle failures
5. **Template Testing** - Test templates with various data scenarios
6. **Monitoring** - Regularly check EmailLogs for failed sends
7. **Scheduled Operations** - Monitor ScheduledOperations table for failed operations

## Troubleshooting

### Emails Not Sending

1. Check SMTP configuration in `.env`
2. Verify SMTP credentials are correct
3. Check firewall/network allows SMTP port
4. Review EmailLogs table for error messages
5. Check application logs for SMTP errors

### Templates Not Rendering

1. Verify template file exists in `src/templates/email/`
2. Check template syntax (valid EJS)
3. Ensure all required data fields are provided
4. Review error logs for specific template errors

### Scheduled Operations Not Running

1. Verify processor is started: `scheduledOperationsProcessor.start()`
2. Check ScheduledOperations table for pending operations
3. Verify NextExecutionAt is in the past
4. Check application logs for processor errors
5. Manually trigger: `scheduledOperationsProcessor.triggerProcessing()`

### Duplicate Prevention Issues

1. Check EmailLogs table for recent sends
2. Verify duplicate prevention window (default 24 hours)
3. Ensure email addresses match exactly (case-insensitive)
4. Review logs for skipped emails

## API Integration

The email service is used by:

- **Survey Service** - Scheduling blasts and reminders
- **Approval Service** - Sending approval/rejection notifications
- **Scheduled Operations Processor** - Executing scheduled emails

See respective service documentation for integration details.
