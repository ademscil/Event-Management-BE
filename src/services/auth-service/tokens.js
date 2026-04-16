const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function generateToken(jwtSecret, expiration, refreshExpiration, user, type = 'access') {
  const payload = {
    sub: user.userId || user.UserId,
    username: user.username || user.Username,
    role: user.role || user.Role,
    email: user.email || user.Email,
    type
  };

  return jwt.sign(
    payload,
    jwtSecret,
    { expiresIn: type === 'refresh' ? refreshExpiration : expiration }
  );
}

async function createSession(db, hashTokenFn, sessionTimeoutMinutes, sessionMaxDurationHours, userId, token, refreshToken, ipAddress, userAgent) {
  const pool = await db.getPool();

  const now = new Date();
  const lastActivity = now;
  const expiresAt = new Date(now.getTime() + sessionTimeoutMinutes * 60 * 1000);
  const maxExpiresAt = new Date(now.getTime() + sessionMaxDurationHours * 60 * 60 * 1000);

  await pool.request()
    .input('userId', db.sql.UniqueIdentifier, userId)
    .query(`
      UPDATE Sessions
      SET IsActive = 0, InvalidatedAt = GETDATE()
      WHERE UserId = @userId AND IsActive = 1
    `);

  const result = await pool.request()
    .input('userId', db.sql.UniqueIdentifier, userId)
    .input('tokenHash', db.sql.VarChar, hashTokenFn(token))
    .input('refreshTokenHash', db.sql.VarChar, hashTokenFn(refreshToken))
    .input('ipAddress', db.sql.VarChar, ipAddress || 'unknown')
    .input('userAgent', db.sql.VarChar, userAgent || 'unknown')
    .input('lastActivity', db.sql.DateTime, lastActivity)
    .input('expiresAt', db.sql.DateTime, expiresAt)
    .input('maxExpiresAt', db.sql.DateTime, maxExpiresAt)
    .query(`
      INSERT INTO Sessions (UserId, TokenHash, RefreshTokenHash, IpAddress, UserAgent, LastActivity, ExpiresAt, MaxExpiresAt, IsActive)
      OUTPUT INSERTED.SessionId
      VALUES (@userId, @tokenHash, @refreshTokenHash, @ipAddress, @userAgent, @lastActivity, @expiresAt, @maxExpiresAt, 1)
    `);

  return result.recordset[0].SessionId;
}

function verifyJwt(jwtSecret, token) {
  return jwt.verify(token, jwtSecret);
}

module.exports = {
  createSession,
  generateToken,
  hashToken,
  verifyJwt
};
