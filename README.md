# BitEat — Restaurant POS & Management

Full-stack app:

- **Frontend** — React (Create React App) in [`f/`](f/), light + dark themed
- **API** — Express in [`api/index.js`](api/index.js), deployed as Vercel serverless functions
- **Database** — PostgreSQL (Supabase in production)

Sessions are bearer tokens (see [Authentication](#authentication)); the API
validates every write, tracks drink stock as orders are placed, and settles a
table in one transaction.

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

### Required env vars (Vercel → Project → Settings → Environment Variables)

| Name | Value |
|------|-------|
| `DATABASE_URL` | Supabase **connection pooler** string (port `6543`, `?pgbouncer=true`) |
| `JWT_SECRET` | Long random string that signs session tokens. The API refuses to issue sessions in production without it; rotating it signs everyone out. |

Optional: `CORS_ORIGIN` (comma-separated origins, or `*`) if something other
than the same-origin front end calls the API from a browser.

## Local development

```bash
# 1. API (port 5000)
npm install
cp .env.example .env        # set DATABASE_URL to your local Postgres
npm run dev                 # without JWT_SECRET it signs with a dev secret and says so

# 2. Frontend (port 3000, proxied/pointed at the API)
cd f
npm install
# set REACT_APP_API_URL=http://localhost:5000 in f/.env.local
npm start
```

## Authentication

`POST /api/login` checks the password and answers with a token:

```json
{ "success": true, "token": "…", "expires_in": 43200,
  "user": { "punonjes_id": 1, "emri": "Arben", "lloji": "kamarier" } }
```

Every other `/api/*` route needs it as `Authorization: Bearer <token>`; the
only public routes are `POST /api/login`, `GET /api/punonjesit` (the login
page's waiter picker — it never returns passwords) and `/health`. Tokens are
HS256 JWTs signed with `JWT_SECRET` and last one shift (12 h). No auth library
is involved: [`lib/auth.js`](lib/auth.js) is ~100 lines over Node's `crypto`,
which keeps the install-free test suite install-free.

**Roles.** The token carries `lloji`; routes are gated by it:

| Who | Can |
|-----|-----|
| everyone signed in | read the menu, tables, categories; place orders; settle *their own* tables; create and cancel reservations |
| `kamarier` | only ever sees and pays their own orders — `punonjes_id` in the body or query string is ignored in favour of the token |
| `admin`, `menaxher` | additionally: statistics, inventory, `POST /api/menu`, changing or deleting orders, deleting reservations |

A 401 means no/expired token (the web client drops back to the login page); a
403 means the role is not allowed.

**Passwords** are stored as `scrypt:<salt>:<hash>`. Rows still holding a
plaintext password (the original schema) keep working and are re-hashed on the
next successful login, so no data migration is needed — but after a user has
logged in once, the plaintext is gone.

**Web client.** [`f/src/services/api.js`](f/src/services/api.js) keeps the
token and user in `localStorage` (`biteat-session`) so a reload stays signed
in, attaches the header to every call, and fires `biteat:logout` on a 401.

## Validation and invariants

Every write route checks its input and answers `400 { success: false, error }`
before touching the database — quantities and ids must be positive integers,
prices and stock non-negative, statuses one of the known values, dates real and
not in the past. Missing rows are 404; conflicts are 409; database errors never
reach the browser verbatim. Specifically:

- **Orders** (`POST /api/porosite`) — one transaction: the order, its lines,
  and a stock decrement for every line whose menu item is linked to
  `pije_inventar` (via `artikujt_menu.inventar_pije_id`; food has no link).
  A drink that would go below zero fails the whole order with
  `409 { error, emri_pijes, ne_stok }`. Deleting an unpaid order puts the
  drinks back; a paid order cannot be deleted (409).
- **Payments** (`POST /api/pagesat`) — settles one order (`porosi_id`) or a
  whole table (`porosite: [ids]`) in one transaction: locks each order, totals
  its lines server-side, records one `pagesat` row per order, closes it and
  stamps `ora_mbylljes`. If the client sends `shuma` it must equal the server
  total, otherwise `400 { error, totali }` — a stale screen cannot post a wrong
  amount. Already-closed orders are 409.
- **Reservations** (`POST /api/rezervimet`) — past dates are refused; with a
  table chosen, the party must fit `kapaciteti` (400) and no confirmed booking
  may sit within two hours on that table (409).

## Tests

```bash
npm test              # run the API suite
npm run test:watch    # re-run on change
npm run test:coverage # line/branch coverage
```

The suite covers every `/api` route and `/health` — 271 tests, ~98% line and
~92% branch coverage across `api/` and `lib/`.

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
| `tests/helpers/auth.js` | `tokenFor(role)` / `authHeader(role)` — mints tokens with the same code and dev secret the API verifies with |

Every request from `api.request()` carries an **admin token by default**, so a
test reads as it did before auth existed. Pass `as: 'kamarier'` (or
`'menaxher'`, or a user object) to act as someone else, and `as: null` to send
no token — the auth tests do both.

Because the double records SQL, tests assert on more than status codes: that
`POST /api/porosite` issues `BEGIN` → insert → one insert per line → `COMMIT`,
that it `ROLLBACK`s and still releases the client when a line fails, that
placeholders are numbered correctly when filters combine, and that
`/api/punonjesit` never selects the password column.

### Tests marked `todo`

5 tests are marked `todo`. These are **not unfinished** — each one asserts the
behaviour the endpoint *should* have and is currently red because of a real
defect, with the reason in the todo message. They report as TODO rather than
failures so CI stays green and honest; fixing a defect means deleting its
`{ todo: ... }` marker and watching the test go green. Run `npm test` and read
the TODO lines for the current list. What remains is operational: `/health`
does not ping Postgres, read routes answer an outage with `[]`, the pooler
certificate is not verified, and table ordering assumes numeric labels.

### End-to-end

The unit suite mocks `pg`, so it cannot catch a query that Postgres rejects
(the stock guard originally tripped the CHECK constraint before its own check
ran). Before shipping a change to the order or payment paths, run the API
against a copy of the real database — `CREATE DATABASE restaurant_e2e TEMPLATE
restaurant`, apply the migrations, point `DATABASE_URL` at it — and drive the
flow once.

## Database

Schema + seed data live in the Supabase project `BitEat`. To reprovision from a
local dump:

```bash
pg_dump -U postgres -h localhost -d restaurant --no-owner --no-privileges -f dump.sql
# then load dump.sql into the target database
```

### Migrations

Schema changes live in [`db/migrations/`](db/migrations/), numbered, each
idempotent (safe to re-run). Apply them in order to every database the API
talks to — local first, then Supabase:

```bash
psql "$DATABASE_URL" -f db/migrations/0001_stock_tracking.sql
```

| Migration | What it does | Why |
|-----------|--------------|-----|
| `0001_stock_tracking.sql` | Repairs the `vendos_cmimin_artikullit` trigger, drops the `trg_update_drink_inventory` trigger, adds non-negative CHECKs on `pije_inventar.stoku_aktual` and `artikujt_menu.cmimi` | `pije_inventar` was renamed from `inventar_pijesh` and both triggers still used the old name, so **inserting any drink line failed** — drinks could not be ordered. Stock is now decremented by the API instead. |

The API tolerates a database that has not had `0001` applied: it probes for
`artikujt_menu.inventar_pije_id` on each order and skips stock tracking (with a
warning in the logs) if the column is absent.

### Schema notes

Things the code works around rather than fixes — worth cleaning up in a later
migration:

- `tavolinat.gjendja` is a one-character `"char"` column with a CHECK that only
  admits `'E'`, so every table state the triggers write (`'E Hapur'`,
  `'E Mbyllur'`) is silently truncated to `E`. `tavolinat.statusi` holds the
  usable value. `PATCH /api/tavolinat/:id/gjendja` validates against the
  documented names but the column cannot store them.
- The `porosite` triggers `funksioni_hap_dhe_blloko`, `funksioni_mbyll_dhe_liro`
  and `perditeso_pagese_kur_mbyllet` test for `'Hapur'`, `'Mbyllur'` and
  `'I Mbyllur'`; the application writes `'E Hapur'` / `'E Mbyllur'`, so they
  never fire (and the last one references a `pagesat.paguar_me` column that
  does not exist).
- `artikujt_menu.eshte_i_disponueshem` (availability) is not yet enforced when
  ordering.
