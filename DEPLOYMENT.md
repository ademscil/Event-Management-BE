# CSI Portal - Deployment Guide

## Prerequisites

- Node.js 18+ installed
- SQL Server 2019+ accessible
- LDAP server configured (optional for development)
- SMTP server configured (for email notifications)

## Environment Setup

### 1. Environment Configuration

Copy the appropriate environment file:

```bash
# Development
cp .env.development .env

# Staging
cp .env.staging .env

# Production
cp .env.production .env
```

### 2. Configure Environment Variables

Edit `.env` file and update the following critical settings:

**Database Configuration:**
```env
DB_SERVER=your-sql-server
DB_USER=your-db-user
DB_PASSWORD=your-secure-password
DB_NAME=CSI
```

**JWT Configuration:**
```env
JWT_SECRET=your-very-secure-secret-key-at-least-32-characters
```

**LDAP Configuration:**
```env
LDAP_URL=ldap://your-ldap-server:389
LDAP_BASE_DN=dc=yourcompany,dc=com
LDAP_BIND_DN=cn=service-account,dc=yourcompany,dc=com
LDAP_BIND_PASSWORD=your-ldap-password
```

**Email Configuration:**
```env
SMTP_HOST=smtp.yourcompany.com
SMTP_PORT=587
SMTP_USER=noreply@yourcompany.com
SMTP_PASSWORD=your-smtp-password
```

**Security Configuration (Production):**
```env
HTTPS_ENABLED=true
HTTPS_KEY_PATH=/path/to/ssl/private.key
HTTPS_CERT_PATH=/path/to/ssl/certificate.crt
CORS_ORIGIN=https://csi.yourcompany.com
```

## Database Setup

### 1. Initialize Database

```bash
# Create database
npm run db:init

# Run migrations
npm run migrate

# Seed initial data (optional, for development)
npm run db:seed
```

### 2. Complete Setup (All-in-One)

```bash
npm run db:setup
```

This will:
1. Create the database
2. Run all migrations
3. Seed initial data

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Verify Configuration

The application will validate configuration on startup. Fix any errors reported.

## Running the Application

### Development Mode

```bash
npm run dev
```

This starts the server with nodemon for auto-restart on file changes.

### Production Mode

```bash
npm start
```

### Using PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name csi-portal

# View logs
pm2 logs csi-portal

# Monitor
pm2 monit

# Restart
pm2 restart csi-portal

# Stop
pm2 stop csi-portal

# Auto-start on system boot
pm2 startup
pm2 save
```

## Database Management

### Migrations

```bash
# Run pending migrations
npm run migrate

# Rollback last migration
npm run db:rollback

# Force rollback (skip confirmation)
npm run db:rollback -- --force
```

### Backup and Restore

```bash
# Create full backup
npm run db:backup

# Create differential backup
npm run db:backup:diff

# Backups are stored in /backups directory
```

### Seed Data

```bash
# Seed initial data
npm run db:seed
```

Default users created:
- `superadmin` / `Admin123!`
- `admin.event` / `Admin123!`
- `it.lead` / `Admin123!`
- `dept.head` / `Admin123!`

**⚠️ Change these passwords immediately in production!**

## Security Checklist

### Before Production Deployment

- [ ] Change all default passwords
- [ ] Generate strong JWT secret (32+ characters)
- [ ] Enable HTTPS/TLS
- [ ] Configure proper CORS origins
- [ ] Review and configure rate limits
- [ ] Set up firewall rules
- [ ] Configure database user with minimal permissions
- [ ] Enable audit logging
- [ ] Set up log rotation
- [ ] Configure backup schedule
- [ ] Review security headers configuration
- [ ] Test authentication and authorization
- [ ] Perform security scan

### TLS/HTTPS Configuration

1. Obtain SSL certificate (Let's Encrypt, commercial CA, etc.)
2. Place certificate files in secure location
3. Update `.env`:
   ```env
   HTTPS_ENABLED=true
   HTTPS_KEY_PATH=/etc/ssl/private/csi.key
   HTTPS_CERT_PATH=/etc/ssl/certs/csi.crt
   ```
4. Restart application

## Monitoring

### Health Checks

```bash
# Simple health check
curl http://localhost:3000/health

# Detailed health check
curl http://localhost:3000/api/v1/monitoring/health

# System metrics (requires SuperAdmin authentication)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/monitoring/metrics
```

### Logs

Logs are stored in `/logs` directory:
- `app.log` - All application logs
- `error.log` - Error logs only
- `warn.log` - Warning logs
- `exceptions.log` - Uncaught exceptions
- `rejections.log` - Unhandled promise rejections

### Log Rotation

Configure log rotation using `logrotate` (Linux):

```bash
# Create /etc/logrotate.d/csi-portal
/path/to/csi-portal/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Performance Tuning

### Database Connection Pool

Adjust in `.env`:
```env
DB_POOL_MAX=10
DB_POOL_MIN=0
DB_POOL_IDLE_TIMEOUT=30000
```

### Rate Limiting

Adjust in `.env`:
```env
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100   # Max requests per window
```

### Session Configuration

Adjust in `.env`:
```env
SESSION_TIMEOUT_MINUTES=30
SESSION_MAX_DURATION_HOURS=8
```

## Troubleshooting

### Database Connection Issues

1. Verify SQL Server is accessible:
   ```bash
   telnet DB_SERVER 1433
   ```

2. Check database credentials
3. Verify firewall rules
4. Check SQL Server authentication mode (mixed mode required)

### LDAP Authentication Issues

1. Test LDAP connection:
   ```bash
   ldapsearch -x -H ldap://your-server -D "bind-dn" -W -b "base-dn"
   ```

2. Verify LDAP configuration in `.env`
3. Check network connectivity
4. Verify bind credentials

### Email Sending Issues

1. Test SMTP connection:
   ```bash
   telnet SMTP_HOST SMTP_PORT
   ```

2. Verify SMTP credentials
3. Check firewall rules
4. Review email logs in database

### Application Won't Start

1. Check logs in `/logs/error.log`
2. Verify all required environment variables are set
3. Check port availability:
   ```bash
   netstat -an | grep 3000
   ```
4. Verify Node.js version: `node --version`

## Backup Strategy

### Automated Backups

Set up cron job for automated backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/csi-portal && npm run db:backup >> /var/log/csi-backup.log 2>&1

# Add weekly full backup on Sunday
0 3 * * 0 cd /path/to/csi-portal && npm run db:backup >> /var/log/csi-backup.log 2>&1
```

### Backup Retention

Backups are automatically cleaned based on retention policy (default: 30 days).

Adjust retention:
```bash
npm run db:backup -- --retention=60  # Keep 60 days
```

## Scaling Considerations

### Horizontal Scaling

1. Use load balancer (nginx, HAProxy)
2. Configure session storage in Redis
3. Use shared file storage for uploads
4. Configure database connection pooling

### Vertical Scaling

1. Increase Node.js memory limit:
   ```bash
   node --max-old-space-size=4096 server.js
   ```

2. Optimize database queries
3. Enable database query caching
4. Use CDN for static assets

## Support

For issues and questions:
- Check logs in `/logs` directory
- Review configuration in `.env`
- Consult API documentation
- Contact system administrator

## Version Information

- Application Version: 1.0.0
- Node.js: 18+
- SQL Server: 2019+
- Documentation Last Updated: 2024
