package com.setpoint.controllers;

import com.setpoint.config.AppConstants;
import org.jooq.DSLContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Public player endpoints.
 * Maps to backend/routers/players.py
 */
@RestController
@RequestMapping("/players")
public class PlayerController {

    private final DSLContext db;

    public PlayerController(DSLContext db) {
        this.db = db;
    }

    @GetMapping
    public List<Map<String, Object>> listPlayers() {
        return db.fetch("SELECT * FROM players ORDER BY name").intoMaps();
    }

    @GetMapping("/{playerId}")
    public Map<String, Object> getPlayer(@PathVariable String playerId) {
        List<Map<String, Object>> result = db.fetch(
                "SELECT * FROM players WHERE id = ?", playerId
        ).intoMaps();
        if (result.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Player not found");
        }
        return result.get(0);
    }

    @GetMapping("/{playerId}/profile")
    public Map<String, Object> getPlayerProfile(@PathVariable String playerId) {
        List<Map<String, Object>> players = db.fetch(
                "SELECT * FROM players WHERE id = ?", playerId
        ).intoMaps();
        if (players.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Player not found");
        }

        List<Map<String, Object>> rows = db.fetch(
                "SELECT ss.session_id, ss.total_wins, ss.total_diff, ss.place, " +
                "       s.date, s.series_id, ts.name AS series_name " +
                "FROM session_standings ss " +
                "JOIN sessions s ON s.id = ss.session_id " +
                "LEFT JOIN tournament_series ts ON ts.id = s.series_id " +
                "WHERE ss.player_id = ? " +
                "ORDER BY s.date DESC", playerId
        ).intoMaps();

        List<Map<String, Object>> history = new ArrayList<>();
        Map<String, Map<String, Object>> totals = new HashMap<>();

        for (Map<String, Object> r : rows) {
            String seriesName = r.get("series_name") != null ? (String) r.get("series_name") : "—";
            String seriesId   = (String) r.get("series_id");
            int place = r.get("place") != null ? (int) r.get("place") : 99;

            history.add(Map.of(
                    "session_id",  r.get("session_id"),
                    "date",        r.get("date"),
                    "series_name", seriesName,
                    "series_id",   seriesId != null ? seriesId : "",
                    "place",       place,
                    "total_wins",  r.getOrDefault("total_wins", 0),
                    "total_diff",  r.getOrDefault("total_diff", 0)
            ));

            String key = seriesId != null ? seriesId : "all";
            Map<String, Object> bucket = totals.computeIfAbsent(key, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("sessions", 0); m.put("wins", 0); m.put("games", 0);
                m.put("first", 0); m.put("second", 0); m.put("third", 0); m.put("fourth", 0);
                return m;
            });

            bucket.put("sessions", (int) bucket.get("sessions") + 1);
            bucket.put("wins",     (int) bucket.get("wins") + (int) r.getOrDefault("total_wins", 0));
            bucket.put("games",    (int) bucket.get("games") + AppConstants.GAMES_PER_SESSION);
            if (place == 1) bucket.put("first",  (int) bucket.get("first")  + 1);
            else if (place == 2) bucket.put("second", (int) bucket.get("second") + 1);
            else if (place == 3) bucket.put("third",  (int) bucket.get("third")  + 1);
            else if (place == 4) bucket.put("fourth", (int) bucket.get("fourth") + 1);
        }

        // Collapse into single overall block
        Map<String, Object> overall = new LinkedHashMap<>();
        overall.put("sessions", 0); overall.put("wins", 0); overall.put("games", 0);
        overall.put("first", 0); overall.put("second", 0); overall.put("third", 0); overall.put("fourth", 0);
        for (Map<String, Object> v : totals.values()) {
            for (String k : List.of("sessions", "wins", "games", "first", "second", "third", "fourth")) {
                overall.put(k, (int) overall.get(k) + (int) v.get(k));
            }
        }
        int games = (int) overall.get("games");
        int wins  = (int) overall.get("wins");
        overall.put("win_pct", games > 0 ? Math.round(wins * 1000.0 / games) / 10.0 : 0.0);

