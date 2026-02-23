# PAC-BIZ Ticketing System Guide

Single source of truth for setup, AI modes, status flow, validation, and deployment.

## 1) Runtime Setup

### Backend
```powershell
cd backend
npm install
npm run dev
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```

## 2) Database

### Current target DB
- `it_ticketing_v2`

### Create schema
```bash
mysql -u root -p < backend/database/schema_v2.sql
```

### Apply AI and intake migrations
```bash
mysql -u root -p it_ticketing_v2 < backend/database/migrations/2026-02-19-ai-phase1-rules.sql
mysql -u root -p it_ticketing_v2 < backend/database/migrations/2026-02-20-email-intake-guard.sql
```

### Seed admin login
```bash
cd backend
npm run seed:v2-admin
```

Default dev login:
- `admin@company.com`
- `admin123`

## 3) Ticket Status Source of Truth

Active flow used by app:
- `new`
- `open`
- `in_progress`
- `reopened`
- `resolved`
- `closed`
- `deleted` (soft-delete)

Buckets:
- `new`: `new`
- `active`: `open`, `in_progress`, `reopened`
- `complete`: `resolved`, `closed`, `deleted`

## 4) AI Modes (Manual / Rules / LLM)

Use `backend/.env`:

### Manual only
```env
AI_PRIORITY_ENABLED=false
EMAIL_GUARD_LLM_ENABLED=false
```

### Rules only (free, deterministic)
```env
AI_PRIORITY_ENABLED=true
AI_PRIORITY_MODE=rules_only
EMAIL_GUARD_LLM_ENABLED=false
```

### Hybrid LLM (recommended when key exists)
```env
AI_PRIORITY_ENABLED=true
AI_PRIORITY_MODE=hybrid_llm
EMAIL_GUARD_LLM_ENABLED=true
OPENAI_API_KEY=sk-proj-...
AI_PRIORITY_LLM_MODEL=gpt-4o-mini
EMAIL_GUARD_LLM_MODEL=gpt-4o-mini
```

Notes:
- If LLM fails/unavailable, system falls back to rules in `hybrid_llm`.
- `llm_only` is strict and can degrade if key/quota/model fails.

## 5) Email Intake Guard

Decision outcomes:
- `allow`: create ticket
- `review`: queue in intake review
- `ignore`: skip non-ticket noise
- `quarantine`: high-risk/phishing-like email

Core env:
```env
EMAIL_GUARD_ENABLED=true
EMAIL_GUARD_REVIEW_SCORE=45
EMAIL_GUARD_QUARANTINE_SCORE=70
EMAIL_GUARD_ALLOWLIST_ONLY=false
EMAIL_GUARD_ALLOWED_DOMAINS=pac-biz.com
EMAIL_GUARD_BLOCKED_DOMAINS=
EMAIL_GUARD_BLOCKED_SENDERS=
EMAIL_GUARD_MAX_URLS_BEFORE_RISK=4
EMAIL_GUARD_AUTO_CREATE_REVIEW=false
```

## 6) AI Review + Intake Review APIs

- `GET /api/ai-review/queue?status=pending|reviewed|all&limit=&page=`
- `PATCH /api/ai-review/:id/review`
- `GET /api/ai-review/intake-queue?status=new|released|dismissed|all&decision=all|quarantine|review|ignore`
- `PATCH /api/ai-review/intake-queue/:id/release`
- `PATCH /api/ai-review/intake-queue/:id/dismiss`
- `DELETE /api/ai-review/intake-queue/:id`
- `GET /api/ai-review/metrics`
- `GET /api/ai-review/dashboard?days=30`
- `GET /api/ai-review/recommendations?days=30`
- `GET /api/ai-review/readiness`
- `POST /api/ai-review/email-sync`

## 7) Deployment Checklist

### Backend
- Set all backend env vars in hosting platform
- Start command: `npm start`
- Health check: `https://<backend-domain>/api/health`

### Frontend
- Set `NEXT_PUBLIC_API_URL`, `BACKEND_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_WS_URL`
- Build/lint should pass before deploy

### Validation after deploy
1. Login persists after refresh.
2. Tickets/dashboard/reports/admin pages load.
3. No `Failed to fetch` or `Route not found`.
4. Email intake works and irrelevant emails are filtered.
5. Ticket replies appear in discussion thread.

## 8) Security

1. Never commit `.env`.
2. Rotate leaked API keys immediately.
3. Keep secrets only in env vars.
