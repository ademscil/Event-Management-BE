const bcrypt = require('bcrypt');
const {
  hashPasswordLegacy,
  isBcryptHash,
  verifyPassword
} = require('../passwordHash');

describe('passwordHash', () => {
  it('produces the same legacy hash as the C# MD5 Unicode rule', () => {
    expect(hashPasswordLegacy('Komponen1!')).toBe('aaAAshkiubw96QgvBvxd3w==');
  });

  it('returns identical hashes for identical passwords', () => {
    expect(hashPasswordLegacy('admin123')).toBe(hashPasswordLegacy('admin123'));
  });

  it('detects bcrypt hashes', async () => {
    const bcryptHash = await bcrypt.hash('Admin123!', 10);
    expect(isBcryptHash(bcryptHash)).toBe(true);
    expect(isBcryptHash(hashPasswordLegacy('Admin123!'))).toBe(false);
  });

  it('verifies legacy hashes', async () => {
    const storedHash = hashPasswordLegacy('Admin123!');
    await expect(verifyPassword('Admin123!', storedHash)).resolves.toBe(true);
    await expect(verifyPassword('Wrong123!', storedHash)).resolves.toBe(false);
  });

  it('verifies bcrypt hashes for backward compatibility', async () => {
    const storedHash = await bcrypt.hash('Admin123!', 10);
    await expect(verifyPassword('Admin123!', storedHash)).resolves.toBe(true);
    await expect(verifyPassword('Wrong123!', storedHash)).resolves.toBe(false);
  });
});
