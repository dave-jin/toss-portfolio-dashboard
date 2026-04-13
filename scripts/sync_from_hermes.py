#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import copy
import json
import shutil
import subprocess
import urllib.parse
import urllib.request

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
    }
    (data_dir / 'dashboard_meta.json').write_text(json.dumps(dashboard_meta, ensure_ascii=False, indent=2), encoding='utf-8')

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
        'data_files': ['latest.json', 'latest.md', 'history.json', 'dashboard_meta.json'],
    }
    (public_dir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest


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


def sync_supabase(latest, context):
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

    request_supabase(
        'POST',
        'dashboard_trade_history',
        params={'on_conflict': 'trade_id'},
        headers={'Prefer': 'resolution=merge-duplicates,return=representation'},
        body=trade_rows,
    )

    return {
        'status': 'ok',
        'asset_profiles': len(profile_rows),
        'trade_rows': len(trade_rows),
    }


def main():
    latest_json_src, latest_md_src, context_src, latest, context = load_sources()
    manifest = write_public_files(latest_json_src, latest_md_src, latest, context)
    supabase_result = sync_supabase(latest, context)
    print(json.dumps({
        'status': 'ok',
        'public_dir': str(public_dir),
        'synced_files': manifest['data_files'],
        'synced_at': manifest['synced_at'],
        'supabase': supabase_result,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
