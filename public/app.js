const SESSION_AUTH_KEY = 'rich-dad-dashboard-authenticated';

const state = {
  auth: { needsPasswordChange: true },
  latest: null,
  history: [],
  news: [],
  project: {},
  investorProfile: {},
  redTeamProtocol: [],
  sellChecklist: [],
  currentWatchpoints: [],
  assetProfiles: {},
  trades: [],
  journals: [],
  appTabs: [],
  assetTabOptions: [],
  ui: {
    activeTab: sessionStorage.getItem('dashboard-active-tab') || 'judgment',
    selectedSymbol: null,
    koreanChartCache: {},
  },
  koreanStockCache: {},
};

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => [...document.querySelectorAll(sel)];
const won = (v) => `${Math.round(Number(v || 0)).toLocaleString('ko-KR')}원`;
const signedWon = (v) => `${Number(v || 0) > 0 ? '+' : ''}${Math.round(Number(v || 0)).toLocaleString('ko-KR')}원`;
const pct = (v) => `${(Number(v || 0) * 100).toFixed(2)}%`;
const signedPct = (v) => `${Number(v || 0) > 0 ? '+' : ''}${(Number(v || 0) * 100).toFixed(2)}%`;
const dateText = (v) => (v || '').replace('T', ' ').slice(0, 16);
const isoDate = (v) => (v || '').slice(0, 10);
const snapshotLabel = (v) => {
  const text = dateText(v);
  if (!text) return '-';
  return text.length > 10 ? text.slice(5, 16) : text;
};
const escapeHtml = (v='') => String(v)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

async function jsonRequest(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `request_failed_${res.status}`);
  return payload;
}