        return Map.of("player", players.get(0), "overall", overall, "history", history);
    }

    @GetMapping("/{playerId}/teammate-stats")
    public Map<String, Object> getTeammateStats(@PathVariable String playerId) {
        List<Map<String, Object>> myAssignments = db.fetch(
                "SELECT session_id, round_number, team FROM round_assignments WHERE player_id = ?", playerId
        ).intoMaps();

        if (myAssignments.isEmpty()) {
            return Map.of("top_teammates", List.of(), "worst_teammates", List.of(), "most_played", List.of());
        }

        List<String> sessionIds = myAssignments.stream()
                .map(a -> (String) a.get("session_id"))
                .distinct()
                .collect(Collectors.toList());

        String inClause = sessionIds.stream().map(id -> "?").collect(Collectors.joining(", "));

        List<Map<String, Object>> allAssignments = db.fetch(
                "SELECT ra.session_id, ra.round_number, ra.team, ra.player_id, p.name " +
                "FROM round_assignments ra JOIN players p ON p.id = ra.player_id " +
                "WHERE ra.session_id IN (" + inClause + ")",
                sessionIds.toArray()
        ).intoMaps();

        List<Map<String, Object>> myGames = db.fetch(
                "SELECT session_id, round_number, point_diff FROM game_results " +
                "WHERE player_id = ? AND session_id IN (" + inClause + ")",
                prepend(playerId, sessionIds)
        ).intoMaps();

        // (session_id, round_number) -> {wins, games}
        Map<String, Map<String, Integer>> roundResults = new HashMap<>();
        for (Map<String, Object> g : myGames) {
            String key = g.get("session_id") + ":" + g.get("round_number");
            Map<String, Integer> r = roundResults.computeIfAbsent(key, k -> {
                Map<String, Integer> m = new HashMap<>();
                m.put("wins", 0); m.put("games", 0);
                return m;
            });
            r.put("games", r.get("games") + 1);
            if ((int) g.get("point_diff") > 0) r.put("wins", r.get("wins") + 1);
        }

        // (session_id, round_number, team) -> [player_ids]
        Map<String, List<String>> teamMembers = new HashMap<>();
        Map<String, String> playerNames       = new HashMap<>();
        for (Map<String, Object> a : allAssignments) {
            String key = a.get("session_id") + ":" + a.get("round_number") + ":" + a.get("team");
            teamMembers.computeIfAbsent(key, k -> new ArrayList<>()).add((String) a.get("player_id"));
            playerNames.put((String) a.get("player_id"), (String) a.get("name"));
        }

        Map<String, Map<String, Object>> teammateStats = new HashMap<>();
        for (Map<String, Object> a : myAssignments) {
            String teamKey  = a.get("session_id") + ":" + a.get("round_number") + ":" + a.get("team");
            String roundKey = a.get("session_id") + ":" + a.get("round_number");
            Map<String, Integer> r = roundResults.getOrDefault(roundKey, Map.of("wins", 0, "games", 0));

            for (String tid : teamMembers.getOrDefault(teamKey, List.of())) {
                if (tid.equals(playerId)) continue;
                Map<String, Object> s = teammateStats.computeIfAbsent(tid, k -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", tid); m.put("name", playerNames.getOrDefault(tid, "Unknown"));
                    m.put("games", 0); m.put("wins", 0);
                    return m;
                });
                s.put("games", (int) s.get("games") + r.get("games"));
                s.put("wins",  (int) s.get("wins")  + r.get("wins"));
            }
        }

        List<Map<String, Object>> allStats = new ArrayList<>(teammateStats.values());
        for (Map<String, Object> s : allStats) {
            int g = (int) s.get("games");
            int w = (int) s.get("wins");
            s.put("losses",  g - w);
            s.put("win_pct", g > 0 ? Math.round(w * 1000.0 / g) / 10.0 : 0.0);
        }

        allStats.sort(Comparator.comparingInt((Map<String, Object> s) -> (int) s.get("games")).reversed()
                .thenComparingInt(s -> -((int) s.get("wins"))));

        List<Map<String, Object>> qualified = allStats.stream()
                .filter(s -> (int) s.get("games") >= AppConstants.TEAMMATE_MIN_GAMES)
                .collect(Collectors.toList());

        List<Map<String, Object>> top = qualified.stream()
                .sorted(Comparator.comparingDouble((Map<String, Object> s) -> (double) s.get("win_pct")).reversed()
                        .thenComparingInt(s -> -((int) s.get("wins"))))
                .limit(AppConstants.TEAMMATE_TOP_N)
                .collect(Collectors.toList());

        List<Map<String, Object>> worst = qualified.stream()
                .sorted(Comparator.comparingDouble((Map<String, Object> s) -> (double) s.get("win_pct"))
                        .thenComparingInt(s -> -((int) s.get("losses"))))
                .limit(AppConstants.TEAMMATE_TOP_N)
                .collect(Collectors.toList());

        return Map.of("most_played", allStats, "top_teammates", top, "worst_teammates", worst);
    }

    private Object[] prepend(String first, List<String> rest) {
        Object[] params = new Object[rest.size() + 1];
        params[0] = first;
        for (int i = 0; i < rest.size(); i++) params[i + 1] = rest.get(i);
        return params;
    }
}
