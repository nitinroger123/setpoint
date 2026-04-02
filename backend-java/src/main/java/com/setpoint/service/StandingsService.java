package com.setpoint.service;

import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.Result;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Computes live standings from round_games + round_assignments.
 * Port of backend/standings_helper.py
 */
@Service
public class StandingsService {

    private final DSLContext db;

    public StandingsService(DSLContext db) {
        this.db = db;
    }

    public List<Map<String, Object>> computeLiveStandings(String sessionId) {
        // Only count completed games (both scores set)
        List<Map<String, Object>> games = db.fetch(
                "SELECT round_number, game_number, team_a, team_b, score_a, score_b " +
                "FROM round_games WHERE session_id = ? AND score_a IS NOT NULL AND score_b IS NOT NULL",
                sessionId
        ).intoMaps();

        if (games.isEmpty()) return List.of();

        // Build (round_number, team) -> [players]
        List<Map<String, Object>> assignments = db.fetch(
                "SELECT ra.round_number, ra.team, ra.player_id, p.name " +
                "FROM round_assignments ra JOIN players p ON p.id = ra.player_id " +
                "WHERE ra.session_id = ?",
                sessionId
        ).intoMaps();

        Map<String, List<Map<String, Object>>> teamPlayers = new HashMap<>();
        for (Map<String, Object> a : assignments) {
            String key = a.get("round_number") + ":" + a.get("team");
            teamPlayers.computeIfAbsent(key, k -> new ArrayList<>())
                    .add(Map.of("id", a.get("player_id"), "name", a.get("name")));
        }

        // Accumulate wins and point_diff per player
        Map<String, Map<String, Object>> stats = new LinkedHashMap<>();
        for (Map<String, Object> g : games) {
            int scoreA = (int) g.get("score_a");
            int scoreB = (int) g.get("score_b");
            int diff   = scoreA - scoreB;
            String teamA = (String) g.get("team_a");
            String teamB = (String) g.get("team_b");
            String winner = scoreA > scoreB ? teamA : teamB;
            String rn = String.valueOf(g.get("round_number"));

            for (String team : List.of(teamA, teamB)) {
                int playerDiff = team.equals(teamA) ? diff : -diff;
                String key = rn + ":" + team;
                for (Map<String, Object> p : teamPlayers.getOrDefault(key, List.of())) {
                    String pid = (String) p.get("id");
                    stats.computeIfAbsent(pid, k -> {
                        Map<String, Object> s = new LinkedHashMap<>();
                        s.put("id",   pid);
                        s.put("name", p.get("name"));
                        s.put("wins", 0);
                        s.put("diff", 0);
                        return s;
                    });
                    Map<String, Object> s = stats.get(pid);
                    if (team.equals(winner)) s.put("wins", (int) s.get("wins") + 1);
                    s.put("diff", (int) s.get("diff") + playerDiff);
                }
            }
        }

        // Sort: wins desc, diff desc
        List<Map<String, Object>> sorted = new ArrayList<>(stats.values());
        sorted.sort(Comparator
                .comparingInt((Map<String, Object> s) -> (int) s.get("wins")).reversed()
                .thenComparingInt(s -> -((int) s.get("diff"))));

        // Dense ranking: tied players share the same place
        int place = 1;
        for (int i = 0; i < sorted.size(); i++) {
            if (i > 0) {
                Map<String, Object> prev = sorted.get(i - 1);
                Map<String, Object> curr = sorted.get(i);
                if (!curr.get("wins").equals(prev.get("wins")) ||
                    !curr.get("diff").equals(prev.get("diff"))) {
                    place++;
                }
            }
            sorted.get(i).put("place", place);
        }

        return sorted;
    }
}
