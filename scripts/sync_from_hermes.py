#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
import copy
import json
import re
import shutil
import subprocess
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

repo_root = Path.home() / 'projects' / 'toss-portfolio-dashboard'
report_src = Path.home() / '.hermes' / 'reports' / 'toss'
public_dir = repo_root / 'public'
data_dir = public_dir / 'data'
data_dir.mkdir(parents=True, exist_ok=True)


def parse_env(path: Path):
    env = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        env[key.strip()] = value
    return env


def run_json(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout).strip() or f'command failed: {cmd}')
    return json.loads(proc.stdout)


def fetch_json_url(url, timeout=20):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as res:
            return json.loads(res.read().decode())
    except Exception:
        return None


def fetch_text_url(url, timeout=20):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as res:
            return res.read().decode()
    except Exception:
        return None


def clean_html(value):
    text = re.sub(r'<[^>]+>', ' ', value or '')
    return re.sub(r'\s+', ' ', text).strip()


def fetch_google_news(query, limit=3):
    if not query:
        return []
    encoded = urllib.parse.quote(query)
    url = f'https://news.google.com/rss/search?q={encoded}&hl=ko&gl=KR&ceid=KR:ko'
    xml_text = fetch_text_url(url)
    if not xml_text:
        return []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    items = []
    for item in root.findall('./channel/item')[:limit]:
        title = (item.findtext('title') or '').strip()
        link = (item.findtext('link') or '').strip()
        description = clean_html(item.findtext('description') or '')
        source = (item.findtext('source') or 'Google News').strip()
        pub_date_raw = (item.findtext('pubDate') or '').strip()
        published_at = None
        if pub_date_raw:
            try:
                published_at = parsedate_to_datetime(pub_date_raw).astimezone().isoformat(timespec='seconds')
            except Exception:
                published_at = None
        items.append({
            'title': title,
            'url': link,
            'summary': description,
            'source': source,
            'published_at': published_at,
            'raw': {
                'query': query,
                'pubDate': pub_date_raw,
            },
        })
    return items


def fetch_krx_json(endpoint, params):
    base = 'https://k-skill-proxy.nomadamas.org'
    url = f"{base}{endpoint}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=20) as res:
            return json.loads(res.read().decode())
    except Exception:
        return None


def yyyymmdd(value):
    return value.strftime('%Y%m%d')


def map_krx_market(market_code):
    upper = str(market_code or '').upper()
    if upper == 'KSQ':
        return 'KOSDAQ'
    if upper == 'KNX':
        return 'KONEX'
    return 'KOSPI'


def build_korean_stock_cache(latest):
    cache = {}
    for position in latest.get('positions', []):
        if position.get('market_type') != 'KR_STOCK':
            continue
        symbol = position.get('symbol')
        if not symbol:
            continue
        code = symbol[1:] if symbol.startswith('A') else symbol
        market = map_krx_market(position.get('market_code'))
        series = []
        cursor = datetime.now()
        attempts = 0
        while len(series) < 12 and attempts < 25:
            bas_dd = yyyymmdd(cursor)
            payload = fetch_krx_json('/v1/korean-stock/trade-info', {
                'market': market,
                'code': code,
                'bas_dd': bas_dd,
            })
            item = (payload or {}).get('item')
            if item:
                series.append(item)
            cursor = cursor - timedelta(days=1)
            attempts += 1
        base_info = None
        if series:
            base_payload = fetch_krx_json('/v1/korean-stock/base-info', {
                'market': market,
                'code': code,
                'bas_dd': series[0].get('base_date'),
            })
            base_info = (base_payload or {}).get('item')
        cache[symbol] = {
            'market': market,
            'market_code': position.get('market_code'),
            'code': code,
            'series': list(reversed(series)),
            'base_info': base_info,
            'source': 'KRX official data via k-skill-proxy',
        }
    return cache


def supabase_config():
    env = parse_env(repo_root / '.env.vercel.production')
    url = env.get('SUPABASE_URL')
    key = env.get('SUPABASE_SERVICE_ROLE_KEY')
    schema = env.get('SUPABASE_DB_SCHEMA', 'rich_dad_dashboard')
    if not url or not key:
        return None
    return {
        'base': url.rstrip('/') + '/rest/v1',
        'key': key,
        'schema': schema,
    }


