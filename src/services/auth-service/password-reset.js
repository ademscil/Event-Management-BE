async function getLocalUserByRecovery(db, normalizePhoneNumber, method, identifier) {
  const pool = await db.getPool();
  const normalizedMethod = String(method || '').trim().toLowerCase();
  const request = pool.request();

  let whereClause = '';
  if (normalizedMethod === 'phone') {
    const normalizedPhone = normalizePhoneNumber(identifier);
    if (!normalizedPhone) {
      return null;
    }
    whereClause = 'PhoneNumber = @identifier';
    request.input('identifier', db.sql.NVarChar, normalizedPhone);
  } else {
    const normalizedEmail = String(identifier || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }
    whereClause = 'LOWER(LTRIM(RTRIM(Email))) = @identifier';
    request.input('identifier', db.sql.NVarChar, normalizedEmail);
  }

  const result = await request.query(`
    SELECT TOP 1 UserId, Username, DisplayName, Email, PhoneNumber, UseLDAP, IsActive
    FROM Users
    WHERE ${whereClause}
      AND IsActive = 1
      AND UseLDAP = 0
  `);

  return result.recordset[0] || null;
}

async function invalidateOutstandingResetTokens(db, userId) {
  const pool = await db.getPool();
  await pool.request()
    .input('userId', db.sql.UniqueIdentifier, userId)
    .query(`
      UPDATE PasswordResetTokens
      SET UsedAt = GETDATE()
      WHERE UserId = @userId
        AND UsedAt IS NULL
        AND ExpiresAt > GETDATE()
    `);
}

async function invalidateOutstandingPhoneOtpTokens(db, userId) {
  const pool = await db.getPool();
  await pool.request()
    .input('userId', db.sql.UniqueIdentifier, userId)
    .query(`
      UPDATE PasswordResetTokens
      SET UsedAt = GETDATE()
      WHERE UserId = @userId
        AND RequestedByMethod IN ('phone-otp-sms', 'phone-otp-whatsapp')
        AND UsedAt IS NULL
        AND ExpiresAt > GETDATE()
    `);
}

async function createPasswordResetToken(db, hashOneTimeToken, user, requestedByMethod, requestedTo, requestMeta = {}, expirationMinutes = 30) {
  const crypto = require('crypto');
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashOneTimeToken(rawToken);
  const pool = await db.getPool();

  await invalidateOutstandingResetTokens(db, user.UserId);

  await pool.request()
    .input('userId', db.sql.UniqueIdentifier, user.UserId)
    .input('tokenHash', db.sql.NVarChar, tokenHash)
    .input('requestedByMethod', db.sql.NVarChar, requestedByMethod)
    .input('requestedTo', db.sql.NVarChar, requestedTo || '')
    .input('expiryMinutes', db.sql.Int, expirationMinutes)
    .input('createdByIp', db.sql.NVarChar, requestMeta.ipAddress || null)
    .query(`
      INSERT INTO PasswordResetTokens (
        UserId, TokenHash, RequestedByMethod, RequestedTo, ExpiresAt, CreatedByIp
      )
      VALUES (
        @userId, @tokenHash, @requestedByMethod, @requestedTo, DATEADD(MINUTE, @expiryMinutes, GETDATE()), @createdByIp
      )
    `);

  return { rawToken, tokenHash, expiresAt: null };
}

async function createPhoneOtpToken(db, normalizePhoneChannel, hashOneTimeToken, user, channel, code, requestMeta = {}) {
  const normalizedChannel = normalizePhoneChannel(channel);
  const tokenHash = hashOneTimeToken(code);
  const pool = await db.getPool();

  await invalidateOutstandingPhoneOtpTokens(db, user.UserId);

  await pool.request()
    .input('userId', db.sql.UniqueIdentifier, user.UserId)
    .input('tokenHash', db.sql.NVarChar, tokenHash)
    .input('requestedByMethod', db.sql.NVarChar, normalizedChannel === 'sms' ? 'phone-otp-sms' : 'phone-otp-whatsapp')
    .input('requestedTo', db.sql.NVarChar, user.PhoneNumber || '')
    .input('expiryMinutes', db.sql.Int, 10)
    .input('createdByIp', db.sql.NVarChar, requestMeta.ipAddress || null)
    .query(`
      INSERT INTO PasswordResetTokens (
        UserId, TokenHash, RequestedByMethod, RequestedTo, ExpiresAt, CreatedByIp
      )
      VALUES (
        @userId, @tokenHash, @requestedByMethod, @requestedTo, DATEADD(MINUTE, @expiryMinutes, GETDATE()), @createdByIp
      )
    `);

  return { tokenHash, expiresAt: null };
}

async function verifyStoredPhoneOtp(db, normalizePhoneChannel, hashOneTimeToken, user, channel, code) {
  const pool = await db.getPool();
  const normalizedChannel = normalizePhoneChannel(channel);
  const tokenHash = hashOneTimeToken(code);
  const requestedByMethod = normalizedChannel === 'sms' ? 'phone-otp-sms' : 'phone-otp-whatsapp';
  const result = await pool.request()
    .input('userId', db.sql.UniqueIdentifier, user.UserId)
    .input('tokenHash', db.sql.NVarChar, tokenHash)
    .input('requestedByMethod', db.sql.NVarChar, requestedByMethod)
    .query(`
      SELECT TOP 1 PasswordResetTokenId
      FROM PasswordResetTokens
      WHERE UserId = @userId
        AND RequestedByMethod = @requestedByMethod
        AND TokenHash = @tokenHash
        AND UsedAt IS NULL
        AND ExpiresAt > GETDATE()
      ORDER BY CreatedAt DESC
    `);

  const tokenRow = result.recordset[0];
  if (!tokenRow) {
    return false;
  }

  await pool.request()
    .input('passwordResetTokenId', db.sql.UniqueIdentifier, tokenRow.PasswordResetTokenId)
    .query(`
      UPDATE PasswordResetTokens
      SET UsedAt = GETDATE()
      WHERE PasswordResetTokenId = @passwordResetTokenId
    `);

  return true;
}

module.exports = {
  createPasswordResetToken,
  createPhoneOtpToken,
  getLocalUserByRecovery,
  invalidateOutstandingPhoneOtpTokens,
  invalidateOutstandingResetTokens,
  verifyStoredPhoneOtp
};
