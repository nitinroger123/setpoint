package com.setpoint.controllers;

import com.setpoint.config.AppConstants;
import org.jooq.DSLContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Public series + leaderboard endpoints.
 * Maps to backend/routers/series.py
 */
@RestController
@RequestMapping("/series")
public class SeriesController {

    private final DSLContext db;

    public SeriesController(DSLContext db) {
        this.db = db;
    }

    @GetMapping
    public List<Map<String, Object>> listSeries(
            @RequestParam(required = false) String formatId) {
        if (formatId != null && !formatId.isBlank()) {
            return db.fetch(
                    "SELECT * FROM tournament_series WHERE active = true AND format_id = ? ORDER BY name", formatId
            ).intoMaps();
        }
        return db.fetch(
                "SELECT * FROM tournament_series WHERE active = true ORDER BY name"
        ).intoMaps();
    }

    @GetMapping("/{seriesId}")
    public Map<String, Object> getSeries(@PathVariable String seriesId) {
        List<Map<String, Object>> series = db.fetch(
                "SELECT * FROM tournament_series WHERE id = ?", seriesId
        ).intoMaps();
        if (series.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Series not found");
        }
        List<Map<String, Object>> sessions = db.fetch(
                "SELECT * FROM sessions WHERE series_id = ? ORDER BY date DESC", seriesId
        ).intoMaps();

        Map<String, Object> result = new LinkedHashMap<>(series.get(0));
        result.put("sessions", sessions);
        return result;
    }

    @GetMapping("/{seriesId}/leaderboard")
    public List<Map<String, Object>> getLeaderboard(@PathVariable String seriesId) {
        List<Map<String, Object>> sessions = db.fetch(
                "SELECT id FROM sessions WHERE series_id = ?", seriesId
        ).intoMaps();

        if (sessions.isEmpty()) return List.of();

        List<String> sessionIds = sessions.stream()
                .map(s -> (String) s.get("id"))
                .collect(Collectors.toList());

        String inClause = sessionIds.stream().map(id -> "?").collect(Collectors.joining(", "));

        List<Map<String, Object>> perSession = db.fetch(
                "SELECT ss.player_id, ss.session_id, ss.total_wins, ss.total_diff, ss.place, p.name " +
                "FROM session_standings ss JOIN players p ON p.id = ss.player_id " +
                "WHERE ss.session_id IN (" + inClause + ")",
                sessionIds.toArray()
        ).intoMaps();

        Map<String, Map<String, Object>> stats = new LinkedHashMap<>();
        for (Map<String, Object> r : perSession) {
            String pid = (String) r.get("player_id");
            Map<String, Object> s = stats.computeIfAbsent(pid, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("player_id", pid);
                m.put("name",      r.get("name"));
                m.put("sessions",  0);
                m.put("first",     0); m.put("second", 0); m.put("third", 0); m.put("fourth", 0);
                m.put("total_wins",  0);
                m.put("total_games", 0);
                return m;
            });

            s.put("sessions",    (int) s.get("sessions")    + 1);
            s.put("total_wins",  (int) s.get("total_wins")  + (int) r.getOrDefault("total_wins", 0));
            s.put("total_games", (int) s.get("total_games") + AppConstants.GAMES_PER_SESSION);

            int place = r.get("place") != null ? (int) r.get("place") : 99;
            if (place == 1) s.put("first",  (int) s.get("first")  + 1);
            else if (place == 2) s.put("second", (int) s.get("second") + 1);
            else if (place == 3) s.put("third",  (int) s.get("third")  + 1);
            else if (place == 4) s.put("fourth", (int) s.get("fourth") + 1);
        }

        List<Map<String, Object>> leaderboard = new ArrayList<>(stats.values());
        for (Map<String, Object> s : leaderboard) {
            int totalGames = (int) s.get("total_games");
            int totalWins  = (int) s.get("total_wins");
            s.put("win_pct", totalGames > 0 ? Math.round(totalWins * 1000.0 / totalGames) / 10.0 : 0.0);
        }

        leaderboard.sort(Comparator
                .comparingInt((Map<String, Object> s) -> (int) s.get("sessions")).reversed()
                .thenComparingDouble(s -> -((double) s.get("win_pct"))));

        return leaderboard;
    }
}
