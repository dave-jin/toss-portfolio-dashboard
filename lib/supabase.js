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

async function supabaseError(res, action) {
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    bodyText = '';
  }

  let detail = bodyText.trim();
  if (detail) {
    try {
      detail = JSON.stringify(JSON.parse(detail));
    } catch {
      // keep original
    }
  }

  const suffix = detail ? ` body=${detail}` : '';
  return new Error(`Supabase ${action} failed: ${res.status}${suffix}`);
}

function buildUrl(path, params) {
  const url = new URL(`${supabaseBase()}/rest/v1/${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function formatInList(values = []) {
  const items = values.map((value) => String(value).replaceAll(',', '\\,')).filter(Boolean);
  return items.length ? `(${items.join(',')})` : undefined;
}

export async function supabaseRequest(path, { method = 'GET', params, body, headers = {}, action = method.toLowerCase() } = {}) {
  const res = await fetch(buildUrl(path, params), {
    method,
    headers: {
      ...supabaseHeaders(),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await supabaseError(res, action);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function fetchPasswordConfig() {
  const rows = await supabaseRequest('dashboard_auth_config', {
    params: {
      select: 'id,key,password_hash,password_changed,updated_at',
      key: 'eq.dashboard_password',
      limit: 1,
    },
    action: 'read',
  });
  return rows?.[0] || null;
}

export async function upsertPasswordConfig(payload) {
  const rows = await supabaseRequest('dashboard_auth_config', {
    method: 'POST',
    params: { on_conflict: 'key' },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: payload,
    action: 'upsert',
  });
  return rows?.[0] || null;
}

export async function fetchRuntimeConfigMap(keys = []) {
  const params = {
    select: 'key,value,updated_at',
    order: 'key.asc',
    limit: Math.max(keys.length || 20, 20),
  };
  if (keys.length) params.key = `in.${formatInList(keys)}`;
  const rows = await supabaseRequest('dashboard_runtime_config', {
    params,
    action: 'fetch runtime config',
  }) || [];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function upsertRuntimeConfigRows(rows) {
  if (!rows?.length) return [];
  return await supabaseRequest('dashboard_runtime_config', {
    method: 'POST',
    params: { on_conflict: 'key' },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: rows,
    action: 'upsert runtime config',
  }) || [];
}

export async function fetchLatestDashboardSnapshot() {
  const rows = await supabaseRequest('dashboard_snapshots', {
    params: {
      select: '*',
      order: 'generated_at.desc',
      limit: 1,
    },
    action: 'fetch latest dashboard snapshot',
  });
  return rows?.[0] || null;
}

export async function fetchDashboardHistory(limit = 180) {
  return await supabaseRequest('dashboard_snapshots', {
    params: {
      select: 'generated_at,note,summary,positions',
      order: 'generated_at.desc',
      limit,
    },
    action: 'fetch dashboard history',
  }) || [];
}

export async function upsertDashboardSnapshots(rows) {
  if (!rows?.length) return [];
  return await supabaseRequest('dashboard_snapshots', {
    method: 'POST',
    params: { on_conflict: 'generated_at' },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: rows,
    action: 'upsert dashboard snapshots',
  }) || [];
}

export async function fetchMarketCacheRows(limit = 200) {
  return await supabaseRequest('dashboard_market_cache', {
    params: {
      select: '*',
      order: 'updated_at.desc',
      limit,
    },
    action: 'fetch market cache',
  }) || [];
}

export async function upsertMarketCacheRows(rows) {
  if (!rows?.length) return [];
  return await supabaseRequest('dashboard_market_cache', {
    method: 'POST',
    params: { on_conflict: 'cache_key' },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: rows,
    action: 'upsert market cache',
  }) || [];
}

export async function fetchNewsItems({ symbols = [], limit = 120 } = {}) {
  const params = {
    select: '*',
    order: 'published_at.desc,updated_at.desc',
    limit,
  };
  if (symbols.length) params.symbol = `in.${formatInList(symbols)}`;
  return await supabaseRequest('dashboard_news_items', {
    params,
    action: 'fetch news items',
  }) || [];
}

export async function upsertNewsItems(rows) {
  if (!rows?.length) return [];
  return await supabaseRequest('dashboard_news_items', {
    method: 'POST',
    params: { on_conflict: 'url' },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: rows,
    action: 'upsert news items',
  }) || [];
}

export async function deleteNewsItemsOlderThan(dateIso) {
  await supabaseRequest('dashboard_news_items', {
    method: 'DELETE',
    params: {
      updated_at: `lt.${dateIso}`,
    },
    headers: { Prefer: 'return=minimal' },
    action: 'delete stale news items',
  });
  return { ok: true };
}

export async function fetchAssetProfiles() {
  return await supabaseRequest('dashboard_asset_profiles', {
    params: {
      select: '*',
      order: 'display_name.asc',
    },
    action: 'fetch asset profiles',
  }) || [];
}

export async function upsertAssetProfile(payload) {
  const rows = await supabaseRequest('dashboard_asset_profiles', {
    method: 'POST',
    params: { on_conflict: 'symbol' },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: payload,
    action: 'upsert asset profile',
  });
  return rows?.[0] || null;
}

export async function fetchTrades({ symbol, limit = 200 } = {}) {
  const params = {
    select: '*',
    order: 'order_date.desc,submitted_at.desc',
    limit,
  };
  if (symbol) params.symbol = `eq.${symbol}`;
  return await supabaseRequest('dashboard_trade_history', {
    params,
    action: 'fetch trades',
  }) || [];
}

export async function updateTradeNote(tradeId, tradeNote) {
  const rows = await supabaseRequest('dashboard_trade_history', {
    method: 'PATCH',
    params: {
      trade_id: `eq.${tradeId}`,
      select: '*',
    },
    headers: { Prefer: 'return=representation' },
    body: {
      trade_note: tradeNote,
      updated_at: new Date().toISOString(),
    },
    action: 'update trade note',
  });
  return rows?.[0] || null;
}

export async function fetchJournalEntries() {
  return await supabaseRequest('dashboard_journal_entries', {
    params: {
      select: '*',
      order: 'entry_date.desc,id.desc',
      limit: 200,
    },
    action: 'fetch journals',
  }) || [];
}

export async function createJournalEntry(payload) {
  const rows = await supabaseRequest('dashboard_journal_entries', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: payload,
    action: 'create journal entry',
  });
  return rows?.[0] || null;
}

export async function updateJournalEntry(id, payload) {
  const rows = await supabaseRequest('dashboard_journal_entries', {
    method: 'PATCH',
    params: { id: `eq.${id}`, select: '*' },
    headers: { Prefer: 'return=representation' },
    body: {
      ...payload,
      updated_at: new Date().toISOString(),
    },
    action: 'update journal entry',
  });
  return rows?.[0] || null;
}

export async function deleteJournalEntry(id) {
  await supabaseRequest('dashboard_journal_entries', {
    method: 'DELETE',
    params: { id: `eq.${id}` },
    headers: { Prefer: 'return=minimal' },
    action: 'delete journal entry',
  });
  return { ok: true };
}
