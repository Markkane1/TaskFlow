# TaskFlow Pro

TaskFlow Pro is a role-based task management platform with real-time notifications, task history, calendar mapping, and scoped permissions.

## Architecture

The project is now split into separate client and server applications:

- `client/`: React + Vite frontend
- `server/`: Express + SQLite backend

The backend follows clean architecture layering:

- `domain/`: core types and errors
- `application/`: business services/use-cases
- `infrastructure/`: database, repositories, security, realtime gateway
- `presentation/`: HTTP routes, middleware, app wiring

## Database And Operations

SQLite is configured with production-safe defaults:

- `journal_mode = WAL`
- `synchronous = NORMAL`
- `busy_timeout` configurable via env

Indexes are created for hot task queries:

- `tasks(manager_id, status, deadline, created_at)`
- `task_assignments(user_id, task_id)`
- `task_history(task_id, created_at, status_to)`

Built-in operational jobs:

- Daily DB snapshot backup (configurable)
- Periodic integrity and size monitoring (`PRAGMA integrity_check`, file + WAL size logs)

## Security Posture

Implemented hardening in this codebase:

- Strict cookie auth defaults (`httpOnly`, `sameSite`, configurable secure flag, max-age)
- JWT validation hardening (issuer/audience/algorithm + shorter expiry)
- Origin guard for state-changing API requests
- API-wide rate limiter + tighter login rate limiter
- Input validation on auth, user, task, status, subtask, and profile endpoints
- Socket.IO authentication from signed cookie (no unauthenticated room joins)
- Production-safe error responses (no internal error leak)
- Service worker excludes `/api` and `/socket.io` from offline fallback cache behavior
- CSRF double-submit protection on state-changing API routes (`x-csrf-token` + `csrf_token` cookie)
- Audit logging for mutating requests and auth/security denials

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment template and configure values:

```bash
cp .env.example .env
```

### Important Environment Variables

- `TASKFLOW_DB_PATH`: SQLite file location
- `SQLITE_BUSY_TIMEOUT_MS`: busy timeout in milliseconds (default `5000`)
- `DB_BACKUP_ENABLED`: enable/disable snapshots (`true`/`false`)
- `DB_BACKUP_INTERVAL_HOURS`: backup frequency (default `24`)
- `DB_BACKUP_DIR`: snapshot folder (default `backups`)
- `DB_MONITOR_ENABLED`: enable DB health monitor (`true`/`false`)
- `DB_MONITOR_INTERVAL_MINUTES`: monitor frequency (default `15`)
- `EMAIL_NOTIFICATIONS_ENABLED`: keep `false` to keep email notifications inactive
- `EMAIL_PROVIDER`: `mock` (default) or future provider switch (e.g. `resend`)
- `RESEND_API_KEY`: Resend API key for email transport
- `RESEND_FROM_EMAIL`: sender email used for Resend
- `RESEND_REPLY_TO_EMAIL`: optional reply-to address
- `RESEND_AUDIENCE_TAG`: optional label for template/audience grouping
- `SEED_DEFAULT_ADMIN`: set `true` only when intentionally seeding an admin
- `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`: used only when seeding is enabled
- `COOKIE_SAME_SITE`: auth cookie SameSite mode (`strict` recommended)
- `COOKIE_SECURE`: set `true` behind HTTPS
- `AUTH_COOKIE_MAX_AGE_MS`: auth cookie max age in milliseconds
- `SLA_ESCALATION_MINUTES_AFTER_DEADLINE`: minutes after overdue before escalation notification

## Run

Start client and server together:

```bash
npm run dev
```

Apps run on:

- Client: `http://localhost:5173`
- Server API: `http://localhost:3000`

Production start (single process, serves built frontend from backend):

```bash
npm run build
npm run start
```

## Scripts

- `npm run dev`: run client + server concurrently
- `npm run dev:client`: run only frontend
- `npm run dev:server`: run only backend
- `npm run start`: run production server (expects `client/dist` to exist)
- `npm run build`: build frontend bundle
- `npm run lint`: type-check client and server
- `npm run clean`: remove frontend build artifacts

## Oracle Free Tier Deployment

For a one-command VM deploy flow, use:

- [`deploy/oracle-free-tier/README.md`](deploy/oracle-free-tier/README.md)
- `bash deploy/oracle-free-tier/deploy.sh http://<public-ip>:3000`

## API Pagination

Large list endpoints support pagination via query params:

- `GET /api/tasks?page=1&limit=25`
- `GET /api/users?page=1&limit=25`
- `GET /api/notices?page=1&limit=25`
- `GET /api/audit-logs?page=1&limit=25` (sysAdmin only)

`/api/tasks` also supports server-side query filters:

- `search`
- `status`
- `priority`
- `scope` (`all` | `created_by_me` | `assigned_to_me`)
- `sort` (`deadline_asc` | `deadline_desc` | `created_desc` | `created_asc` | `priority_desc`)

Paginated response format:

```json
{
  "items": [],
  "page": 1,
  "limit": 25,
  "total": 0,
  "totalPages": 1
}
```

If `page`/`limit` are not provided, endpoints return the existing array response for backward compatibility.

## Default Admin

Default admin is not auto-seeded unless `SEED_DEFAULT_ADMIN=true`.
When enabled, set strong values for `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD`.

## Notice Board

Notice board threads are stored in SQLite and support:

- manager/sysAdmin thread creation
- acknowledgements by users
- in-thread replies/comments

This provides lightweight internal chat-style collaboration without attachments.
