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

manifest = {
    'synced_at': datetime.now().astimezone().isoformat(timespec='seconds'),
    'source_dir': str(src),
    'files': required,
}
(dst / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'status':'ok', 'public_dir': str(dst), 'synced_files': required, 'synced_at': manifest['synced_at']}, ensure_ascii=False))
