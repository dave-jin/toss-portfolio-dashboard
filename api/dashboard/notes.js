import { fetchAssetProfiles, fetchTrades, updateTradeNote, upsertAssetProfile } from '../../lib/supabase.js';
import { readSession } from '../../lib/session.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    const session = readSession(req);
    if (!session) return json(res, 401, { ok: false, error: 'unauthorized' });

    if (req.method === 'GET') {
      const symbol = req.query?.symbol;
      const [profiles, trades] = await Promise.all([
        fetchAssetProfiles(),
        fetchTrades({ symbol }),
      ]);
      const profile = profiles.find(item => item.symbol === symbol) || null;
      return json(res, 200, { ok: true, profile, trades });
    }

    if (req.method === 'PATCH') {
      const { type } = req.body || {};
      if (type === 'asset') {
        const {
          symbol,
          displayName,
          market,
          marketCode,
          tabKey,
          role,
          whyBought = [],
          whySold = '',
          reviewTriggers = [],
          sellPlan = {},
          nextBestAction = '',
          memo = '',
        } = req.body || {};
        if (!symbol) return json(res, 400, { ok: false, error: 'symbol_required' });
        const item = await upsertAssetProfile({
          symbol,
          display_name: displayName || symbol,
          market: market || null,
          market_code: marketCode || null,
          tab_key: tabKey || 'watchlist',
          role: role || '',
          why_bought: whyBought,
          why_sold: whySold || '',
          review_triggers: reviewTriggers,
          sell_plan: sellPlan,
          next_best_action: nextBestAction || '',
          memo: memo || '',
          updated_at: new Date().toISOString(),
        });
        return json(res, 200, { ok: true, item });
      }

      if (type === 'trade') {
        const { tradeId, tradeNote = '' } = req.body || {};
        if (!tradeId) return json(res, 400, { ok: false, error: 'trade_id_required' });
        const item = await updateTradeNote(tradeId, tradeNote);
        return json(res, 200, { ok: true, item });
      }

      return json(res, 400, { ok: false, error: 'invalid_note_type' });
    }

    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'server_error' });
  }
}