async function passwordApi(method, body) {
  const res = await fetch('/api/auth/password', {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function setSessionAuth(ok) {
  sessionStorage.setItem(SESSION_AUTH_KEY, ok ? 'true' : 'false');
}
function isSessionAuthed() {
  return sessionStorage.getItem(SESSION_AUTH_KEY) === 'true';
}
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function visibleError(message, fallback) { return message || fallback; }

function splitLines(value) {
  return String(value || '').split('\n').map(item => item.trim()).filter(Boolean);
}

function joinLines(list) {
  return (list || []).filter(Boolean).join('\n');
}

function parseCommaList(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function getLatestPositions() {
  return (state.latest?.positions || []).slice().sort((a, b) => Number(b.market_value || 0) - Number(a.market_value || 0));
}

function getProfile(symbol) {
  return state.assetProfiles?.[symbol] || null;
}

function getSelectedPosition() {
  const positions = getLatestPositions();
  return positions.find(item => item.symbol === state.ui.selectedSymbol) || positions[0] || null;
}

function getTradesForSymbol(symbol) {
  return (state.trades || []).filter(item => item.symbol === symbol).sort((a, b) => String(b.submitted_at || b.order_date).localeCompare(String(a.submitted_at || a.order_date)));
}

function getPortfolioSeries() {
  return (state.history || []).map((item) => ({
    label: snapshotLabel(item.date),
    value: Number(item.summary?.total_asset || item.positions?.reduce((sum, pos) => sum + Number(pos.market_value || 0), 0) || 0),
  })).filter(item => Number.isFinite(item.value) && item.value > 0);
}

function getAssetSeries(symbol) {
  return (state.history || []).map((item) => {
    const found = (item.positions || []).find((pos) => pos.symbol === symbol);
    return found ? {
      label: snapshotLabel(item.date),
      value: Number(found.market_value || found.current_price || 0),
    } : null;
  }).filter(Boolean).filter(item => Number.isFinite(item.value) && item.value > 0);
}

function getNewsBySymbol() {
  const grouped = {};
  for (const item of (state.news || [])) {
    if (!grouped[item.symbol]) grouped[item.symbol] = [];
    grouped[item.symbol].push(item);
  }
  return grouped;
}

function toPath(series, width, height, padding) {
  if (!series.length) return { line: '', fill: '', points: [] };
  const values = series.map(item => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = series.map((item, idx) => {
    const x = padding + ((width - padding * 2) * idx) / Math.max(series.length - 1, 1);
    const y = height - padding - (((item.value - min) / range) * (height - padding * 2));
    return { x, y, value: item.value, label: item.label };
  });
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const fill = `${line} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
  return { line, fill, points, min, max };
}

function renderLineChart(el, series, { stroke = '#78a8ff', fill = '#78a8ff', title = '' } = {}) {
  if (!el) return;
  if (!series.length) {
    el.innerHTML = '<div class="chart-empty">표시할 히스토리 데이터가 아직 충분하지 않아요.</div>';
    return;
  }
  const width = 720;
  const height = 280;
  const padding = 26;
  const { line, fill: fillPath, points, min, max } = toPath(series, width, height, padding);
  const labels = [series[0], series[Math.floor(series.length / 2)], series[series.length - 1]];
  const yTop = max;
  const yBottom = min;
  el.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="${escapeHtml(title)}">
      <defs>
        <linearGradient id="grad-${stroke.replace('#', '')}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${fill}" stop-opacity="0.45"></stop>
          <stop offset="100%" stop-color="${fill}" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="rgba(159,177,209,0.25)" stroke-width="1"></line>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(159,177,209,0.25)" stroke-width="1"></line>
      <path class="chart-fill" d="${fillPath}" fill="url(#grad-${stroke.replace('#', '')})"></path>
      <path class="chart-line" d="${line}" stroke="${stroke}"></path>
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="${stroke}"><title>${escapeHtml(point.label)} · ${Math.round(point.value).toLocaleString('ko-KR')}</title></circle>`).join('')}
      <text class="chart-label" x="${padding}" y="${padding - 8}">${Math.round(yTop).toLocaleString('ko-KR')}</text>
      <text class="chart-label" x="${padding}" y="${height - padding + 18}">${Math.round(yBottom).toLocaleString('ko-KR')}</text>
      ${labels.map((item, idx) => {
        const x = padding + ((width - padding * 2) * idx) / Math.max(labels.length - 1, 1);
        return `<text class="chart-label" x="${x}" y="${height - 6}" text-anchor="middle">${escapeHtml(item.label)}</text>`;
      }).join('')}
    </svg>
  `;
}

function renderAllocation(el) {
  const positions = getLatestPositions();
  if (!el) return;
  const total = positions.reduce((sum, item) => sum + Number(item.market_value || 0), 0);
  if (!positions.length || !total) {
    el.innerHTML = '<div class="chart-empty">비중 데이터를 불러오지 못했어요.</div>';
    return;
  }
  const palette = ['#78a8ff', '#9d7cff', '#74f3a4', '#f7d56f', '#ff9a9a', '#61d9f5', '#f5a361'];
  const bars = positions.map((item, idx) => {
    const ratio = Number(item.market_value || 0) / total;
    return `
      <div class="mini-card">
        <div class="mini-card-label">${escapeHtml(item.name)}</div>
        <div class="mini-card-value">${(ratio * 100).toFixed(1)}%</div>
        <div style="height:10px;border-radius:999px;background:rgba(255,255,255,0.06);overflow:hidden;margin-top:10px;">
          <div style="width:${ratio * 100}%;height:100%;background:${palette[idx % palette.length]};"></div>
        </div>
        <div class="trade-meta">${won(item.market_value)}</div>
      </div>
    `;
  }).join('');
  el.innerHTML = `<div class="mini-grid">${bars}</div>`;
}

function renderHeadline() {
  const latest = state.latest || {};
  const headline = latest.headline || {};
  const metrics = latest.metrics || {};
  const top1 = metrics.top1 || null;
  const cards = [
    { label: '총자산', value: won(headline.total_asset), sub: `국내 ${won(headline.kr_total)} / 미국 ${won(headline.us_total)}` },
    { label: '평가손익', value: signedWon(headline.profit), sub: signedPct(headline.profit_rate), tone: Number(headline.profit || 0) >= 0 ? 'good' : 'bad' },
    { label: '현금 여력', value: `${won(metrics.cash_krw)} · $${Number(metrics.cash_usd || 0).toFixed(2)}`, sub: '유동성 원칙을 먼저 확인해요.' },
    { label: '집중도', value: `${Number(metrics.top3_weight || 0) * 100 > 0 ? (Number(metrics.top3_weight || 0) * 100).toFixed(1) : '0.0'}%`, sub: top1 ? `비중 1위 ${top1.name} ${(Number(top1.weight || 0) * 100).toFixed(1)}%` : '핵심 종목 없음' },
  ];
  qs('#headline-grid').innerHTML = cards.map((item) => `
    <article class="metric-card ${item.tone || ''}">
      <div>
        <div class="label">${item.label}</div>
        <div class="value">${item.value}</div>
      </div>
      <div class="sub">${item.sub}</div>
    </article>
  `).join('');
  qs('#hero-subtitle').textContent = `생성 시각 ${dateText(latest.generated_at)} · ${state.project.goal || ''} · 판단 / 기록 / 메모를 분리해 한 번에 운영할 수 있게 정리했어요.`;
  qs('#project-goal').textContent = state.project.goal || '-';
}

function renderActions() {
  const advice = state.latest?.advice || [];
  const cautions = state.latest?.cautions || [];
  const nextActions = state.latest?.next_actions || [];
  const cards = [
    { kicker: '핵심 행동', title: nextActions[0] || '오늘의 우선 행동을 아직 만들지 못했어요.', body: '수익률보다 지금 가장 작은 실행 단위를 먼저 적어요.' },
    { kicker: '판단 메모', title: advice[0] || '오늘의 핵심 해석을 불러오는 중이에요.', body: advice[1] || '다음 행동은 항상 포트폴리오 구조를 함께 봐야 해요.' },
    { kicker: '주의할 점', title: cautions[0] || '지금 큰 경고 신호는 제한적이에요.', body: cautions[1] || '판단 전에 레드팀 질문을 같이 확인해줘요.' },
  ];
  qs('#action-grid').innerHTML = cards.map((card) => `
    <article class="action-card panel glass">
      <div class="eyebrow">${card.kicker}</div>
      <div class="title">${card.title}</div>
      <div class="body">${card.body}</div>
    </article>
  `).join('');
}

function renderLists() {
  qs('#red-team-list').innerHTML = (state.redTeamProtocol || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  qs('#watchpoint-list').innerHTML = (state.currentWatchpoints || []).concat(state.latest?.cautions || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  qs('#principles-list').innerHTML = (state.investorProfile?.principles || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  qs('#sell-checklist').innerHTML = (state.sellChecklist || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderRecentTrades() {
  const el = qs('#recent-trades');
  const trades = (state.trades || []).slice(0, 8);
  if (!trades.length) {
    el.innerHTML = '<div class="chart-empty">최근 주문 히스토리를 아직 불러오지 못했어요.</div>';
    return;
  }
  el.innerHTML = trades.map(renderTradeCard).join('');
}

function renderTradeCard(trade) {
  const sideClass = trade.side === 'buy' ? 'buy' : trade.side === 'sell' ? 'sell' : 'neutral';
  const sideLabel = trade.side === 'buy' ? '매수' : trade.side === 'sell' ? '매도' : trade.side;
  const qty = Number(trade.filled_quantity || trade.quantity || 0);
  const price = Number(trade.average_execution_price || trade.price || 0);
  return `
    <article class="trade-card">
      <div class="trade-card-head">
        <div>
          <h4>${escapeHtml(trade.display_name || trade.name || trade.symbol)}</h4>
          <div class="trade-meta">${escapeHtml(trade.order_date || '')} · ${escapeHtml(trade.status || '')}</div>
        </div>
        <div class="trade-side ${sideClass}">${sideLabel}</div>
      </div>
      <div class="trade-stats">
        <div class="trade-stat"><div class="trade-stat-label">수량</div><div class="trade-stat-value">${qty || '-'}</div></div>
        <div class="trade-stat"><div class="trade-stat-label">체결가</div><div class="trade-stat-value">${price ? won(price) : '-'}</div></div>
        <div class="trade-stat"><div class="trade-stat-label">시장</div><div class="trade-stat-value">${escapeHtml(trade.market || '-')}</div></div>
        <div class="trade-stat"><div class="trade-stat-label">메모</div><div class="trade-stat-value">${trade.trade_note ? '저장됨' : '없음'}</div></div>
      </div>
      ${trade.trade_note ? `<div class="journal-body">${escapeHtml(trade.trade_note)}</div>` : ''}
    </article>
  `;
}

function renderJournalList() {
  const el = qs('#journal-list');
  const journals = state.journals || [];
  if (!journals.length) {
    el.innerHTML = '<div class="chart-empty">아직 투자일기가 없어요. 오늘의 판단을 짧게라도 남겨줘요.</div>';
    return;
  }
  el.innerHTML = journals.map((item) => {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const symbols = Array.isArray(item.related_symbols) ? item.related_symbols : [];
    return `
      <article class="journal-item">
        <div class="journal-head">
          <div>
            <h4>${escapeHtml(item.title)}</h4>
            <div class="trade-meta">${escapeHtml(item.entry_date)}${item.mood ? ` · ${escapeHtml(item.mood)}` : ''}</div>
          </div>
          <div class="form-actions">
            <button class="btn ghost journal-edit-btn" type="button" data-id="${item.id}">수정</button>
            <button class="btn ghost journal-delete-btn" type="button" data-id="${item.id}">삭제</button>
          </div>
        </div>
        <div class="journal-tags">
          ${tags.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}
          ${symbols.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
        <div class="journal-body">${escapeHtml(item.body)}</div>
      </article>
    `;
  }).join('');
}

function renderTabs() {
  const validKeys = (state.appTabs || []).map((tab) => tab.key);
  if (!validKeys.includes(state.ui.activeTab)) {
    state.ui.activeTab = validKeys[0] || 'judgment';
    sessionStorage.setItem('dashboard-active-tab', state.ui.activeTab);
  }
  qs('#dashboard-tabs').innerHTML = (state.appTabs || []).map((tab) => `
    <button class="tab-btn ${state.ui.activeTab === tab.key ? 'active' : ''}" type="button" data-tab="${tab.key}">${escapeHtml(tab.label)}</button>
  `).join('');
  qsa('.tab-panel').forEach((panel) => {
    const key = panel.id.replace('tab-', '');
    panel.classList.toggle('hidden', key !== state.ui.activeTab);
  });
}

function selectSymbol(symbol) {
  state.ui.selectedSymbol = symbol;
  renderNotesTab();
}

function renderSymbolList() {
  const el = qs('#symbol-chip-list');
  const positions = getLatestPositions();
  el.innerHTML = positions.map((item) => {
    const profile = getProfile(item.symbol) || {};
    const active = state.ui.selectedSymbol === item.symbol;
    return `
      <button class="symbol-chip ${active ? 'active' : ''}" type="button" data-symbol="${item.symbol}">
        <div class="top"><span>${escapeHtml(item.name)}</span><span>${((Number(item.market_value || 0) / Math.max(1, positions.reduce((sum, pos) => sum + Number(pos.market_value || 0), 0))) * 100).toFixed(1)}%</span></div>
        <div class="bottom">${escapeHtml(profile.role || profile.tab_key || item.market_type || '')}</div>
      </button>
    `;
  }).join('');
}

async function renderSelectedAssetChart(position) {
  const chartEl = qs('#selected-asset-chart');
  if (!position) {
    chartEl.innerHTML = '<div class="chart-empty">종목을 선택해줘요.</div>';
    return;
  }

  if (position.market_type === 'KR_STOCK') {
    const payload = state.koreanStockCache?.[position.symbol] || state.koreanStockCache?.[`${position.symbol}:${position.market_code || 'KSP'}`];
    if (payload?.series?.length) {
      const series = payload.series.map((item) => ({ label: item.base_date, value: Number(item.close_price || 0) })).filter(item => item.value > 0);
      renderLineChart(chartEl, series, { stroke: '#74f3a4', fill: '#74f3a4', title: position.name });
      chartEl.insertAdjacentHTML('beforeend', `<div class="krx-footnote">KRX 공식 데이터 기준 / 투자 조언 아님</div>`);
      return;
    }
  }

  renderLineChart(chartEl, getAssetSeries(position.symbol), { stroke: '#9d7cff', fill: '#9d7cff', title: position.name });
}

function renderSelectedAssetMetrics(position, profile) {
  const el = qs('#selected-asset-metrics');
  if (!position) {
    el.innerHTML = '';
    return;
  }
  const cards = [
    { label: '평가금액', value: won(position.market_value) },
    { label: '평가손익', value: signedWon(position.unrealized_pnl), tone: Number(position.unrealized_pnl || 0) >= 0 ? 'good' : 'bad' },
    { label: '수익률', value: signedPct(position.profit_rate), tone: Number(position.profit_rate || 0) >= 0 ? 'good' : 'bad' },
    { label: '다음 행동', value: profile?.next_best_action || '메모를 입력해줘요.' },
  ];
  el.innerHTML = cards.map((item) => `
    <div class="mini-card ${item.tone || ''}">
      <div class="mini-card-label">${item.label}</div>
      <div class="mini-card-value">${item.value}</div>
    </div>
  `).join('');
}

function fillAssetForm(position, profile) {
  qs('#asset-symbol').value = position?.symbol || '';
  qs('#asset-display-name').value = profile?.display_name || position?.name || '';
  qs('#asset-role').value = profile?.role || '';
  qs('#asset-why-bought').value = joinLines(profile?.why_bought || []);
  qs('#asset-why-sold').value = profile?.why_sold || '';
  qs('#asset-review-triggers').value = joinLines(profile?.review_triggers || []);
  qs('#asset-next-action').value = profile?.next_best_action || '';
  qs('#asset-memo').value = profile?.memo || '';
  qs('#asset-tab-key').value = profile?.tab_key || 'watchlist';
}

function renderTradeListForSelected(symbol) {
  const el = qs('#selected-trade-list');
  const trades = getTradesForSymbol(symbol);
  if (!trades.length) {
    el.innerHTML = '<div class="chart-empty">이 종목의 매수/매도 히스토리가 아직 없어요.</div>';
    return;
  }
  el.innerHTML = trades.map((trade) => `
    <article class="trade-card">
      <div class="trade-card-head">
        <div>
          <h4>${escapeHtml(trade.order_date || trade.submitted_at || '')}</h4>
          <div class="trade-meta">${escapeHtml(trade.status || '')} · ${trade.side === 'buy' ? '매수' : trade.side === 'sell' ? '매도' : escapeHtml(trade.side || '-')}</div>
        </div>
        <div class="trade-side ${trade.side === 'buy' ? 'buy' : trade.side === 'sell' ? 'sell' : 'neutral'}">${trade.side === 'buy' ? '매수' : trade.side === 'sell' ? '매도' : escapeHtml(trade.side || '-')}</div>
      </div>
      <div class="trade-stats">
        <div class="trade-stat"><div class="trade-stat-label">수량</div><div class="trade-stat-value">${Number(trade.filled_quantity || trade.quantity || 0) || '-'}</div></div>
        <div class="trade-stat"><div class="trade-stat-label">체결가</div><div class="trade-stat-value">${Number(trade.average_execution_price || trade.price || 0) ? won(trade.average_execution_price || trade.price) : '-'}</div></div>
        <div class="trade-stat"><div class="trade-stat-label">상태</div><div class="trade-stat-value">${escapeHtml(trade.status || '-')}</div></div>
        <div class="trade-stat"><div class="trade-stat-label">종류</div><div class="trade-stat-value">${trade.side === 'buy' ? '매수' : trade.side === 'sell' ? '매도' : '-'}</div></div>
      </div>
      <div class="trade-note-box">
        <textarea class="input textarea small trade-note-input" data-trade-id="${trade.trade_id}" placeholder="왜 샀는지 / 왜 팔았는지 메모를 남겨줘요.">${escapeHtml(trade.trade_note || '')}</textarea>
        <div class="form-actions">
          <button class="btn ghost save-trade-note-btn" type="button" data-trade-id="${trade.trade_id}">거래 메모 저장</button>
        </div>
      </div>
    </article>
  `).join('');
}

async function renderNotesTab() {
  const position = getSelectedPosition();
  if (!position) return;
  const profile = getProfile(position.symbol) || {};
  renderSymbolList();
  qs('#selected-asset-title').textContent = position.name;
  qs('#selected-asset-badge').textContent = profile.tab_key || position.market_type || '-';
  renderSelectedAssetMetrics(position, profile);
  fillAssetForm(position, profile);
  renderTradeListForSelected(position.symbol);
  await renderSelectedAssetChart(position);
}

function renderFooter() {
  qs('#footer-meta').innerHTML = `
    <div>마지막 생성 시각: ${escapeHtml(dateText(state.latest?.generated_at || ''))}</div>
    <div>운영 스타일: ${escapeHtml(state.investorProfile?.style || '-')}</div>
    <div>거시 원칙: ${escapeHtml(state.investorProfile?.macro_rule || '-')}</div>
    <div>기록 원칙: 메모와 뉴스, 스냅샷은 모두 DB 기준으로 불러오고 판단/투자일기/뉴스 흐름으로 운영해요.</div>
  `;
}

function renderNewsTab() {
  const summaryEl = qs('#news-summary');
  const listEl = qs('#news-list');
  const emptyEl = qs('#news-empty');
  if (!summaryEl || !listEl || !emptyEl) return;

  const positions = getLatestPositions();
  const grouped = getNewsBySymbol();
  const cards = positions.map((position) => {
    const items = (grouped[position.symbol] || []).slice(0, 4);
    return {
      symbol: position.symbol,
      name: position.name,
      count: items.length,
      items,
    };
  }).filter((item) => item.count > 0);

  if (!cards.length) {
    summaryEl.innerHTML = '';
    listEl.innerHTML = '';
    show(emptyEl);
    return;
  }

  hide(emptyEl);
  const totalNews = cards.reduce((sum, item) => sum + item.count, 0);
  summaryEl.innerHTML = `
    <article class="panel glass news-summary-card">
      <div class="panel-topline">
        <div>
          <div class="eyebrow">News Snapshot</div>
          <h3>보유 종목 뉴스 요약</h3>
        </div>
        <div class="badge">${cards.length}개 종목 · ${totalNews}개 기사</div>
      </div>
      <div class="journal-body">현재 보유 종목 기준으로 최근 뉴스만 추려서 정리해뒀어요. 아침 리포트도 이 내용을 참고해서 보낼 수 있게 연결해둘께요.</div>
    </article>
  `;

  listEl.innerHTML = cards.map((card) => `
    <article class="panel glass news-group">
      <div class="panel-topline">
        <div>
          <div class="eyebrow">${escapeHtml(card.symbol)}</div>
          <h3>${escapeHtml(card.name)}</h3>
        </div>
        <div class="badge">최근 ${card.count}건</div>
      </div>
      <div class="news-items">
        ${card.items.map((item) => `
          <a class="news-item" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noreferrer noopener">
            <div class="news-item-head">
              <strong>${escapeHtml(item.title || '제목 없음')}</strong>
              <span>${escapeHtml(dateText(item.published_at || item.updated_at || ''))}</span>
            </div>
            <div class="journal-body">${escapeHtml(item.summary || '요약을 아직 만들지 못했어요.')}</div>
            <div class="trade-meta">${escapeHtml(item.source || 'news')}</div>
          </a>
        `).join('')}
      </div>
    </article>
  `).join('');
}

function renderJudgmentTab() {
  renderActions();
  renderLists();
  renderRecentTrades();
  renderLineChart(qs('#portfolio-trend-chart'), getPortfolioSeries(), { stroke: '#78a8ff', fill: '#78a8ff', title: '포트폴리오 추이' });
  renderAllocation(qs('#allocation-chart'));
}

function renderAll() {
  renderTabs();
  renderHeadline();
  renderJudgmentTab();
  renderJournalList();
  renderFooter();
  renderNotesTab();
  renderNewsTab();
}

async function loadDashboard() {
  const payload = await jsonRequest('/api/dashboard/bootstrap');
  Object.assign(state, {
    latest: payload.latest,
    history: payload.history || [],
    project: payload.project || {},
    investorProfile: payload.investorProfile || {},
    redTeamProtocol: payload.redTeamProtocol || [],
    sellChecklist: payload.sellChecklist || [],
    currentWatchpoints: payload.currentWatchpoints || [],
    assetProfiles: payload.assetProfiles || {},
    trades: payload.trades || [],
    journals: payload.journals || [],
    news: payload.news || [],
    koreanStockCache: payload.koreanStockCache || {},
    appTabs: payload.appTabs || [],
    assetTabOptions: payload.assetTabOptions || [],
  });
  const positions = getLatestPositions();
  if (!state.ui.selectedSymbol || !positions.find(item => item.symbol === state.ui.selectedSymbol)) {
    state.ui.selectedSymbol = positions[0]?.symbol || null;
  }
  buildAssetTabOptions();
}

function buildAssetTabOptions() {
  qs('#asset-tab-key').innerHTML = (state.assetTabOptions || []).map((item) => `<option value="${item.key}">${item.label}</option>`).join('');
}

function mountApp() {
  hide(qs('#auth-overlay'));
  show(qs('#app'));
  renderAll();
  if (state.auth.needsPasswordChange) show(qs('#password-reset-modal'));
}

async function refreshDashboard() {
  try {
    await loadDashboard();
    renderAll();
  } catch (error) {
    qs('#login-error').textContent = visibleError(error.message, '대시보드를 새로고침하지 못했어요.');
  }
}

function hydrateJournalForm(item = null) {
  qs('#journal-id').value = item?.id || '';
  qs('#journal-date').value = item?.entry_date || new Date().toISOString().slice(0, 10);
  qs('#journal-mood').value = item?.mood || '';
  qs('#journal-title').value = item?.title || '';
  qs('#journal-tags').value = (item?.tags || []).join(', ');
  qs('#journal-symbols').value = (item?.related_symbols || []).join(', ');
  qs('#journal-body').value = item?.body || '';
}

function bindTabs() {
  qs('#dashboard-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    state.ui.activeTab = button.dataset.tab;
    sessionStorage.setItem('dashboard-active-tab', state.ui.activeTab);
    renderTabs();
  });
}

function bindJournal() {
  qs('#journal-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = qs('#journal-id').value;
    const payload = {
      id: id ? Number(id) : undefined,
      entryDate: qs('#journal-date').value,
      mood: qs('#journal-mood').value,
      title: qs('#journal-title').value.trim(),
      tags: parseCommaList(qs('#journal-tags').value),
      relatedSymbols: parseCommaList(qs('#journal-symbols').value),
      body: qs('#journal-body').value.trim(),
    };
    try {
      if (id) {
        await jsonRequest('/api/dashboard/journal', { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await jsonRequest('/api/dashboard/journal', { method: 'POST', body: JSON.stringify(payload) });
      }
      qs('#journal-form-status').textContent = '투자일기를 저장했어요.';
      hydrateJournalForm();
      await refreshDashboard();
    } catch (error) {
      qs('#journal-form-status').textContent = visibleError(error.message, '투자일기를 저장하지 못했어요.');
    }
  });

  qs('#journal-reset').addEventListener('click', () => {
    hydrateJournalForm();
    qs('#journal-form-status').textContent = '';
  });

  qs('#journal-list').addEventListener('click', async (event) => {
    const editButton = event.target.closest('.journal-edit-btn');
    if (editButton) {
      const item = (state.journals || []).find((journal) => String(journal.id) === editButton.dataset.id);
      hydrateJournalForm(item);
      state.ui.activeTab = 'journal';
      renderTabs();
      return;
    }
    const deleteButton = event.target.closest('.journal-delete-btn');
    if (deleteButton) {
      try {
        await jsonRequest('/api/dashboard/journal', {
          method: 'DELETE',
          body: JSON.stringify({ id: Number(deleteButton.dataset.id) }),
        });
        await refreshDashboard();
      } catch (error) {
        qs('#journal-form-status').textContent = visibleError(error.message, '투자일기를 삭제하지 못했어요.');
      }
    }
  });
}

function bindNotes() {
  qs('#symbol-chip-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-symbol]');
    if (!button) return;
    selectSymbol(button.dataset.symbol);
  });

  qs('#asset-note-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const position = getSelectedPosition();
    const payload = {
      type: 'asset',
      symbol: qs('#asset-symbol').value,
      displayName: qs('#asset-display-name').value.trim(),
      market: position?.market_type || null,
      marketCode: position?.market_code || null,
      tabKey: qs('#asset-tab-key').value,
      role: qs('#asset-role').value.trim(),
      whyBought: splitLines(qs('#asset-why-bought').value),
      whySold: qs('#asset-why-sold').value.trim(),
      reviewTriggers: splitLines(qs('#asset-review-triggers').value),
      nextBestAction: qs('#asset-next-action').value.trim(),
      memo: qs('#asset-memo').value.trim(),
      sellPlan: getProfile(qs('#asset-symbol').value)?.sell_plan || {},
    };
    try {
      await jsonRequest('/api/dashboard/notes', { method: 'PATCH', body: JSON.stringify(payload) });
      qs('#asset-note-status').textContent = '종목노트를 저장했어요.';
      await refreshDashboard();
    } catch (error) {
      qs('#asset-note-status').textContent = visibleError(error.message, '종목노트를 저장하지 못했어요.');
    }
  });

  qs('#selected-trade-list').addEventListener('click', async (event) => {
    const button = event.target.closest('.save-trade-note-btn');
    if (!button) return;
    const textarea = qs(`.trade-note-input[data-trade-id="${button.dataset.tradeId}"]`);
    try {
      await jsonRequest('/api/dashboard/notes', {
        method: 'PATCH',
        body: JSON.stringify({ type: 'trade', tradeId: button.dataset.tradeId, tradeNote: textarea.value.trim() }),
      });
      await refreshDashboard();
    } catch (error) {
      qs('#asset-note-status').textContent = visibleError(error.message, '거래 메모를 저장하지 못했어요.');
    }
  });
}

function bindAuth() {
  qs('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = qs('#password-input').value;
    const result = await passwordApi('POST', { password: input });
    if (!result.ok || !result.authenticated) {
      qs('#login-error').textContent = visibleError(result.error, '비밀번호가 맞지 않거나 서버 설정이 아직 안 끝났어요.');
      return;
    }
    qs('#login-error').textContent = '';
    state.auth.needsPasswordChange = !!result.needsPasswordChange;
    setSessionAuth(true);
    await refreshDashboard();
    mountApp();
  });

  qs('#force-reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = qs('#force-new-password').value;
    const b = qs('#force-confirm-password').value;
    if (a.length < 4) {
      qs('#force-reset-error').textContent = '비밀번호는 최소 4자 이상으로 설정해줘요.';
      return;
    }
    if (a !== b) {
      qs('#force-reset-error').textContent = '새 비밀번호가 서로 달라요.';
      return;
    }
    const result = await passwordApi('PATCH', { currentPassword: '12345', nextPassword: a });
    if (!result.ok) {
      qs('#force-reset-error').textContent = visibleError(result.error, '비밀번호 저장에 실패했어요.');
      return;
    }
    state.auth.needsPasswordChange = false;
    qs('#force-reset-error').textContent = '';
    hide(qs('#password-reset-modal'));
  });

  qs('#open-settings').addEventListener('click', () => {
    show(qs('#settings-modal'));
    qs('#settings-error').textContent = '';
    qs('#settings-success').textContent = '';
  });
  qs('#settings-close').addEventListener('click', () => hide(qs('#settings-modal')));
  qs('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = qs('#current-password').value;
    const next = qs('#new-password').value;
    const confirm = qs('#confirm-password').value;
    if (next.length < 4) {
      qs('#settings-error').textContent = '새 비밀번호는 최소 4자 이상이어야 해요.';
      qs('#settings-success').textContent = '';
      return;
    }
    if (next !== confirm) {
      qs('#settings-error').textContent = '새 비밀번호와 확인값이 달라요.';
      qs('#settings-success').textContent = '';
      return;
    }
    const result = await passwordApi('PATCH', { currentPassword: current, nextPassword: next });
    if (!result.ok) {
      qs('#settings-error').textContent = visibleError(result.error, '현재 비밀번호가 틀렸거나 연결이 아직 완료되지 않았어요.');
      qs('#settings-success').textContent = '';
      return;
    }
    state.auth.needsPasswordChange = false;
    qs('#settings-error').textContent = '';
    qs('#settings-success').textContent = '비밀번호를 변경했어요.';
    qsa('#settings-form input').forEach(el => el.value = '');
  });
}

function bindRefresh() {
  qs('#refresh-dashboard').addEventListener('click', refreshDashboard);
}

(async function init() {
  bindAuth();
  bindTabs();
  bindJournal();
  bindNotes();
  bindRefresh();
  hydrateJournalForm();
  if (isSessionAuthed()) {
    try {
      const auth = await passwordApi('GET');
      state.auth = auth || { needsPasswordChange: true };
      await refreshDashboard();
      mountApp();
      return;
    } catch {
      setSessionAuth(false);
    }
  }
  show(qs('#auth-overlay'));
})();
