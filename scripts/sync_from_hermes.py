#!/usr/bin/env python3
from pathlib import Path
from shutil import copy2
from datetime import datetime
import json

src = Path.home() / '.hermes' / 'reports' / 'toss'
dst = Path.home() / 'projects' / 'toss-portfolio-dashboard' / 'public'
dst.mkdir(parents=True, exist_ok=True)

required = ['index.html', 'latest.json', 'latest.md']
missing = [name for name in required if not (src / name).exists()]
if missing:
    raise SystemExit(f'Missing source files: {", ".join(missing)}')

for name in required:
    copy2(src / name, dst / name)

html_path = dst / 'index.html'
html = html_path.read_text(encoding='utf-8')
robots_meta = '<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, max-snippet:0, max-image-preview:none, max-video-preview:0">\n<meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet, noimageindex">\n<meta name="bingbot" content="noindex, nofollow, noarchive, nosnippet, noimageindex">\n<meta name="ai" content="noindex, nofollow">\n'
if '<head>' in html and 'name="robots"' not in html:
    html = html.replace('<head>', '<head>\n' + robots_meta, 1)
html_path.write_text(html, encoding='utf-8')

(dst / 'robots.txt').write_text(
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

(dst / 'llms.txt').write_text(
    'User-agent: *\nDisallow: /\n',
    encoding='utf-8'
)

manifest = {
    'synced_at': datetime.now().astimezone().isoformat(timespec='seconds'),
    'source_dir': str(src),
    'files': required + ['robots.txt', 'llms.txt'],
}
(dst / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'status':'ok', 'public_dir': str(dst), 'synced_files': manifest['files'], 'synced_at': manifest['synced_at']}, ensure_ascii=False))
