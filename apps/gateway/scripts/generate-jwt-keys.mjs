/**
 * Generate an RS256 key pair for signing/verifying gateway JWTs.
 *
 * Pure Node `crypto` — no OpenSSL dependency, so it runs the same on
 * Windows / macOS / Linux (CLAUDE.md §3: keep the PoC laptop-runnable).
 *
 * Writes ./secrets/jwt-private.pem + ./secrets/jwt-public.pem, relative to the
 * gateway working dir, matching JWT_*_KEY_PATH in .env.example. Existing keys
 * are never overwritten (so refresh tokens minted earlier stay verifiable).
 *
 *   npm run gen:keys            # from apps/gateway
 *
 * `secrets/` and `*.pem` are gitignored — keys must never be committed.
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gatewayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const secretsDir = resolve(gatewayRoot, 'secrets');
const privatePath = resolve(secretsDir, 'jwt-private.pem');
const publicPath = resolve(secretsDir, 'jwt-public.pem');

if (existsSync(privatePath) && existsSync(publicPath)) {
  console.log('JWT key pair already present — leaving it untouched:');
  console.log(`  ${privatePath}`);
  console.log(`  ${publicPath}`);
  process.exit(0);
}

mkdirSync(secretsDir, { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Restrictive mode on the private key where the OS honours it (no-op on Windows).
writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey, { mode: 0o644 });

console.log('Generated RS256 JWT key pair:');
console.log(`  ${privatePath}`);
console.log(`  ${publicPath}`);
