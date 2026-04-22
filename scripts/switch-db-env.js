const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const activeEnvPath = path.join(rootDir, '.env.development');

const profiles = {
  office: path.join(rootDir, '.env.development.office'),
  localdb: path.join(rootDir, '.env.development.localdb'),
};

function parseEnv(text) {
  const result = {};
  String(text || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1);
      result[key] = value;
    });
  return result;
}

function loadProfile(profileName) {
  const profilePath = profiles[profileName];
  if (!profilePath) {
    throw new Error(`Profile tidak dikenal: ${profileName}`);
  }
  if (!fs.existsSync(profilePath)) {
    throw new Error(`File profile tidak ditemukan: ${profilePath}`);
  }
  return {
    profilePath,
    content: fs.readFileSync(profilePath, 'utf8'),
  };
}

function showActiveProfile() {
  if (!fs.existsSync(activeEnvPath)) {
    console.log('.env.development belum ada.');
    process.exit(0);
  }

  const current = parseEnv(fs.readFileSync(activeEnvPath, 'utf8'));
  const summary = {
    DB_SERVER: current.DB_SERVER || '',
    DB_NAME: current.DB_NAME || '',
    DB_USER: current.DB_USER || '',
    DB_ENCRYPT: current.DB_ENCRYPT || '',
  };

  console.log('Profile aktif saat ini:');
  Object.entries(summary).forEach(([key, value]) => {
    console.log(`- ${key}=${value}`);
  });
}

function switchProfile(profileName) {
  const { profilePath, content } = loadProfile(profileName);
  fs.writeFileSync(activeEnvPath, content, 'utf8');

  const current = parseEnv(content);
  console.log(`Profile berhasil diaktifkan: ${profileName}`);
  console.log(`Sumber profile: ${profilePath}`);
  console.log(`DB_SERVER=${current.DB_SERVER || ''}`);
  console.log(`DB_NAME=${current.DB_NAME || ''}`);

  if (profileName === 'localdb') {
    console.log('');
    console.log('Catatan: profile LocalDB sudah aktif.');
    console.log('Jika backend Node masih gagal konek, berarti driver mssql/tedious project ini masih perlu penyesuaian lebih lanjut untuk LocalDB.');
  }
}

function main() {
  const arg = process.argv[2];
  if (!arg || arg === '--show') {
    showActiveProfile();
    return;
  }

  switchProfile(arg);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
