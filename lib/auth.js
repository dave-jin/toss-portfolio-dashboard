import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const KEYLEN = 64;

export function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

export function hashPassword(password, salt = makeSalt()) {
  const derived = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N }).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, encoded) {
  if (!encoded || typeof encoded !== 'string') return false;
  const [algo, salt, hash] = encoded.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N }).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
