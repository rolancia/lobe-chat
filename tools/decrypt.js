const crypto = require('crypto');

const KEY_VAULTS_SECRET = process.env.KEY_VAULTS_SECRET;
const encryptedData = process.env.ENCRYPTED_DATA || process.env.DATA;

if (!KEY_VAULTS_SECRET) {
  console.error('Error: KEY_VAULTS_SECRET environment variable is not set');
  console.error('\nUsage:');
  console.error('  KEY_VAULTS_SECRET="base64-key" ENCRYPTED_DATA="iv:authTag:encrypted" node tools/decrypt.js');
  console.error('\nExample:');
  console.error('  KEY_VAULTS_SECRET="Q10pwdq00KXUu9R+c8A8p4PSlIRWi7KwgUophBtkHVk=" ENCRYPTED_DATA="a1b2c3..." node tools/decrypt.js');
  process.exit(1);
}

if (!encryptedData) {
  console.error('Error: ENCRYPTED_DATA or DATA environment variable is not set');
  console.error('\nUsage:');
  console.error('  KEY_VAULTS_SECRET="base64-key" ENCRYPTED_DATA="iv:authTag:encrypted" node tools/decrypt.js');
  process.exit(1);
}

try {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted data format. Expected: iv:authTag:encrypted');
  }

  const key = Buffer.from(KEY_VAULTS_SECRET, 'base64');

  if (key.length !== 32) {
    throw new Error(`Invalid key length: ${key.length} bytes (expected 32 bytes for AES-256)`);
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, null, 'utf8');
  decrypted += decipher.final('utf8');

  console.log(decrypted);
} catch (error) {
  console.error('Decryption failed:', error.message);
  process.exit(1);
}
