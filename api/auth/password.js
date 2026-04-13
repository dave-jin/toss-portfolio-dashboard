import { hashPassword, verifyPassword } from '../../lib/auth.js';
import { assertSupabaseEnv, fetchPasswordConfig, upsertPasswordConfig } from '../../lib/supabase.js';
import { clearSessionCookie, setSessionCookie } from '../../lib/session.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    assertSupabaseEnv();

    if (req.method === 'GET') {
      const row = await fetchPasswordConfig();
      if (!row) {
        clearSessionCookie(res);
        return json(res, 200, { ok: true, exists: false, needsPasswordChange: true });
      }
      return json(res, 200, {
        ok: true,
        exists: true,
        needsPasswordChange: !row.password_changed,
        updatedAt: row.updated_at,
      });
    }

    if (req.method === 'POST') {
      const { password } = req.body || {};
      if (!password || typeof password !== 'string') {
        clearSessionCookie(res);
        return json(res, 400, { ok: false, error: 'password_required' });
      }
      const row = await fetchPasswordConfig();
      if (!row) {
        const created = await upsertPasswordConfig({
          key: 'dashboard_password',
          password_hash: hashPassword(password),
          password_changed: password !== '12345',
        });
        setSessionCookie(res);
        return json(res, 200, { ok: true, authenticated: true, needsPasswordChange: !created.password_changed });
      }
      const matched = verifyPassword(password, row.password_hash);
      if (!matched) {
        clearSessionCookie(res);
      } else {
        setSessionCookie(res);
      }
      return json(res, 200, {
        ok: true,
        authenticated: matched,
        needsPasswordChange: matched ? !row.password_changed : false,
      });
    }

    if (req.method === 'PATCH') {
      const { currentPassword, nextPassword } = req.body || {};
      if (!nextPassword || typeof nextPassword !== 'string' || nextPassword.length < 4) {
        return json(res, 400, { ok: false, error: 'invalid_next_password' });
      }
      const row = await fetchPasswordConfig();
      if (!row) {
        const created = await upsertPasswordConfig({
          key: 'dashboard_password',
          password_hash: hashPassword(nextPassword),
          password_changed: true,
        });
        setSessionCookie(res);
        return json(res, 200, { ok: true, updated: true, updatedAt: created.updated_at });
      }
      const ok = verifyPassword(currentPassword || '', row.password_hash);
      if (!ok) {
        return json(res, 403, { ok: false, error: 'wrong_current_password' });
      }
      const updated = await upsertPasswordConfig({
        key: 'dashboard_password',
        password_hash: hashPassword(nextPassword),
        password_changed: true,
      });
      setSessionCookie(res);
      return json(res, 200, { ok: true, updated: true, updatedAt: updated.updated_at });
    }

    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'server_error' });
  }
}
