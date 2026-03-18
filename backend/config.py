# Tournament format constants for Reverse Coed 4s.
# Change these if the format rules ever change.

ROSTER_SIZE        = 12   # Total players per session
NUM_TEAMS          = 3    # Teams per session (Aces, Kings, Queens)
TEAM_SIZE          = ROSTER_SIZE // NUM_TEAMS  # Players per team (4)
MIN_GENDER_PER_TEAM = 1   # Minimum players of each gender per team
NUM_ROUNDS         = 4    # Rounds per session
GAMES_PER_SESSION  = 8    # Games each player plays (NUM_ROUNDS × 2)

# Teammate chemistry thresholds
TEAMMATE_MIN_GAMES = 8    # Minimum games together to appear in best/tough pairings
TEAMMATE_TOP_N     = 5    # Number of entries in best teammates / tough pairings lists

# Supabase pagination
DB_PAGE_SIZE = 1000       # Supabase's default max rows per request