def request_supabase(method, path, params=None, body=None, headers=None):
    config = supabase_config()
    if not config:
        raise RuntimeError('Missing Supabase production env for sync')
    query = f'?{urllib.parse.urlencode(params)}' if params else ''
    url = f"{config['base']}/{path}{query}"
    req = urllib.request.Request(url, method=method)
    req.add_header('apikey', config['key'])
    req.add_header('Authorization', f"Bearer {config['key']}")
    req.add_header('Accept-Profile', config['schema'])
    req.add_header('Content-Profile', config['schema'])
    req.add_header('Content-Type', 'application/json')
    if headers:
        for key, value in headers.items():
            req.add_header(key, value)
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    with urllib.request.urlopen(req, payload, timeout=60) as res:
        data = res.read().decode()
        return json.loads(data) if data else None


def load_sources():
    latest_json_src = report_src / 'latest.json'
    latest_md_src = report_src / 'latest.md'
    context_src = repo_root / 'data' / 'investment_context.json'
    for path in [latest_json_src, latest_md_src, context_src]:
        if not path.exists():
            raise SystemExit(f'Missing source file: {path}')
    latest = json.loads(latest_json_src.read_text(encoding='utf-8'))
    context = json.loads(context_src.read_text(encoding='utf-8'))
    return latest_json_src, latest_md_src, context_src, latest, context


