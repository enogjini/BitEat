# BitEat — Restaurant POS & Management

Full-stack app:

- **Frontend** — React (Create React App) in [`f/`](f/)
- **API** — Express in [`api/index.js`](api/index.js), deployed as Vercel serverless functions
- **Database** — PostgreSQL (Supabase in production)

## Production layout

One Vercel project builds both halves from this directory (repo root = `db/db`):

| Path | Role |
|------|------|
| `f/` | CRA app, built to `f/build`, served as the site |
| `api/index.js` | Express app exported for serverless; handles `/api/*` and `/health` |
| `vercel.json` | build command, output dir, and `/api/*` → function rewrites |

The frontend calls the API **same-origin** (`/api/...`), so no CORS config or
`REACT_APP_API_URL` is needed in production.

### Required env var (Vercel → Project → Settings → Environment Variables)

| Name | Value |
|------|-------|
| `DATABASE_URL` | Supabase **connection pooler** string (port `6543`, `?pgbouncer=true`) |

## Local development

```bash
# 1. API (port 5000)
npm install
cp .env.example .env        # set DATABASE_URL to your local Postgres
npm run dev

# 2. Frontend (port 3000, proxied/pointed at the API)
cd f
npm install
# set REACT_APP_API_URL=http://localhost:5000 in f/.env.local
npm start
```

## Database

Schema + seed data live in the Supabase project `BitEat`. To reprovision from a
local dump:

```bash
pg_dump -U postgres -h localhost -d restaurant --no-owner --no-privileges -f dump.sql
# then load dump.sql into the target database
```
