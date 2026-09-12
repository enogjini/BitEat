'use strict';

/**
 * Session tokens and password hashing, built on Node's own `crypto` so the
 * API (and its install-free test suite) picks up no new dependencies.
 *
 * Tokens are compact HS256 JWTs: base64url(header).base64url(payload).sig.
 * Passwords are stored as `scrypt:<salt>:<hash>`; a bare value is treated as
 * a legacy plaintext password and is re-hashed on the next successful login.
 */

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const DEV_SECRET = 'biteat-dev-secret-change-me';
const TOKEN_TTL_SECONDS = 12 * 60 * 60; // one shift
const SCRYPT_KEYLEN = 64;

let warned = false;

/**
 * Resolve the signing secret at call time (not module load) so a test can
 * swap `process.env.JWT_SECRET` between app loads.
 */
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set; refusing to sign sessions with the dev secret in production');
  }
  if (!warned) {
    warned = true;
    console.warn('JWT_SECRET is not set; using an insecure development secret');
  }
  return DEV_SECRET;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function hmac(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * @param {object} payload claims to embed; `iat`/`exp` are added here
 * @param {string} secret
 * @param {number} [ttlSeconds]
 */
function signToken(payload, secret, ttlSeconds = TOKEN_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const data = `${header}.${body}`;
  return `${data}.${hmac(data, secret)}`;
}

/**
 * @returns {object|null} the payload when the signature and expiry check out
 */
function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;

  const expected = Buffer.from(hmac(`${header}.${body}`, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number') return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(String(password), salt, SCRYPT_KEYLEN);
  return `scrypt:${salt}:${Buffer.from(hash).toString('hex')}`;
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt:');
}

/**
 * Compare a submitted password with the stored value, hashed or legacy plain.
 */
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  if (isHashed(stored)) {
    const [, salt, hex] = stored.split(':');
    if (!salt || !hex) return false;
    const expected = Buffer.from(hex, 'hex');
    const actual = Buffer.from(await scrypt(password, salt, expected.length));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  const a = Buffer.from(password);
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  TOKEN_TTL_SECONDS,
  getSecret,
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  isHashed,
};
