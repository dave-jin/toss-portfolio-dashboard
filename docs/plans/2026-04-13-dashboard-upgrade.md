# Dashboard Upgrade Implementation Plan

> For Hermes: use the existing repo at /Users/dave/projects/toss-portfolio-dashboard and implement this directly with TDD where practical.

Goal: 부자 아빠 프로젝트 · Life CFO Dashboard를 거래 히스토리/투자일기/종목노트 중심의 모바일 친화적 대시보드로 업그레이드하고, 메모와 거래 데이터를 Supabase에 저장한다.

Architecture: 정적 public 데이터는 요약/시세 스냅샷 용도로 유지하고, 민감한 투자 메모/거래 히스토리/탭 설정은 Supabase rich_dad_dashboard 스키마에 저장한 뒤 API 라우트로 읽고 쓴다. 프론트는 단일 페이지를 탭 기반 앱처럼 재구성하고, 차트는 한국주식 프록시 데이터를 포함한 richer chart model로 교체한다.

Tech Stack: static Vercel site + serverless API routes, vanilla JS/CSS, Supabase REST, tossctl local sync scripts, k-skill-proxy Korean stock API.

Planned tasks:
1. 현재 데이터 모델 분석 및 신규 Supabase 스키마 설계
2. Supabase access/session helpers와 notes/trades/bootstrap API 추가
3. 로컬 sync 스크립트에 주문 히스토리/기존 메모 seed/upsert 추가
4. public HTML/CSS/JS를 탭 구조 + 모바일 친화 UI로 개편
5. 차트 유틸 및 한국 주식 정보 프록시 연동 추가
6. 테스트/실데이터 검증/배포
