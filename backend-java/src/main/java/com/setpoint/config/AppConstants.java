package com.setpoint.config;

import java.util.List;
import java.util.Map;
import java.util.Set;

public final class AppConstants {

    private AppConstants() {}

    public static final int ROSTER_SIZE         = 12;
    public static final int NUM_TEAMS           = 3;
    public static final int TEAM_SIZE           = ROSTER_SIZE / NUM_TEAMS; // 4
    public static final int MIN_GENDER_PER_TEAM = 1;
    public static final int NUM_ROUNDS          = 4;
    public static final int GAMES_PER_SESSION   = 8;
    public static final int TEAMMATE_MIN_GAMES  = 8;
    public static final int TEAMMATE_TOP_N      = 5;

    public static final List<String> TEAM_NAMES = List.of("Aces", "Kings", "Queens");

    public static final Set<String> ALLOWED_IMAGE_TYPES =
            Set.of("image/jpeg", "image/png", "image/gif", "image/webp");

    public static final String STORAGE_BUCKET = "session-media";

    // Round schedule: G1 opener and which team sits out G1 (plays G2 + G3)
    // Map<roundNumber, {g1TeamA, g1TeamB, waiting}>
    public static final Map<Integer, RoundSchedule> ROUND_SCHEDULE = Map.of(
            1, new RoundSchedule("Aces",  "Kings",  "Queens"),
            2, new RoundSchedule("Aces",  "Queens", "Kings"),
            3, new RoundSchedule("Kings", "Queens", "Aces"),
            4, new RoundSchedule("Aces",  "Kings",  "Queens")
    );

    public record RoundSchedule(String teamA, String teamB, String waiting) {}
}
