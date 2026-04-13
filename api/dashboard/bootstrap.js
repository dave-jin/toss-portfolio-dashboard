import {
  fetchAssetProfiles,
  fetchDashboardHistory,
  fetchJournalEntries,
  fetchLatestDashboardSnapshot,
  fetchMarketCacheRows,
  fetchNewsItems,
  fetchRuntimeConfigMap,
  fetchTrades,
} from '../../lib/supabase.js';
import {
  buildMarketCacheMap,
  DASHBOARD_CONFIG_KEYS,
  defaultAppTabs,
  defaultAssetTabOptions,
  normalizeSnapshotHistory,
} from '../../lib/dashboard.js';
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

    const [latestFallback, historyFallback, metaFallback, marketCacheFallback] = await Promise.all([
      readRemoteJson(req, '/data/latest.json', {}),
      readRemoteJson(req, '/data/history.json', []),
      readRemoteJson(req, '/data/dashboard_meta.json', {}),
      readRemoteJson(req, '/data/korean_stock_cache.json', {}),
    ]);

    const [runtimeConfig, latestSnapshot, historyRows, profiles, trades, journals, marketCacheRows, news] = await Promise.all([
      fetchRuntimeConfigMap(DASHBOARD_CONFIG_KEYS).catch(() => ({})),
      fetchLatestDashboardSnapshot().catch(() => null),
      fetchDashboardHistory().catch(() => []),
      fetchAssetProfiles().catch(() => []),
      fetchTrades().catch(() => []),
      fetchJournalEntries().catch(() => []),
      fetchMarketCacheRows().catch(() => []),
      fetchNewsItems().catch(() => []),
    ]);

    const latest = latestSnapshot?.latest || latestFallback || {};
    const latestPositions = latest.positions || latestSnapshot?.positions || [];

    return json(res, 200, {
      ok: true,
      latest,
      history: historyRows.length ? normalizeSnapshotHistory(historyRows) : historyFallback,
      project: runtimeConfig.project || metaFallback.project || {},
      investorProfile: runtimeConfig.investor_profile || metaFallback.investor_profile || {},
      redTeamProtocol: runtimeConfig.red_team_protocol || metaFallback.red_team_protocol || [],
      sellChecklist: runtimeConfig.sell_checklist || metaFallback.sell_checklist || [],
      currentWatchpoints: runtimeConfig.current_watchpoints || metaFallback.current_watchpoints || [],
      decisionHistory: runtimeConfig.decision_history || metaFallback.decision_history || [],
      assetProfiles: mergeProfiles({}, profiles, latestPositions),
      trades,
      journals,
      koreanStockCache: marketCacheRows.length ? buildMarketCacheMap(marketCacheRows) : marketCacheFallback,
      news,
      appTabs: defaultAppTabs(),
      assetTabOptions: defaultAssetTabOptions(),
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'server_error' });
  }
}
