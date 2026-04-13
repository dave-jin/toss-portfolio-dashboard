const SESSION_AUTH_KEY = 'rich-dad-dashboard-authenticated';

const state = { latest: null, context: null, history: null, auth: { needsPasswordChange: true } };

const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => [...document.querySelectorAll(sel)];
const won = (v) => `${Math.round(Number(v || 0)).toLocaleString('ko-KR')}원`;
const pct = (v) => `${(Number(v || 0) * 100).toFixed(2)}%`;
const signedWon = (v) => `${Number(v || 0) > 0 ? '+' : ''}${Math.round(Number(v || 0)).toLocaleString('ko-KR')}원`;
const signedPct = (v) => `${Number(v || 0) > 0 ? '+' : ''}${(Number(v || 0) * 100).toFixed(2)}%`;
const dateText = (v) => (v || '').replace('T', ' ').slice(0, 16);

async function passwordApi(method, body) {
  const res = await fetch('/api/auth/password', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function visibleError(message, fallback) {
  return message || fallback;
}

function setSessionAuth(ok) {
  sessionStorage.setItem(SESSION_AUTH_KEY, ok ? 'true' : 'false');
}
function isSessionAuthed() { return sessionStorage.getItem(SESSION_AUTH_KEY) === 'true'; }

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function sparkline(values, positive = true) {
  const points = values.filter(v => Number.isFinite(v)).map(Number);
  if (points.length < 2) return '<div class="muted">히스토리 데이터가 아직 충분하지 않아.</div>';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const width = 420;
  const height = 100;
  const range = max - min || 1;
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * (width - 20) + 10;
    const y = height - (((v - min) / range) * (height - 20) + 10);
    return `${x},${y}`;
  }).join(' ');
  const stroke = positive ? '#79ecab' : '#ff9a9a';
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="none">
    <defs>
      <linearGradient id="fill-${stroke.replace('#','')}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.32"></stop>
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <polyline fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${coords}"></polyline>
  </svg>`;
}

function historyForSymbol(symbol) {
  return (state.history || []).map(item => {
    const position = (item.positions || []).find(p => p.symbol === symbol);
    return position ? { date: item.date, market_value: Number(position.market_value || 0), current_price: Number(position.current_price || 0) } : null;
  }).filter(Boolean);
}

function nearestTrigger(playbook, position) {
  const plan = playbook?.sell_plan || {};
  const cp = Number(position.current_price || 0);
  if (plan.target_1?.price_krw && cp) {
    const gap = ((plan.target_1.price_krw - cp) / cp) * 100;
    return gap > 0 ? `1차 목표까지 약 ${gap.toFixed(1)}% 남음` : `1차 목표 구간 진입`;
  }
  if (plan.target_1?.price_usd && position.current_price_usd) {
    const cpUsd = Number(position.current_price_usd);
    const gap = ((plan.target_1.price_usd - cpUsd) / cpUsd) * 100;
    return gap > 0 ? `1차 목표까지 약 ${gap.toFixed(1)}% 남음` : `1차 목표 구간 진입`;
  }
  return playbook?.next_best_action || '핵심 논거 유지 여부를 먼저 점검';
}

function actionCards() {
  const latest = state.latest;
  const ctx = state.context;
  const cards = [
    {
      kicker: '핵심 행동',
      title: latest.next_actions?.[0] || '핵심 행동 정의 필요',
      body: '오늘 해야 할 가장 작은 단위의 실행이야. 아이디어 추가보다 구조 정리에 가깝게 봐.'
    },
    {
      kicker: '레드팀 넛지',
      title: ctx.red_team_protocol?.[0] || '그 논거가 지금도 유효한가?',
      body: '좋은 수익은 확신을 강화하지만, 구조를 흔드는 건 오히려 확신이 커진 순간이야.'
    },
    {
      kicker: '오늘의 관찰',
      title: latest.cautions?.[0] || '현재 큰 경고 신호는 제한적이야',
      body: latest.advice?.[0] || '총자산보다 구조와 리스크 분산부터 본다.'
    }
  ];
  qs('#action-grid').innerHTML = cards.map(card => `
    <article class="action-card">
      <div class="kicker">${card.kicker}</div>
      <div class="title">${card.title}</div>
      <div class="body">${card.body}</div>
    </article>
  `).join('');
}

function renderHeadline() {
  const { latest, context } = state;
  const metrics = [
    { label: '총자산', value: won(latest.headline.total_asset), sub: `국내 ${won(latest.headline.kr_total)} / 미국 ${won(latest.headline.us_total)}` },
    { label: '평가손익', value: signedWon(latest.headline.profit), sub: signedPct(latest.headline.profit_rate), tone: latest.headline.profit >= 0 ? 'good' : 'bad' },
    { label: '오늘의 현금 여력', value: `${won(latest.metrics.cash_krw)} · $${Number(latest.metrics.cash_usd || 0).toFixed(2)}`, sub: '유동성 절대 훼손 금지 원칙 확인' },
    { label: '집중도', value: `${(latest.metrics.top3_weight * 100).toFixed(1)}%`, sub: `비중 1위 ${latest.metrics.top1?.name || '-'} ${(latest.metrics.top1?.weight * 100 || 0).toFixed(1)}%` }
  ];
  qs('#headline-grid').innerHTML = metrics.map(m => `
    <article class="metric-card ${m.tone || ''}">
      <div>
        <div class="label">${m.label}</div>
        <div class="value">${m.value}</div>
      </div>
      <div class="sub">${m.sub}</div>
    </article>
  `).join('');
  qs('#hero-subtitle').textContent = `생성 시각 ${dateText(latest.generated_at)} · ${context.project.goal} · 브리핑 기준으로 다음 행동을 바로 정리해둔 상태야.`;
  qs('#project-goal').textContent = context.project.goal;
  qs('#dashboard-link').href = '#positions';
}

function renderLists() {
  const { latest, context } = state;
  qs('#red-team-list').innerHTML = context.red_team_protocol.map(item => `<li>${item}</li>`).join('');
  qs('#watchpoint-list').innerHTML = [...context.current_watchpoints, ...(latest.cautions || [])].map(item => `<li>${item}</li>`).join('');
  qs('#principles-list').innerHTML = context.investor_profile.principles.map(item => `<li>${item}</li>`).join('');
  qs('#sell-checklist').innerHTML = context.sell_checklist.map(item => `<li>${item}</li>`).join('');
}

function renderPositions() {
  const { latest, context } = state;
  const grid = qs('#positions-grid');
  grid.innerHTML = latest.positions.map(position => {
    const key = position.symbol;
    const playbook = context.positions[key] || context.positions[position.name] || null;
    const history = historyForSymbol(key);
    const values = history.map(item => item.market_value || item.current_price || 0);
    const positive = Number(position.unrealized_pnl || 0) >= 0;
    const chart = sparkline(values, positive);
    const triggerSummary = nearestTrigger(playbook, position);
    const why = (playbook?.why_bought || ['매수 논거 정리가 필요해']).map(item => `<li>${item}</li>`).join('');
    const reviews = (playbook?.review_triggers || [playbook?.sell_plan?.stop_review || '핵심 논거 유지 여부 점검']).map(item => `<li>${item}</li>`).join('');
    const buyHistory = (playbook?.buy_history || []).map(item => `<li><strong>${item.date}</strong> · ${item.note}${item.price ? ` / ${won(item.price)}` : ''}</li>`).join('') || '<li>편입 이력 없음</li>';
    const target1 = playbook?.sell_plan?.target_1 ? `${playbook.sell_plan.target_1.price_krw ? won(playbook.sell_plan.target_1.price_krw) : '$' + playbook.sell_plan.target_1.price_usd} · ${playbook.sell_plan.target_1.note}` : (playbook?.sell_plan?.default || '-');
    const target2 = playbook?.sell_plan?.target_2 ? `${playbook.sell_plan.target_2.price_krw ? won(playbook.sell_plan.target_2.price_krw) : '$' + playbook.sell_plan.target_2.price_usd} · ${playbook.sell_plan.target_2.note}` : (playbook?.sell_plan?.long_term || '-');
    const stopReview = playbook?.sell_plan?.stop_review || playbook?.sell_plan?.reentry || '-';
    return `
      <article class="position-card">
        <div class="position-head">
          <div class="position-title">
            <h3>${position.name}</h3>
            <div class="position-role">${playbook?.role || position.market_type}</div>
          </div>
          <div class="badge">다음 판단 · ${triggerSummary}</div>
        </div>
        <div class="position-metrics">
          <div class="mini"><div class="mini-label">평가금액</div><div class="mini-value">${won(position.market_value)}</div></div>
          <div class="mini"><div class="mini-label">평가손익</div><div class="mini-value ${positive ? 'good' : 'bad'}">${signedWon(position.unrealized_pnl)}</div></div>
          <div class="mini"><div class="mini-label">수익률</div><div class="mini-value ${positive ? 'good' : 'bad'}">${signedPct(position.profit_rate)}</div></div>
          <div class="mini"><div class="mini-label">비중</div><div class="mini-value">${((position._weight || 0) * 100).toFixed(1)}%</div></div>
        </div>
        <div class="position-chart">${chart}</div>
        <div class="position-grid-two">
          <div class="info-block">
            <h4>왜 샀는가</h4>
            <ul>${why}</ul>
          </div>
          <div class="info-block">
            <h4>언제 다시 볼 것인가</h4>
            <ul>${reviews}</ul>
          </div>
          <div class="info-block">
            <h4>편입 히스토리</h4>
            <ul>${buyHistory}</ul>
          </div>
          <div class="info-block">
            <h4>지금 해야 할 일</h4>
            <ul><li>${playbook?.next_best_action || latest.next_actions?.[0] || '핵심 논거와 유동성부터 점검'}</li><li>${triggerSummary}</li></ul>
          </div>
        </div>
        <div class="trigger-grid">
          <div class="trigger-box"><div class="trigger-label">1차 재검토</div><div class="trigger-value">${target1}</div></div>
          <div class="trigger-box"><div class="trigger-label">2차 / 장기</div><div class="trigger-value">${target2}</div></div>
          <div class="trigger-box"><div class="trigger-label">중단 / 손절 재검토</div><div class="trigger-value">${stopReview}</div></div>
          <div class="trigger-box"><div class="trigger-label">오늘의 한 줄</div><div class="trigger-value">${triggerSummary}</div></div>
        </div>
      </article>
    `;
  }).join('');
}

function renderTimeline() {
  const timeline = qs('#timeline');
  timeline.innerHTML = state.context.decision_history.slice().reverse().map(item => `
    <article class="timeline-card">
      <div class="timeline-date">${item.date}</div>
      <div>
        <h4>${item.symbol} · ${item.type === 'buy' ? '매수' : '매도'}</h4>
        <p>${item.summary}</p>
        <p class="muted">교훈: ${item.lesson}</p>
      </div>
    </article>
  `).join('');
}

function renderFooter() {
  const latest = state.latest;
  const ctx = state.context;
  qs('#footer-meta').innerHTML = `
    <div>마지막 생성 시각: ${dateText(latest.generated_at)}</div>
    <div>운영 모델: ${ctx.investor_profile.style}</div>
    <div>거시경제 분석 원칙: ${ctx.investor_profile.principles[0]} / ${ctx.macro_rule || ctx.investor_profile.macro_rule}</div>
    <div>경고: 이 대시보드는 투자 자문이 아니라, 원칙·히스토리·현재 포지션을 함께 보는 운영 도구야.</div>
  `;
}

function openForceResetIfNeeded() {
  if (state.auth.needsPasswordChange) show(qs('#password-reset-modal'));
}

function mountApp() {
  hide(qs('#auth-overlay'));
  hide(qs('#password-reset-modal'));
  show(qs('#app'));
  renderHeadline();
  actionCards();
  renderLists();
  renderPositions();
  renderTimeline();
  renderFooter();
  openForceResetIfNeeded();
}

async function loadData() {
  const [latest, context, history, auth] = await Promise.all([
    fetch('/data/latest.json', { cache: 'no-store' }).then(r => r.json()),
    fetch('/data/investment_context.json', { cache: 'no-store' }).then(r => r.json()),
    fetch('/data/history.json', { cache: 'no-store' }).then(r => r.json()),
    passwordApi('GET')
  ]);
  state.latest = latest;
  state.context = context;
  state.history = history;
  state.auth = auth || { needsPasswordChange: true };
}

function bindAuth() {
  qs('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = qs('#password-input').value;
    const result = await passwordApi('POST', { password: input });
    if (!result.ok || !result.authenticated) {
      qs('#login-error').textContent = visibleError(result.error, '비밀번호가 맞지 않거나 서버 설정이 아직 안 끝났어.');
      return;
    }
    qs('#login-error').textContent = '';
    state.auth.needsPasswordChange = !!result.needsPasswordChange;
    setSessionAuth(true);
    mountApp();
  });

  qs('#force-reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = qs('#force-new-password').value;
    const b = qs('#force-confirm-password').value;
    if (a.length < 4) {
      qs('#force-reset-error').textContent = '비밀번호는 최소 4자 이상으로 설정해줘.';
      return;
    }
    if (a !== b) {
      qs('#force-reset-error').textContent = '새 비밀번호가 서로 달라.';
      return;
    }
    const result = await passwordApi('PATCH', { currentPassword: '12345', nextPassword: a });
    if (!result.ok) {
      qs('#force-reset-error').textContent = visibleError(result.error, '비밀번호 저장에 실패했어. Supabase 설정을 먼저 확인해야 해.');
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
      qs('#settings-error').textContent = '새 비밀번호는 최소 4자 이상이어야 해.';
      qs('#settings-success').textContent = '';
      return;
    }
    if (next !== confirm) {
      qs('#settings-error').textContent = '새 비밀번호와 확인값이 달라.';
      qs('#settings-success').textContent = '';
      return;
    }
    const result = await passwordApi('PATCH', { currentPassword: current, nextPassword: next });
    if (!result.ok) {
      qs('#settings-error').textContent = visibleError(result.error, '현재 비밀번호가 틀렸거나 Supabase 연결이 아직 완료되지 않았어.');
      qs('#settings-success').textContent = '';
      return;
    }
    state.auth.needsPasswordChange = false;
    qs('#settings-error').textContent = '';
    qs('#settings-success').textContent = '비밀번호를 변경했어.';
    qsa('#settings-form input').forEach(el => el.value = '');
  });
}

(async function init() {
  bindAuth();
  await loadData();
  if (state.auth?.ok === false) {
    show(qs('#auth-overlay'));
    qs('#login-error').textContent = visibleError(state.auth.error, 'Supabase 인증 상태를 불러오지 못했어.');
    return;
  }
  if (isSessionAuthed()) {
    mountApp();
  } else {
    show(qs('#auth-overlay'));
  }
})();
