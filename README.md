# EdgeX Life

Goals, Health and Wellness for The EDGEx — the three modules that were worth
keeping from the flat-HTML traction hub, rebuilt as one installable PWA and
wired into Pulse.

Sibling apps: **Pulse** (tasks, habits), **xFocus** (deep work), **xPM**
(projects, CRM). All four share the cloud Supabase project
`mdkyijbgvxedelcqcouu`.

---

## Why one app instead of three

Goals, Health and Wellness are reflective, low-frequency, and heavily
cross-referencing — a habit is the daily edge of a goal, a check-in is the
daily edge of wellness. Splitting them the way Work split (into xPM / xFocus /
Pulse) would have produced three apps you open once a week each. The `/` Today
page is the payoff: it's the only screen that reads across all three at once.

## Egress: read this before adding a query

This Supabase project once blew its free-tier egress allowance. The cause is
now known and documented, and the fix is structural rather than a matter of
being careful:

| Read | Before | Now |
|---|---|---|
| Vision board (goals page load) | **1,554 kB** every load | **1,035 bytes** + images on demand, cached forever |
| Wellness journal | 363 kB blob | date-windowed slice |
| Health logs | 7 kB blob | date-windowed slice |

The legacy modules stored everything as one giant JSONB blob per feature in
`traction_data`, including 15 base64 JPEGs totalling 1.5 MB, and re-read the
whole blob on every page load.

**Rules this codebase holds to:**

1. Nothing reads `traction_data` directly. Reads go through the `life_*`
   Postgres functions, which slice server-side.
2. No `select('*')` anywhere. Columns are always named.
3. Every history read is date-bounded. `useDataWindow` sizes the window from a
   dates-only index so a page never fetches payloads just to discover it has
   nothing to show.
4. Realtime is disabled at the client level.
5. Every byte is counted. `Settings → Egress this month` shows a live
   client-side ledger broken down by query name, so a regression is visible
   instead of silent.

Vision-board images are fetched one at a time via `life_vision_image(id)` when
a tile scrolls into view, then stored in the Cache Storage API permanently —
each photo crosses the network at most once, ever.

### Database functions

Applied as migrations on `mdkyijbgvxedelcqcouu`, all `security definer` and
scoped to `auth.uid()`, granted to `authenticated` only:

| Function | Returns |
|---|---|
| `life_vision_board()` | image metadata, no `src` |
| `life_vision_image(p_item_id)` | one image's base64 |
| `life_health_index()` | log dates only |
| `life_health_logs(from, to)` | day payloads in range |
| `life_health_settings()` | targets |
| `life_wellness_index()` | check-in dates + counts |
| `life_wellness_checkins(from, to)` | entries in range |
| `life_wellness_notes()` | thoughts + practices |
| `life_goal_rollup()` | per-goal open task / habit counts |

Schema additions (additive and nullable, so Pulse and xFocus are unaffected):
`tasks.goal_id`, `habits.goal_id`, plus a partial unique index
`habit_logs (habit_id, logged_on) where deleted_at is null`.

## Setup

```bash
cp .env.example .env.local     # then paste the anon key
npm install
npm run dev
```

Sign in with your **Pulse** account — Life reads Pulse's `tasks` and `habits`
tables, so it must be the same user id. (xPM uses a different account and is
bridged to Pulse separately.)

### Vercel

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as project environment
variables. `.env.local` is gitignored, and a missing key is the classic cause
of a blank deployed screen — this app shows an explicit config error instead.
`vercel.json` already carries the SPA rewrite.

## Design

Core emotion: **steadiness** — a field almanac you keep for years, not a
dashboard and not a spa.

- **Type:** Fraunces (headings, real optical character) + Archivo (UI).
  Deliberately not Inter.
- **Colour:** evergreen dominates; ochre is rare and always means *live right
  now*; clay only ever means *attention*. Tokens in `src/index.css`.
- **Motion:** one orchestrated settle on route entry. No ambient hovers.
- **Layout:** chronological and content-led. No hero-plus-three-cards.

Distinct from xFocus's coral-on-pale-blue on purpose: sibling app, own
identity.

## Structure

```
src/
  lib/
    supabase.js    client (realtime off)
    egress.js      cached queries + byte ledger    ← read this first
    imageCache.js  vision photos, Cache Storage
    data.js        EVERY read in the app
    dates.js       windows and formatting
  hooks/           useAsync, useDataWindow
  pages/           Today, Goals, Health, Wellness, Settings, Login
  components/      shell, goals, health, common
```

## Not done yet

- Writing new check-ins and health logs from this app (currently read-only over
  the historical data; you still log in the old modules)
- Migrating the base64 vision images into a Storage bucket, which would let
  Supabase's CDN and image transforms do the work instead of the RPC
- Retiring `goals.html` / `health.html` / `wellness.html` from traction-hub
  once this reaches parity
