export const DASHBOARD_CONFIG_KEYS = [
  'project',
  'investor_profile',
  'red_team_protocol',
  'sell_checklist',
  'current_watchpoints',
  'decision_history',
];

export function defaultAppTabs() {
  return [
    { key: 'judgment', label: '현재 상태 및 분석' },
    { key: 'journal', label: '투자 일기' },
    { key: 'news', label: '보유 종목 뉴스' },
  ];
}

export function defaultAssetTabOptions() {
  return [
    { key: 'core_kr', label: '국내 코어' },
    { key: 'core_us', label: '미국 코어' },
    { key: 'dividend', label: '배당/현금흐름' },
    { key: 'hedge', label: '헤지' },
    { key: 'theme', label: '테마/전술' },
    { key: 'watchlist', label: '관찰/기타' },
    { key: 'exited', label: '정리완료' },
  ];
}

export function normalizeSnapshotHistory(rows = []) {
  return rows
    .slice()
    .sort((a, b) => String(a.generated_at || '').localeCompare(String(b.generated_at || '')))
    .map((row) => ({
      date: row.generated_at || null,
      note: row.note || '',
      summary: row.summary || {},
      positions: row.positions || [],
    }));
}

export function buildMarketCacheMap(rows = []) {
  const cache = {};
  for (const row of rows) {
    const payload = row.payload || {};
    const key = row.symbol || row.cache_key;
    if (!key) continue;
    cache[key] = {
      ...payload,
      market: row.market || payload.market || null,
      market_code: row.market_code || payload.market_code || null,
      updated_at: row.updated_at || null,
    };
  }
  return cache;
}
