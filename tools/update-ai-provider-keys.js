#!/usr/bin/env node
/**
 * Prompt for a user's email and optional API keys, decrypt existing key_vaults values,
 * merge the provided keys, encrypt the result, and upsert it into ai_providers.
 */

const crypto = require('crypto');
const { Client } = require('pg');
const readline = require('readline');

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:secret@localhost:5432/postgres';

function ensureKey(secret) {
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) {
    throw new Error(`Invalid KEY_VAULTS_SECRET length: ${key.length} bytes (expected 32 bytes)`);
  }
  return key;
}

function decryptKeyVaults(encrypted, secret) {
  if (!encrypted) return {};

  const key = ensureKey(secret);
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted key_vaults format. Expected iv:authTag:encrypted hex segments');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

  try {
    const parsed = decrypted ? JSON.parse(decrypted) : {};

    if (typeof parsed === 'string') return { apiKey: parsed };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse decrypted key_vaults JSON: ${error.message}`);
  }
}

function encryptKeyVaults(plaintextObject, secret) {
  const key = ensureKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(plaintextObject), 'utf8');

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function collectInputs() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const secretInput = await askQuestion(rl, 'KEY_VAULTS_SECRET (leave blank to use env): ');
    const keyVaultsSecret = secretInput || process.env.KEY_VAULTS_SECRET;
    if (!keyVaultsSecret) {
      throw new Error('KEY_VAULTS_SECRET is required');
    }

    const email = await askQuestion(rl, 'Enter user email: ');
    if (!email) {
      throw new Error('email is required');
    }

    const openaiKey = await askQuestion(
      rl,
      'OpenAI API key (leave blank to keep current value): ',
    );
    const claudeKey = await askQuestion(
      rl,
      'Claude (Anthropic) API key (leave blank to keep current value): ',
    );
    const googleKey = await askQuestion(
      rl,
      'Google API key (leave blank to keep current value): ',
    );

    return {
      keyVaultsSecret,
      claudeKey,
      email,
      googleKey,
      openaiKey,
    };
  } finally {
    rl.close();
  }
}

async function main() {
  const { email, openaiKey, claudeKey, googleKey, keyVaultsSecret } = await collectInputs();

  const providerInputs = [
    { id: 'openai', label: 'OpenAI', apiKey: openaiKey },
    { id: 'anthropic', label: 'Claude (Anthropic)', apiKey: claudeKey },
    { id: 'google', label: 'Google API', apiKey: googleKey },
  ];

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();

    const {
      rows: userRows,
    } = await client.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [
      email,
    ]);

    if (userRows.length === 0) {
      console.error(`No user found with email "${email}".`);
      process.exitCode = 1;
      return;
    }

    const userId = userRows[0].id;

    const providerIds = providerInputs.map((item) => item.id);
    const { rows } = await client.query(
      'SELECT id, key_vaults FROM ai_providers WHERE user_id = $1 AND id = ANY($2::text[])',
      [userId, providerIds],
    );

    const existingVaults = new Map(rows.map((row) => [row.id, row.key_vaults]));
    const updates = [];

    for (const provider of providerInputs) {
      const existingEncrypted = existingVaults.get(provider.id);
      let currentVault = {};

      if (existingEncrypted) {
        try {
          currentVault = decryptKeyVaults(existingEncrypted, keyVaultsSecret);
        } catch (error) {
          console.error(
            `Failed to decrypt key_vaults for provider ${provider.id}. ${error.message}`,
          );
          throw error;
        }
      }

      if (!provider.apiKey) {
        if (!existingEncrypted) {
          // Nothing to update; skip providers with no prior data and no new key.
          continue;
        }

        // Nothing changed; skip writing the same payload again.
        console.log(
          `Skipped ${provider.label}: no new API key provided, existing value preserved.`,
        );
        continue;
      }

      const updatedVault = {
        ...currentVault,
        apiKey: provider.apiKey,
      };

      const encrypted = encryptKeyVaults(updatedVault, keyVaultsSecret);

      updates.push({ encrypted, id: provider.id, label: provider.label });
    }

    if (updates.length === 0) {
      console.log('No updates were applied.');
      return;
    }

    for (const update of updates) {
      await client.query(
        `INSERT INTO ai_providers (id, user_id, key_vaults, enabled, source, settings)
         VALUES ($1, $2, $3, true, 'builtin', '{}'::jsonb)
         ON CONFLICT (id, user_id)
         DO UPDATE SET key_vaults = EXCLUDED.key_vaults, updated_at = NOW()`,
        [update.id, userId, update.encrypted],
      );

      console.log(`Updated ${update.label} credentials for ${email} (user ${userId}).`);
    }
  } catch (error) {
    console.error('Failed to update key_vaults:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
