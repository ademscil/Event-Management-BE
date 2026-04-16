async function validateTokenSession(context, token) {
  const { db, hashToken, jwtSecret, sessionTimeoutMinutes, verifyJwt, getUserById } = context;

  try {
    const decoded = verifyJwt(jwtSecret, token);

    if (decoded.type !== 'access') {
      return {
        isValid: false,
        user: null,
        errorMessage: 'Invalid token type'
      };
    }

    const pool = await db.getPool();
    const tokenHash = hashToken(token);
    const result = await pool.request()
      .input('tokenHash', db.sql.VarChar, tokenHash)
      .query(`
        SELECT SessionId, UserId, LastActivity, ExpiresAt, MaxExpiresAt, IsActive
        FROM Sessions
        WHERE TokenHash = @tokenHash
      `);

    if (result.recordset.length === 0) {
      return {
        isValid: false,
        user: null,
        errorMessage: 'Session not found'
      };
    }

    const session = result.recordset[0];
    if (!session.IsActive) {
      return {
        isValid: false,
        user: null,
        errorMessage: 'Session has been invalidated'
      };
    }

    const now = new Date();
    if (now > new Date(session.ExpiresAt) || now > new Date(session.MaxExpiresAt)) {
      await pool.request()
        .input('sessionId', db.sql.UniqueIdentifier, session.SessionId)
        .query(`
          UPDATE Sessions
          SET IsActive = 0, InvalidatedAt = GETDATE()
          WHERE SessionId = @sessionId
        `);

      return {
        isValid: false,
        user: null,
        errorMessage: 'Session has expired'
      };
    }

    const user = await getUserById(decoded.sub);
    if (!user) {
      return {
        isValid: false,
        user: null,
        errorMessage: 'User not found'
      };
    }

    const newExpiresAt = new Date(now.getTime() + sessionTimeoutMinutes * 60 * 1000);
    const finalExpiresAt = newExpiresAt > new Date(session.MaxExpiresAt)
      ? new Date(session.MaxExpiresAt)
      : newExpiresAt;

    await pool.request()
      .input('sessionId', db.sql.UniqueIdentifier, session.SessionId)
      .input('lastActivity', db.sql.DateTime, now)
      .input('expiresAt', db.sql.DateTime, finalExpiresAt)
      .query(`
        UPDATE Sessions
        SET LastActivity = @lastActivity, ExpiresAt = @expiresAt
        WHERE SessionId = @sessionId
      `);

    return {
      isValid: true,
      user: {
        userId: user.UserId,
        username: user.Username,
        displayName: user.DisplayName,
        email: user.Email,
        role: user.Role
      },
      errorMessage: null
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return {
        isValid: false,
        user: null,
        errorMessage: 'Token has expired'
      };
    }

    if (error.name === 'JsonWebTokenError') {
      return {
        isValid: false,
        user: null,
        errorMessage: 'Invalid token'
      };
    }

    throw error;
  }
}

async function logoutSession(db, hashToken, token) {
  const tokenHash = hashToken(token);
  const pool = await db.getPool();

  await pool.request()
    .input('tokenHash', db.sql.VarChar, tokenHash)
    .query(`
      UPDATE Sessions
      SET IsActive = 0, InvalidatedAt = GETDATE()
      WHERE TokenHash = @tokenHash
    `);
}

async function refreshAuthToken(context, refreshToken, ipAddress, userAgent) {
  const {
    createSession,
    db,
    generateToken,
    getUserById,
    hashToken,
    jwtSecret,
    verifyJwt
  } = context;

  const decoded = verifyJwt(jwtSecret, refreshToken);
  if (decoded.type !== 'refresh') {
    return {
      success: false,
      token: null,
      refreshToken: null,
      user: null,
      errorMessage: 'Invalid token type'
    };
  }

  const pool = await db.getPool();
  const refreshTokenHash = hashToken(refreshToken);
  const sessionResult = await pool.request()
    .input('refreshTokenHash', db.sql.VarChar, refreshTokenHash)
    .query(`
      SELECT SessionId, UserId, IsActive, ExpiresAt, MaxExpiresAt
      FROM Sessions
      WHERE RefreshTokenHash = @refreshTokenHash
    `);

  if (sessionResult.recordset.length === 0) {
    return {
      success: false,
      token: null,
      refreshToken: null,
      user: null,
      errorMessage: 'Invalid refresh token'
    };
  }

  const session = sessionResult.recordset[0];
  const now = new Date();
  if (!session.IsActive || now > new Date(session.ExpiresAt) || now > new Date(session.MaxExpiresAt)) {
    return {
      success: false,
      token: null,
      refreshToken: null,
      user: null,
      errorMessage: 'Refresh session has expired'
    };
  }

  if (String(session.UserId) !== String(decoded.sub)) {
    return {
      success: false,
      token: null,
      refreshToken: null,
      user: null,
      errorMessage: 'Refresh token does not match session'
    };
  }

  const user = await getUserById(decoded.sub);
  if (!user) {
    return {
      success: false,
      token: null,
      refreshToken: null,
      user: null,
      errorMessage: 'User not found'
    };
  }

  const userInfo = {
    userId: user.UserId,
    username: user.Username,
    displayName: user.DisplayName,
    email: user.Email,
    role: user.Role
  };

  const newAccessToken = generateToken(userInfo, 'access');
  const newRefreshToken = generateToken(userInfo, 'refresh');
  await createSession(user.UserId, newAccessToken, newRefreshToken, ipAddress, userAgent);

  return {
    success: true,
    token: newAccessToken,
    refreshToken: newRefreshToken,
    user: userInfo,
    errorMessage: null
  };
}

module.exports = {
  logoutSession,
  refreshAuthToken,
  validateTokenSession
};
