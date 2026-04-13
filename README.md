# Toss Portfolio Dashboard

Dave의 Toss 포트폴리오를 읽기 전용으로 요약·분석해 정적 페이지로 배포하는 프로젝트입니다.

구성
- `public/index.html` — 배포되는 대시보드 페이지
- `public/latest.json` — 분석 결과 JSON
- `public/latest.md` — 텍스트 요약 리포트
- `scripts/sync_from_hermes.py` — Hermes가 생성한 최신 리포트를 이 프로젝트로 복사
- `vercel.json` — 정적 배포 설정

로컬 사용
```bash
python3 scripts/sync_from_hermes.py
open public/index.html
```

배포 흐름
1. Hermes가 `~/.hermes/reports/toss/`에 최신 리포트 생성
2. `scripts/sync_from_hermes.py`가 결과물을 `public/`으로 복사
3. GitHub에 push
4. Vercel이 자동 배포

주의
- 읽기 전용 리포트만 다룹니다.
- Toss 세션이 만료되면 새로운 리포트 생성이 실패할 수 있습니다.
- 투자 자문 도구가 아니라 포트폴리오 점검용 운영 대시보드입니다.
