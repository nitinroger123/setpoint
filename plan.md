# Setpoint Platform — Build Plan

## What we're building
A tournament management platform targeting beach volleyball organizers — better UX than volleyballlife, real-time scores, player-first design, multi-org support. Think Challonge + AVP America + a player app, unified.

---

## Current Stack Assessment

| Layer | Current | Verdict |
|---|---|---|
| Frontend | React/TS on Vercel | Keep — scales to millions of requests free |
| Backend | FastAPI on Railway | Clean, readable, easy to extend — staying with Python |
| DB | Supabase (Postgres) | Keep — has Auth, Realtime, Storage built in |

---

## Phase 1 — Multi-Org & Auth Foundation
**The hardest architectural decision — get this right first.**

**Data model changes:**
```
organizations         — name, slug, logo, contact_email
org_members           — org_id, user_id, role (owner|admin|director|scorer)
players               — unified player record, linked to Supabase Auth user
player_profiles       — avp_id, usav_id, profile_photo, gender, dob
```

**Auth strategy:**
- Directors/staff → Supabase Auth (email+password or magic link), replace PIN system
- Players → Supabase Auth (magic link or Google OAuth — low friction)
- RLS policies per org so data is siloed

**Work involved:** ~2-3 weeks. This is the foundation everything else builds on.

---

## Phase 2 — Tournament Registration & Divisions

```
tournaments           — org_id, name, location, dates, status, format
divisions             — tournament_id, name (Open/AA/A/Women's/Mixed/Juniors), gender_type, team_size, max_teams, entry_fee
teams                 — division_id, name, seed, status (registered|waitlist|withdrawn)
team_players          — team_id, player_id, is_primary_contact
```

**Registration flow:**
1. Director creates tournament + divisions
2. Public registration page per division (players sign up as teams)
3. Director approves/waitlists/seeds teams
4. Payments — Stripe integration (optional phase 2b)

---

## Phase 3 — Pools, Scheduling, Court Assignment

```
pools                 — division_id, name (Pool A/B/C...), court_label
pool_teams            — pool_id, team_id, seed
matches               — pool_id, team1_id, team2_id, court, scheduled_time, status, ref_team_id
match_scores          — match_id, set_number, score1, score2
```

**Scheduling engine:**
- Round-robin pool play generator (already have partial logic from revco)
- Time slot + court assignment — constraint solver (simple greedy works for most tournaments)
- Ref rotation built in

---

## Phase 4 — Realtime Scorekeeping

Supabase Realtime is perfect here — built on Postgres `LISTEN/NOTIFY`.

- Scorer opens match on tablet/phone, enters scores set by set
- `match_scores` row updates trigger Supabase Realtime broadcast
- Player app + spectator view update live with no polling

**Scale concern:** Supabase free tier supports ~200 concurrent realtime connections. Pro tier ($25/mo) handles much more. For a 200-team tournament you'd have maybe 50 concurrent scorers + hundreds of viewers — Pro tier handles this fine.

---

## Phase 5 — Playoffs & Brackets

```
brackets              — division_id, type (single_elim|double_elim|3_team_pool)
bracket_slots         — bracket_id, round, position, team_id, match_id
```

- Seeding from pool play standings (win%, point diff, head-to-head)
- Bracket auto-generation on "finalize pool play"
- Visual bracket UI (can use an open-source bracket renderer)

---

## Phase 6 — Player Profiles & Cross-Tournament Stats

```
player_stats          — player_id, tournament_id, division_id, team_id, wins, losses, pts_for, pts_against, partner_ids
player_ratings        — player_id, format (2s/4s/6s), rating, updated_at
```

- Aggregate stats across all tournaments on a public `/players/:id` page
- Partner history, win rates, division breakdowns
- Feed stats from revco 4s sessions into the same pipeline

---

## Player App UX (the key differentiator)

The #1 thing volleyballlife gets wrong is the player experience. Target:

- Player logs in → sees **"You're playing today"** card immediately
- Shows: pool, court, next match time, current standings, bracket position
- Push notifications for "your match starts in 15 min" (web push or later native)
- QR code check-in at tournament

---

## AVP America Data

AVP America runs on Active Network and doesn't have a public API. Options:

1. **Manual import** — CSV upload of player name/email/USAV ID
2. **Scraping** — legally gray, fragile, not recommended
3. **Partnership** — if running sanctioned events, reach out to AVP America for a data share agreement
4. **USAV ID field** — add `usav_id` to player profiles so players self-link and cross-reference

---

## Infrastructure & Scale Limits

| Component | Free Tier Limit | Paid Tier | When to upgrade |
|---|---|---|---|
| Supabase DB | 500MB | $25/mo → 8GB | ~10K players |
| Supabase Auth | 50K MAU | 100K MAU | When you have paying orgs |
| Supabase Realtime | 200 concurrent | Much higher on Pro | First big tournament |
| Vercel | 100GB bandwidth | $20/mo | High traffic events |
| Railway | $5/mo current | Autoscale | When you add background workers |

**Realistic scale ceiling before re-architecting:** ~500 organizations, ~100K players, ~1M matches. Well beyond year 1-2.

---

## Build Order

| Phase | Scope | Estimate |
|---|---|---|
| 1 — Foundation | Supabase Auth + multi-org + player accounts | 6-8 weeks |
| 2 — Registration | Tournament creation + division registration | 4-6 weeks |
| 3 — Ops | Pools + scheduling + courts + scorekeeping | 6-8 weeks |
| 4 — Realtime | Live scores + player match-day view | 3-4 weeks |
| 5 — Playoffs | Brackets + seeding | 3-4 weeks |
| 6 — Stats | Cross-tournament player profiles | 4-6 weeks |

---

## Key Decisions Before Writing Code

1. **One Supabase project or separate per org?** → Single project with RLS (simpler, cheaper, fine until massive scale)
2. **Player identity** — email as primary key, or phone-based login for lower friction?
3. **Do orgs pay you?** — if yes, need a billing model before Phase 2
