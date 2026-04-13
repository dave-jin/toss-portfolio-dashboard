import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarketCacheMap,
  defaultAppTabs,
  defaultAssetTabOptions,
  normalizeSnapshotHistory,
} from '../lib/dashboard.js';

test('defaultAppTabs matches requested three-tab structure', () => {
  assert.deepEqual(defaultAppTabs(), [
    { key: 'judgment', label: '현재 상태 및 분석' },
    { key: 'journal', label: '투자 일기' },
    { key: 'news', label: '보유 종목 뉴스' },
  ]);
});

test('normalizeSnapshotHistory sorts snapshots ascending and keeps dashboard fields', () => {
  const rows = normalizeSnapshotHistory([
    { generated_at: '2026-04-13T14:00:00+09:00', note: '오후', summary: { total_asset: 2 }, positions: [{ symbol: 'B' }] },
    { generated_at: '2026-04-13T10:00:00+09:00', note: '오전', summary: { total_asset: 1 }, positions: [{ symbol: 'A' }] },
  ]);

  assert.equal(rows[0].date, '2026-04-13T10:00:00+09:00');
  assert.equal(rows[1].date, '2026-04-13T14:00:00+09:00');
  assert.equal(rows[0].note, '오전');
  assert.deepEqual(rows[1].positions, [{ symbol: 'B' }]);
});

test('buildMarketCacheMap indexes rows by symbol and merges payload fields', () => {
  const cache = buildMarketCacheMap([
    {
      cache_key: 'A005930',
      symbol: 'A005930',
      market: 'KR_STOCK',
      market_code: 'KSP',
      payload: {
        series: [{ base_date: '20260413', close_price: 1000 }],
        source: 'KRX',
      },
      updated_at: '2026-04-13T14:00:00+09:00',
    },
  ]);

  assert.deepEqual(cache.A005930.series, [{ base_date: '20260413', close_price: 1000 }]);
  assert.equal(cache.A005930.market, 'KR_STOCK');
  assert.equal(cache.A005930.market_code, 'KSP');
  assert.equal(cache.A005930.source, 'KRX');
});

test('defaultAssetTabOptions still exposes editable asset note groups', () => {
  const keys = defaultAssetTabOptions().map((item) => item.key);
  assert.deepEqual(keys, ['core_kr', 'core_us', 'dividend', 'hedge', 'theme', 'watchlist', 'exited']);
});
