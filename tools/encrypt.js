const crypto = require('crypto');

const KEY_VAULTS_SECRET = process.env.KEY_VAULTS_SECRET;
const plaintext = process.env.PLAINTEXT || process.env.DATA;

if (!KEY_VAULTS_SECRET) {
  console.error('Error: KEY_VAULTS_SECRET environment variable is not set');
  console.error('\nUsage:');
  console.error('  KEY_VAULTS_SECRET="base64-key" PLAINTEXT="data" node tools/encrypt.js');
  console.error('\nExample:');
  console.error('  KEY_VAULTS_SECRET="Q10pwdq00KXUu9R+c8A8p4PSlIRWi7KwgUophBtkHVk=" PLAINTEXT=\'{"apiKey":"sk-xxx"}\' node tools/encrypt.js');
  process.exit(1);
}

if (!plaintext) {
  console.error('Error: PLAINTEXT or DATA environment variable is not set');
  console.error('\nUsage:');
  console.error('  KEY_VAULTS_SECRET="base64-key" PLAINTEXT="data" node tools/encrypt.js');
  process.exit(1);
}

try {
  const key = Buffer.from(KEY_VAULTS_SECRET, 'base64');

  if (key.length !== 32) {
    throw new Error(`Invalid key length: ${key.length} bytes (expected 32 bytes for AES-256)`);
  }

  const iv = crypto.randomBytes(12); // GCM 모드는 12바이트 IV 권장

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag(); // GCM 인증 태그 (16바이트)

  // 프로젝트 형식에 맞게 출력: iv:authTag:encrypted
  const result = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;

  console.log(result);
} catch (error) {
  console.error('Encryption failed:', error.message);
  process.exit(1);
}