const crypto = require('crypto');

function normalizePhoneNumber(phoneNumber) {
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  if (digits.startsWith('62')) {
    return digits;
  }

  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }

  return digits;
}

function hashOneTimeToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhoneChannel(channel) {
  return String(channel || '').trim().toLowerCase() === 'sms' ? 'sms' : 'whatsapp';
}

module.exports = {
  generateOtpCode,
  hashOneTimeToken,
  normalizePhoneChannel,
  normalizePhoneNumber
};
