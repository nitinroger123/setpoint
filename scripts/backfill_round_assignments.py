#!/usr/bin/env python3
"""
Backfill round_assignments for historical sessions by inferring team groupings
from point differential signatures in game_results.

Within each round, players on the same team play the exact same games and share
identical point_diff values for those games. So players with identical
(game_number, point_diff) tuples were on the same team — this is normally
deterministic because the three teams always play distinct game-number pairs:
  G1+G2  (team that wins G1),  G1+G3  (team that loses G1),  G2+G3  (waiting).

Ambiguity can arise if:
  - A player has only 1 game row in a round (data gap) → partial signature
  - Two teams happen to produce colliding signatures (very rare edge case)
In those cases the round is skipped and printed for manual review.

Usage:
    cd backend
    python ../scripts/backfill_round_assignments.py           # live run
    python ../scripts/backfill_round_assignments.py --dry-run  # preview only
"""

import os
import sys
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
DRY_RUN = "--dry-run" in sys.argv

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ── 1. Find sessions that already have round_assignments (skip those) ────────
existing = sb.table("round_assignments").select("session_id").execute().data
existing_assignment_sessions = {row["session_id"] for row in existing}
print(f"Sessions already have round_assignments: {len(existing_assignment_sessions)} (skipped)")

# ── 2. Fetch all game_results with pagination (Supabase caps at 1000/page) ───
print("Fetching game_results...")
all_results = []
PAGE = 1000
offset = 0
while True:
    page = (
        sb.table("game_results")
        .select("session_id, player_id, round_number, game_number, point_diff, players(name)")
        .range(offset, offset + PAGE - 1)
        .execute()
        .data
    )
    all_results.extend(page)
    if len(page) < PAGE:
        break
    offset += PAGE
print(f"Total game_results rows: {len(all_results)}")

# ── 3. Group by (session_id, round_number) ────────────────────────────────────
by_round: dict = defaultdict(list)
for row in all_results:
    if row["session_id"] in existing_assignment_sessions:
        continue
    key = (row["session_id"], row["round_number"])
    by_round[key].append(row)

sessions_to_backfill = {k[0] for k in by_round}
print(f"Sessions to backfill: {len(sessions_to_backfill)}\n")

# ── 4. Cluster players within each round ─────────────────────────────────────
TEAM_LABELS = ["Aces", "Kings", "Queens"]

records = []
clean_rounds = 0
ambiguous_rounds = []    # rounds that need manual assignment

for (session_id, round_number), rows in sorted(by_round.items()):
    # Collect each player's game signature: sorted (game_number, point_diff) pairs
    player_names: dict = {}
    player_sigs: dict = defaultdict(list)

    for row in rows:
        pid = row["player_id"]
        player_sigs[pid].append((row["game_number"], row["point_diff"]))
        player_names[pid] = row["players"]["name"] if row.get("players") else pid

    # Normalise signatures to hashable tuples
    sig_to_players: dict = defaultdict(list)
    for pid, games in player_sigs.items():
        sig = tuple(sorted(games))
        sig_to_players[sig].append(pid)

    groups = list(sig_to_players.values())
    sigs   = list(sig_to_players.keys())

    # ── Check: need exactly 3 groups (sizes of 3 or 4 are both valid) ────────
    if len(groups) != 3:
        # Collect human-readable details for manual review
        detail_lines = []
        for sig, players in zip(sigs, groups):
            names = ", ".join(player_names[p] for p in players)
            detail_lines.append(f"    sig={sig}  players=[{names}]")

        ambiguous_rounds.append({
            "session_id":    session_id,
            "round_number":  round_number,
            "reason":        f"{len(groups)} groups (sizes {[len(g) for g in groups]})",
            "details":       detail_lines,
        })
        continue

    # ── Clean: assign team labels and accumulate records ─────────────────────
    for team_name, player_ids in zip(TEAM_LABELS, groups):
        for pid in player_ids:
            records.append({
                "session_id":   session_id,
                "round_number": round_number,
                "player_id":    pid,
                "team":         team_name,
            })
    clean_rounds += 1

# ── 5. Report ─────────────────────────────────────────────────────────────────
print(f"Clean rounds (ready to insert): {clean_rounds}")
print(f"Records to insert:              {len(records)}")
print(f"Ambiguous rounds (manual fix):  {len(ambiguous_rounds)}\n")

if ambiguous_rounds:
    print("=" * 60)
    print("AMBIGUOUS ROUNDS — please assign these manually in the Director UI")
    print("=" * 60)
    for item in ambiguous_rounds:
        print(f"\n  Session {item['session_id']}  Round {item['round_number']}")
        print(f"  Reason: {item['reason']}")
        for line in item["details"]:
            print(line)
    print()

if DRY_RUN:
    print("-- DRY RUN: nothing written --")
    if records:
        print(f"\nSample of first 10 records:")
        for r in records[:10]:
            print(" ", r)
    sys.exit(0)

if not records:
    print("Nothing to insert.")
    sys.exit(0)

# ── 6. Insert in batches ──────────────────────────────────────────────────────
print("Inserting...")
BATCH_SIZE = 200
inserted = 0
for i in range(0, len(records), BATCH_SIZE):
    batch = records[i : i + BATCH_SIZE]
    sb.table("round_assignments").insert(batch).execute()
    inserted += len(batch)
    print(f"  {inserted}/{len(records)}")

print(f"\nDone. Inserted {inserted} round_assignment rows across {clean_rounds} rounds.")
