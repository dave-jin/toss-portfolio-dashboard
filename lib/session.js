import crypto from 'node:crypto';

export const DASHBOARD_SESSION_COOKIE = 'dashboard_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function getSecret() {
  return process.env.DASHBOARD_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dashboard-dev-secret';
}

function encode(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decode(token) {
  return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
}

function sign(data) {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

export function createSessionToken(extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    authenticated: true,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    ...extra,
  };
  const body = encode(payload);
  const signature = sign(body);
  return `${body}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token != 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = decode(body);
    const now = Math.floor(Date.now() / 1000);
    if (!payload.authenticated || !payload.exp || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  return raw.split(';').map(part => part.trim()).filter(Boolean).reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export function readSession(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[DASHBOARD_SESSION_COOKIE]);
}

export function setSessionCookie(res, extra = {}) {
  const token = createSessionToken(extra);
  const parts = [
    `${DASHBOARD_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  const parts = [
    `${DASHBOARD_SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}
