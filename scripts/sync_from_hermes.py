#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import json
import shutil

repo_root = Path.home() / 'projects' / 'toss-portfolio-dashboard'
report_src = Path.home() / '.hermes' / 'reports' / 'toss'
public_dir = repo_root / 'public'
data_dir = public_dir / 'data'
data_dir.mkdir(parents=True, exist_ok=True)

latest_json_src = report_src / 'latest.json'
latest_md_src = report_src / 'latest.md'
context_src = repo_root / 'data' / 'investment_context.json'

for path in [latest_json_src, latest_md_src, context_src]:
    if not path.exists():
        raise SystemExit(f'Missing source file: {path}')

latest = json.loads(latest_json_src.read_text(encoding='utf-8'))
context = json.loads(context_src.read_text(encoding='utf-8'))

(data_dir / 'latest.json').write_text(json.dumps(latest, ensure_ascii=False, indent=2), encoding='utf-8')
shutil.copy2(latest_md_src, data_dir / 'latest.md')
(data_dir / 'investment_context.json').write_text(json.dumps(context, ensure_ascii=False, indent=2), encoding='utf-8')

history_path = data_dir / 'history.json'
if history_path.exists():
    history = json.loads(history_path.read_text(encoding='utf-8'))
else:
    history = []
    for seed in context.get('historical_snapshots_seed', []):
        history.append(seed)

current_date = latest.get('generated_at') or datetime.now().astimezone().isoformat(timespec='seconds')
current_positions = []
for p in latest.get('positions', []):
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
        'total_asset': latest.get('headline', {}).get('total_asset'),
        'profit': latest.get('headline', {}).get('profit'),
        'profit_rate': latest.get('headline', {}).get('profit_rate')
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
    'data_files': ['latest.json', 'latest.md', 'investment_context.json', 'history.json'],
}
(public_dir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'status': 'ok', 'public_dir': str(public_dir), 'synced_files': manifest['data_files'], 'synced_at': manifest['synced_at']}, ensure_ascii=False))