def write_public_files(latest_json_src, latest_md_src, latest, context):
    latest_public = copy.deepcopy(latest)
    latest_public.pop('investment_context', None)
    (data_dir / 'latest.json').write_text(json.dumps(latest_public, ensure_ascii=False, indent=2), encoding='utf-8')
    shutil.copy2(latest_md_src, data_dir / 'latest.md')

    dashboard_meta = {
        'project': context.get('project', {}),
        'investor_profile': context.get('investor_profile', {}),
        'red_team_protocol': context.get('red_team_protocol', []),
        'sell_checklist': context.get('sell_checklist', []),
        'current_watchpoints': context.get('current_watchpoints', []),
        'decision_history': context.get('decision_history', []),
    }
    (data_dir / 'dashboard_meta.json').write_text(json.dumps(dashboard_meta, ensure_ascii=False, indent=2), encoding='utf-8')
    korean_stock_cache = build_korean_stock_cache(latest_public)
    (data_dir / 'korean_stock_cache.json').write_text(json.dumps(korean_stock_cache, ensure_ascii=False, indent=2), encoding='utf-8')

    history_path = data_dir / 'history.json'
    if history_path.exists():
        history = json.loads(history_path.read_text(encoding='utf-8'))
    else:
        history = []
        for seed in context.get('historical_snapshots_seed', []):
            history.append(seed)

    current_date = latest_public.get('generated_at') or datetime.now().astimezone().isoformat(timespec='seconds')
    current_positions = []
    for p in latest_public.get('positions', []):
        current_positions.append({
            'symbol': p.get('symbol'),
            'name': p.get('name'),
            'market_value': p.get('market_value'),
            'profit_rate': p.get('profit_rate'),
            'quantity': p.get('quantity'),
            'current_price': p.get('current_price'),
            'profit': p.get('unrealized_pnl'),
            'daily_profit_loss': p.get('daily_profit_loss')
        })

    current_snapshot = {
        'date': current_date,
        'note': '자동 수집 스냅샷',
        'summary': {
            'total_asset': latest_public.get('headline', {}).get('total_asset'),
            'profit': latest_public.get('headline', {}).get('profit'),
            'profit_rate': latest_public.get('headline', {}).get('profit_rate')
        },
        'positions': current_positions
    }

    if not history or history[-1].get('date') != current_date:
        history.append(current_snapshot)
    history = history[-120:]
    history_path.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding='utf-8')

    (public_dir / 'robots.txt').write_text(
        'User-agent: *\nDisallow: /\n\n'
        'User-agent: GPTBot\nDisallow: /\n\n'
        'User-agent: ChatGPT-User\nDisallow: /\n\n'
        'User-agent: ClaudeBot\nDisallow: /\n\n'
        'User-agent: Claude-Web\nDisallow: /\n\n'
        'User-agent: PerplexityBot\nDisallow: /\n\n'
        'User-agent: Google-Extended\nDisallow: /\n\n'
        'User-agent: Googlebot\nDisallow: /\n\n'
        'User-agent: Bingbot\nDisallow: /\n',
        encoding='utf-8'
    )
    (public_dir / 'llms.txt').write_text('User-agent: *\nDisallow: /\n', encoding='utf-8')

    manifest = {
        'synced_at': datetime.now().astimezone().isoformat(timespec='seconds'),
        'report_source': str(report_src),
        'public_dir': str(public_dir),
        'data_files': ['latest.json', 'latest.md', 'history.json', 'dashboard_meta.json', 'korean_stock_cache.json'],
    }
    (public_dir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest, latest_public, history, dashboard_meta, korean_stock_cache


def guess_tab_key(symbol, market_type, profile):
    role = (profile.get('role') or '').lower()
    name = (profile.get('display_name') or '').lower()
    if market_type == 'US_STOCK':
        if '배당' in role or '배당' in name:
            return 'dividend'
        if '헤지' in role:
            return 'hedge'
        return 'core_us'
    if '배당' in role:
        return 'dividend'
    if '헤지' in role:
        return 'hedge'
    if '코어' in role:
        return 'core_kr'
    if '테마' in role or '방산' in role:
        return 'theme'
    return 'watchlist'


def load_existing_profiles():
    try:
        rows = request_supabase('GET', 'dashboard_asset_profiles', params={'select': '*', 'limit': 500}) or []
        return {row['symbol']: row for row in rows}
    except Exception:
        return {}


def load_existing_trades():
    try:
        rows = request_supabase('GET', 'dashboard_trade_history', params={'select': 'trade_id,trade_note', 'limit': 500}) or []
        return {row['trade_id']: row for row in rows}
    except Exception:
        return {}


def find_context_trade_note(order, context_positions):
    side = str(order.get('side') or '').lower()
    if side != 'buy':
        return ''
    symbol = order.get('symbol')
    date = order.get('order_date')
    qty = float(order.get('filled_quantity') or order.get('quantity') or 0)
    price = order.get('average_execution_price') or order.get('price')
    history = (context_positions.get(symbol) or {}).get('buy_history') or []
    for item in history:
        item_qty = float(item.get('qty') or 0)
        item_price = item.get('price')
        same_date = item.get('date') == date
        same_qty = item_qty == qty
        same_price = item_price in (None, price) or price in (None, item_price)
        if same_date and same_qty and same_price:
            return item.get('note') or ''
    return ''


def normalize_timestamp(value, fallback=None):
    if not value:
        return fallback or datetime.now().astimezone().isoformat(timespec='seconds')
    text = str(value)
    if len(text) == 10:
        return f'{text}T00:00:00+09:00'
    return text


def build_runtime_config_rows(context, now_iso):
    return [
        {'key': 'project', 'value': context.get('project', {}), 'updated_at': now_iso},
        {'key': 'investor_profile', 'value': context.get('investor_profile', {}), 'updated_at': now_iso},
        {'key': 'red_team_protocol', 'value': context.get('red_team_protocol', []), 'updated_at': now_iso},
        {'key': 'sell_checklist', 'value': context.get('sell_checklist', []), 'updated_at': now_iso},
        {'key': 'current_watchpoints', 'value': context.get('current_watchpoints', []), 'updated_at': now_iso},
        {'key': 'decision_history', 'value': context.get('decision_history', []), 'updated_at': now_iso},
    ]


def build_snapshot_rows(latest, history, now_iso):
    rows = {}
    for item in history:
        generated_at = normalize_timestamp(item.get('date'), now_iso)
        rows[generated_at] = {
            'generated_at': generated_at,
            'note': item.get('note') or '',
            'summary': item.get('summary') or {},
            'positions': item.get('positions') or [],
            'latest': {},
            'metrics': {},
            'advice': [],
            'cautions': [],
            'next_actions': [],
            'headline': {},
            'source': 'history_seed',
            'updated_at': now_iso,
        }

    latest_generated_at = normalize_timestamp(latest.get('generated_at'), now_iso)
    rows[latest_generated_at] = {
        'generated_at': latest_generated_at,
        'note': '자동 수집 스냅샷',
        'summary': {
            'total_asset': latest.get('headline', {}).get('total_asset'),
            'profit': latest.get('headline', {}).get('profit'),
            'profit_rate': latest.get('headline', {}).get('profit_rate'),
        },
        'positions': latest.get('positions', []),
        'latest': latest,
        'metrics': latest.get('metrics', {}),
        'advice': latest.get('advice', []),
        'cautions': latest.get('cautions', []),
        'next_actions': latest.get('next_actions', []),
        'headline': latest.get('headline', {}),
        'source': 'tossctl',
        'updated_at': now_iso,
    }
    return list(rows.values())


def build_market_cache_rows(korean_stock_cache, latest_positions, now_iso):
    rows = []
    latest_map = {item.get('symbol'): item for item in latest_positions}
    for symbol, payload in korean_stock_cache.items():
        latest_item = latest_map.get(symbol, {})
        rows.append({
            'cache_key': symbol,
            'symbol': symbol,
            'market': payload.get('market') or latest_item.get('market_type'),
            'market_code': payload.get('market_code') or latest_item.get('market_code'),
            'payload': payload,
            'updated_at': now_iso,
        })
    return rows


def build_news_query(position, profile):
    display_name = profile.get('display_name') or position.get('name') or position.get('symbol')
    symbol = position.get('symbol') or ''
    if position.get('market_type') == 'US_STOCK':
        return f'{display_name} stock'
    return f'{display_name} 주식'


def build_news_rows(latest, profile_rows, now_iso):
    rows = []
    profile_map = {row['symbol']: row for row in profile_rows}
    for position in latest.get('positions', []):
        symbol = position.get('symbol')
        if not symbol:
            continue
        profile = profile_map.get(symbol, {})
        query = build_news_query(position, profile)
        display_name = profile.get('display_name') or position.get('name') or symbol
        for item in fetch_google_news(query, limit=3):
            if not item.get('url'):
                continue
            rows.append({
                'symbol': symbol,
                'display_name': display_name,
                'query': query,
                'title': item.get('title') or display_name,
                'summary': item.get('summary') or '',
                'source': item.get('source') or 'Google News',
                'url': item.get('url'),
                'published_at': item.get('published_at'),
                'raw': item.get('raw') or {},
                'updated_at': now_iso,
            })
    return rows


def sync_supabase(latest, context, history, korean_stock_cache):
    config = supabase_config()
    if not config:
        return {'status': 'skipped', 'reason': 'missing_supabase_env'}

    existing_profiles = load_existing_profiles()
    existing_trades = load_existing_trades()
    latest_positions = {item.get('symbol'): item for item in latest.get('positions', [])}
    context_positions = context.get('positions', {})
    profile_rows = []
    now_iso = datetime.now().astimezone().isoformat(timespec='seconds')

    for symbol in sorted(set(latest_positions.keys()) | set(context_positions.keys())):
        latest_item = latest_positions.get(symbol, {})
        context_item = context_positions.get(symbol, {})
        existing = existing_profiles.get(symbol, {})
        profile_rows.append({
            'symbol': symbol,
            'display_name': existing.get('display_name') or context_item.get('display_name') or latest_item.get('name') or symbol,
            'market': existing.get('market') or latest_item.get('market_type'),
            'market_code': existing.get('market_code') or latest_item.get('market_code'),
            'tab_key': existing.get('tab_key') or guess_tab_key(symbol, latest_item.get('market_type'), context_item),
            'role': existing.get('role') or context_item.get('role') or '',
            'why_bought': existing.get('why_bought') if existing.get('why_bought') not in (None, '') else (context_item.get('why_bought') or []),
            'why_sold': existing.get('why_sold') or context_item.get('why_sold') or '',
            'review_triggers': existing.get('review_triggers') if existing.get('review_triggers') not in (None, '') else (context_item.get('review_triggers') or []),
            'sell_plan': existing.get('sell_plan') if existing.get('sell_plan') not in (None, '') else (context_item.get('sell_plan') or {}),
            'next_best_action': existing.get('next_best_action') or context_item.get('next_best_action') or '',
            'memo': existing.get('memo') or context_item.get('memo') or '',
            'updated_at': now_iso,
        })

    request_supabase(
        'POST',
        'dashboard_asset_profiles',
        params={'on_conflict': 'symbol'},
        headers={'Prefer': 'resolution=merge-duplicates,return=representation'},
        body=profile_rows,
    )

    request_supabase(
        'POST',
        'dashboard_runtime_config',
        params={'on_conflict': 'key'},
        headers={'Prefer': 'resolution=merge-duplicates,return=representation'},
        body=build_runtime_config_rows(context, now_iso),
    )

    request_supabase(
        'POST',
        'dashboard_snapshots',
        params={'on_conflict': 'generated_at'},
        headers={'Prefer': 'resolution=merge-duplicates,return=representation'},
        body=build_snapshot_rows(latest, history, now_iso),
    )

    market_cache_rows = build_market_cache_rows(korean_stock_cache, latest.get('positions', []), now_iso)
    if market_cache_rows:
        request_supabase(
            'POST',
            'dashboard_market_cache',
            params={'on_conflict': 'cache_key'},
            headers={'Prefer': 'resolution=merge-duplicates,return=representation'},
            body=market_cache_rows,
        )

    completed_orders = run_json(['tossctl', 'orders', 'completed', '--output', 'json'])
    trade_rows = []
    for order in completed_orders:
        existing = existing_trades.get(order['id'], {})
        trade_rows.append({
            'trade_id': order['id'],
            'symbol': order.get('symbol'),
            'display_name': order.get('name') or order.get('symbol'),
            'market': order.get('market'),
            'market_code': latest_positions.get(order.get('symbol'), {}).get('market_code'),
            'side': order.get('side'),
            'status': order.get('status'),
            'quantity': order.get('quantity'),
            'filled_quantity': order.get('filled_quantity'),
            'price': order.get('price'),
            'average_execution_price': order.get('average_execution_price'),
            'order_date': order.get('order_date'),
            'submitted_at': order.get('submitted_at'),
            'trade_note': existing.get('trade_note') or find_context_trade_note(order, context_positions),
            'source': 'tossctl',
            'raw': order.get('raw') or {},
            'updated_at': now_iso,
        })

    if trade_rows:
        request_supabase(
            'POST',
            'dashboard_trade_history',
            params={'on_conflict': 'trade_id'},
            headers={'Prefer': 'resolution=merge-duplicates,return=representation'},
            body=trade_rows,
        )

    news_rows = build_news_rows(latest, profile_rows, now_iso)
    if news_rows:
        request_supabase(
            'POST',
            'dashboard_news_items',
            params={'on_conflict': 'url'},
            headers={'Prefer': 'resolution=merge-duplicates,return=representation'},
            body=news_rows,
        )

    stale_cutoff = (datetime.now().astimezone() - timedelta(days=7)).isoformat(timespec='seconds')
    request_supabase(
        'DELETE',
        'dashboard_news_items',
        params={'updated_at': f'lt.{stale_cutoff}'},
        headers={'Prefer': 'return=minimal'},
    )

    return {
        'status': 'ok',
        'asset_profiles': len(profile_rows),
        'trade_rows': len(trade_rows),
        'snapshot_rows': len(build_snapshot_rows(latest, history, now_iso)),
        'market_cache_rows': len(market_cache_rows),
        'news_rows': len(news_rows),
    }


def main():
    latest_json_src, latest_md_src, context_src, latest, context = load_sources()
    manifest, latest_public, history, dashboard_meta, korean_stock_cache = write_public_files(latest_json_src, latest_md_src, latest, context)
    supabase_result = sync_supabase(latest_public, context, history, korean_stock_cache)
    print(json.dumps({
        'status': 'ok',
        'public_dir': str(public_dir),
        'synced_files': manifest['data_files'],
        'synced_at': manifest['synced_at'],
        'supabase': supabase_result,
        'dashboard_meta': dashboard_meta,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
