const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

export function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getSchema() {
  return process.env.SUPABASE_DB_SCHEMA || 'rich_dad_dashboard';
}

export function assertSupabaseEnv() {
  for (const key of required) getEnv(key);
}

export function supabaseBase() {
  return getEnv('SUPABASE_URL').replace(/\/$/, '');
}

export function supabaseHeaders() {
  const service = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const schema = getSchema();
  return {
    apikey: service,
    Authorization: `Bearer ${service}`,
    'Content-Type': 'application/json',
    'Accept-Profile': schema,
    'Content-Profile': schema,
  };
}

export async function fetchPasswordConfig() {
  const url = `${supabaseBase()}/rest/v1/dashboard_auth_config?select=id,key,password_hash,password_changed,updated_at&key=eq.dashboard_password&limit=1`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function upsertPasswordConfig(payload) {
  const url = `${supabaseBase()}/rest/v1/dashboard_auth_config?on_conflict=key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed: ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}
