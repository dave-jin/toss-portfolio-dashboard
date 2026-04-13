import { createJournalEntry, deleteJournalEntry, fetchJournalEntries, updateJournalEntry } from '../../lib/supabase.js';
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
      return json(res, 200, { ok: true, items: await fetchJournalEntries() });
    }

    if (req.method === 'POST') {
      const { entryDate, title, body, tags = [], relatedSymbols = [], mood = '' } = req.body || {};
      if (!title || !body) return json(res, 400, { ok: false, error: 'title_and_body_required' });
      const item = await createJournalEntry({
        entry_date: entryDate || new Date().toISOString().slice(0, 10),
        title,
        body,
        tags,
        related_symbols: relatedSymbols,
        mood,
      });
      return json(res, 200, { ok: true, item });
    }

    if (req.method === 'PATCH') {
      const { id, entryDate, title, body, tags = [], relatedSymbols = [], mood = '' } = req.body || {};
      if (!id) return json(res, 400, { ok: false, error: 'id_required' });
      const item = await updateJournalEntry(id, {
        entry_date: entryDate,
        title,
        body,
        tags,
        related_symbols: relatedSymbols,
        mood,
      });
      return json(res, 200, { ok: true, item });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return json(res, 400, { ok: false, error: 'id_required' });
      await deleteJournalEntry(id);
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'server_error' });
  }
}
