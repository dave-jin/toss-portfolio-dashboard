import { readSession } from '../../lib/session.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function yyyymmdd(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}

function mapMarket(value) {
  if (!value) return 'KOSPI';
  const upper = String(value).toUpperCase();
  if (upper === 'KSP' || upper === 'KOSPI' || upper === 'KR_STOCK') return 'KOSPI';
  if (upper === 'KSQ' || upper === 'KOSDAQ') return 'KOSDAQ';
  if (upper === 'KNX' || upper === 'KONEX') return 'KONEX';
  return upper;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`proxy_failed:${res.status}`);
  return await res.json();
}

export default async function handler(req, res) {
  try {
    const session = readSession(req);
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });

    const symbol = String(req.query?.symbol || '').trim();
    if (!symbol) return json(res, 400, { ok: false, error: 'symbol_required' });

    const days = Math.min(30, Math.max(5, Number(req.query?.days || 20)));
    const market = mapMarket(req.query?.market);
    const code = symbol.replace(/^A/i, '').trim();
    const base = (process.env.KSKILL_PROXY_BASE_URL || 'https://k-skill-proxy.nomadamas.org').replace(/\/$/, '');

    const dates = [];
    const cursor = new Date();
    while (dates.length < days && dates.length < 60) {
      dates.push(yyyymmdd(cursor));
      cursor.setDate(cursor.getDate() - 1);
    }

    const requests = await Promise.all(dates.map(async (bas_dd) => {
      try {
        return await fetchJson(`${base}/v1/korean-stock/trade-info?market=${encodeURIComponent(market)}&code=${encodeURIComponent(code)}&bas_dd=${encodeURIComponent(bas_dd)}`);
      } catch {
        return null;
      }
    }));

    const items = requests.map(item => item?.item).filter(Boolean).sort((a, b) => String(a.base_date).localeCompare(String(b.base_date)));
    let baseInfo = null;
    try {
      const bas_dd = items[items.length - 1]?.base_date || yyyymmdd(new Date());
      baseInfo = await fetchJson(`${base}/v1/korean-stock/base-info?market=${encodeURIComponent(market)}&code=${encodeURIComponent(code)}&bas_dd=${encodeURIComponent(bas_dd)}`);
    } catch {
      baseInfo = null;
    }

    return json(res, 200, {
      ok: true,
      market,
      code,
      series: items,
      baseInfo: baseInfo?.item || null,
      source: 'KRX official data via k-skill-proxy',
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'server_error' });
  }
}
