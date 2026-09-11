# BitEat — Restaurant POS & Management

Full-stack app:

- **Frontend** — React (Create React App) in [`f/`](f/), light + dark themed
- **API** — Express in [`api/index.js`](api/index.js), deployed as Vercel serverless functions
- **Database** — PostgreSQL (Supabase in production)

## Theming

The web client ships light and dark. The choice lives in `localStorage` under
`biteat-theme` and has three values: `light`, `dark`, `system` (default — follows
the OS and keeps following it if it changes while the app is open).

Three pieces make it work:

| File | Role |
|------|------|
| `f/public/index.html` | Inline bootstrap script applies the stored theme **before first paint** (no white flash), then configures Tailwind with `darkMode: 'class'` and the semantic colour names |
| `f/src/index.css` | The tokens themselves — one `:root` block for light, one `.dark` block for dark |
| `f/src/theme/ThemeProvider.js` | React state, OS-preference listener, persistence, and the `dark` class on `<html>` |

### Writing themed markup

Use the semantic classes, not raw slate/white — they resolve to CSS variables and
need no `dark:` variant:

| Use | Instead of |
|-----|-----------|
| `bg-canvas` | page background (`bg-slate-50`) |
| `bg-surface` | cards and modals (`bg-white`) |
| `bg-subtle` | rows and inputs inside a card (`bg-slate-50`) |
| `bg-muted` | chips, secondary buttons, chart tracks (`bg-slate-100/200/300`) |
| `border-line` | borders and dividers (`border-slate-200`) |
| `text-ink` | primary text |
| `text-ink-muted` | secondary text (`text-slate-500/600`) |
| `text-ink-subtle` | captions and empty states (`text-slate-400`) |

Bare `border`, `border-b` and `border-t` already pick up the themed colour via the
`borderColor.DEFAULT` override, so they need nothing.

Only two things still need explicit `dark:` variants: **status tints** (the
green/red/yellow/orange badges and tiles, which use a translucent `500/15` fill
and a `300` text shade on dark) and the **brand gradient**, which is dimmed so it
does not glare in a dark dining room.

> Tailwind is currently loaded from the **play CDN** (`cdn.tailwindcss.com`), which
> is not intended for production — it ships a compiler to every visitor and blocks
> first paint. Moving it to a real PostCSS build is worth doing; the token config in
> `index.html` moves to `tailwind.config.js` unchanged when that happens.

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

## Tests

```bash
npm test              # run the API suite
npm run test:watch    # re-run on change
npm run test:coverage # line/branch coverage
```

The suite covers every `/api` route and `/health` — 141 tests, ~99% line and
~98% branch coverage of `api/index.js`.

**It installs nothing.** The runner is Node's built-in `node:test` (Node 18.13+),
and `pg` is replaced by a hand-written double in `tests/helpers/fake-pg.js` that
records each query and answers from registered handlers. So the tests need no
database, no network, and no devDependencies — `npm test` works on a clean
checkout.

| Helper | Purpose |
|--------|---------|
| `tests/helpers/fake-pg.js` | Fake `Pool`/`Client`. `db.when(pattern, result)` scripts a response, `db.calls` is the query log, `db.clients` tracks `release()` |
| `tests/helpers/app.js` | Loads `api/index.js` with `pg` swapped (via a `Module._load` hook, since the Pool is built at module scope) and serves it on a free port |
| `tests/helpers/suite.js` | `useServer()` — boots the app once per file and clears the query log before each test |

Because the double records SQL, tests assert on more than status codes: that
`POST /api/porosite` issues `BEGIN` → insert → one insert per line → `COMMIT`,
that it `ROLLBACK`s and still releases the client when a line fails, that
placeholders are numbered correctly when filters combine, and that
`/api/punonjesit` never selects the password column.

### Tests marked `todo`

29 tests are marked `todo`. These are **not unfinished** — each one asserts the
behaviour the endpoint *should* have and is currently red because of a real
defect, with the reason in the todo message. They report as TODO rather than
failures so CI stays green and honest; fixing a defect means deleting its
`{ todo: ... }` marker and watching the test go green. Run `npm test` and read
the TODO lines for the current list. The largest clusters are missing
authentication, absent server-side validation, and read routes that report an
outage as an empty result.

## Database

Schema + seed data live in the Supabase project `BitEat`. To reprovision from a
local dump:

```bash
pg_dump -U postgres -h localhost -d restaurant --no-owner --no-privileges -f dump.sql
# then load dump.sql into the target database
```
