# Tournament format constants for Reverse Coed 4s.
# Change these if the format rules ever change.

ROSTER_SIZE        = 12   # Total players per session
MEN_PER_SESSION    = 6    # Required men on roster
WOMEN_PER_SESSION  = 6    # Required women on roster
NUM_ROUNDS         = 4    # Rounds per session
GAMES_PER_SESSION  = 8    # Games each player plays (NUM_ROUNDS × 2)

# Teammate chemistry thresholds
TEAMMATE_MIN_GAMES = 8    # Minimum games together to appear in best/tough pairings
TEAMMATE_TOP_N     = 5    # Number of entries in best teammates / tough pairings lists

# Supabase pagination
DB_PAGE_SIZE = 1000       # Supabase's default max rows per request
