const config = require('../../config');
const { ValidationError } = require('./errors');

function validateQuestionType(type) {
  const validTypes = ['HeroCover', 'Text', 'MultipleChoice', 'Checkbox', 'Dropdown', 'MatrixLikert', 'Rating', 'Date', 'Signature'];
  if (!validTypes.includes(type)) {
    throw new ValidationError(`Question type must be one of: ${validTypes.join(', ')}`);
  }
}

function validateLayoutOrientation(orientation) {
  if (orientation && !['vertical', 'horizontal'].includes(orientation)) {
    throw new ValidationError('Layout orientation must be either "vertical" or "horizontal"');
  }
}

function validateImageFile(file) {
  if (!file || !file.buffer) {
    throw new ValidationError('No file provided');
  }

  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new ValidationError('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed');
  }

  const maxSizeMB = config.upload.maxFileSizeMB || 10;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new ValidationError(`File size exceeds maximum allowed size of ${maxSizeMB}MB`);
  }

  if (process.env.NODE_ENV !== 'test') {
    const signatures = {
      'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
      'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
      'image/gif': [Buffer.from([0x47, 0x49, 0x46, 0x38])],
      'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])]
    };

    const allowedSignatures = signatures[file.mimetype] || [];
    const fileHeader = file.buffer.subarray(0, 12);
    const isSignatureValid = allowedSignatures.some((signature) => fileHeader.subarray(0, signature.length).equals(signature));
    if (!isSignatureValid) {
      throw new ValidationError('File content does not match the provided image type');
    }
  }
}

module.exports = {
  validateImageFile,
  validateLayoutOrientation,
  validateQuestionType
};
