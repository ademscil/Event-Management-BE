const crypto = require('crypto');
const path = require('path');

function getMimeTypeFromFilename(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return '';
}

function getSafeExtension(mimeType, originalName) {
  const extensionMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
  };

  const extFromMime = extensionMap[mimeType];
  if (extFromMime) return extFromMime;

  const fallback = path.extname(String(originalName || '')).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fallback) ? fallback : '.bin';
}

function generateUniqueFilename(file) {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const originalName = typeof file === 'string' ? file : file?.originalname;
  const mimeType = typeof file === 'string' ? getMimeTypeFromFilename(file) : String(file?.mimetype || '');
  const ext = getSafeExtension(mimeType, originalName);
  return `${timestamp}-${randomString}${ext}`;
}

module.exports = {
  generateUniqueFilename,
  getMimeTypeFromFilename,
  getSafeExtension
};
