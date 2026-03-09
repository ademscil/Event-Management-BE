const crypto = require('crypto');
const bcrypt = require('bcrypt');

function hashPasswordLegacy(password) {
  const normalizedPassword = String(password || '');
  const buffer = Buffer.from(normalizedPassword, 'utf16le');
  return crypto.createHash('md5').update(buffer).digest('base64');
}

function isBcryptHash(hash) {
  return typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return false;
  }

  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(password, storedHash);
  }

  return hashPasswordLegacy(password) === storedHash;
}

module.exports = {
  hashPasswordLegacy,
  isBcryptHash,
  verifyPassword
};
