import { fetchAssetProfiles, fetchJournalEntries, fetchTrades } from '../../lib/supabase.js';
import { readSession } from '../../lib/session.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readRemoteJson(req, assetPath, fallback) {
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const res = await fetch(`${proto}://${host}${assetPath}`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function mergeProfiles(contextPositions = {}, dbProfiles = [], latestPositions = []) {
  const latestMap = Object.fromEntries((latestPositions || []).map(item => [item.symbol, item]));
  const merged = {};

  for (const [symbol, profile] of Object.entries(contextPositions || {})) {
    const latest = latestMap[symbol] || {};
    merged[symbol] = {
      symbol,
      display_name: profile.display_name || latest.name || symbol,
      market: latest.market_type || null,
      market_code: latest.market_code || null,
      tab_key: 'watchlist',
      role: profile.role || '',
      why_bought: profile.why_bought || [],
      why_sold: profile.why_sold || '',
      review_triggers: profile.review_triggers || [],
      sell_plan: profile.sell_plan || {},
      next_best_action: profile.next_best_action || '',
      memo: profile.memo || '',
      updated_at: null,
    };
  }

  for (const row of dbProfiles) {
    merged[row.symbol] = {
      ...(merged[row.symbol] || {}),
      ...row,
    };
  }

  return merged;
}

export default async function handler(req, res) {
  try {
    const session = readSession(req);
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });

    const latest = await readRemoteJson(req, '/data/latest.json', {});
    const history = await readRemoteJson(req, '/data/history.json', []);
    const meta = await readRemoteJson(req, '/data/dashboard_meta.json', {});
    const [profiles, trades, journals] = await Promise.all([
      fetchAssetProfiles(),
      fetchTrades(),
      fetchJournalEntries(),
    ]);

    return json(res, 200, {
      ok: true,
      latest,
      history,
      project: meta.project || {},
      investorProfile: meta.investor_profile || {},
      redTeamProtocol: meta.red_team_protocol || [],
      sellChecklist: meta.sell_checklist || [],
      currentWatchpoints: meta.current_watchpoints || [],
      assetProfiles: mergeProfiles({}, profiles, latest.positions || []),
      trades,
      journals,
      appTabs: [
        { key: 'judgment', label: '오늘의 판단' },
        { key: 'journal', label: '투자일기' },
        { key: 'notes', label: '종목노트' },
      ],
      assetTabOptions: [
        { key: 'core_kr', label: '국내 코어' },
        { key: 'core_us', label: '미국 코어' },
        { key: 'dividend', label: '배당/현금흐름' },
        { key: 'hedge', label: '헤지' },
        { key: 'theme', label: '테마/전술' },
        { key: 'watchlist', label: '관찰/기타' },
        { key: 'exited', label: '정리완료' },
      ],
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'server_error' });
  }
}
