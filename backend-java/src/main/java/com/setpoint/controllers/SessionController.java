package com.setpoint.controllers;

import com.setpoint.service.StandingsService;
import org.jooq.DSLContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.*;

/**
 * Public session endpoints — no auth required.
 * Maps to backend/routers/sessions.py
 */
@RestController
@RequestMapping("/sessions")
public class SessionController {

    private final DSLContext db;
    private final StandingsService standingsService;

    public SessionController(DSLContext db, StandingsService standingsService) {
        this.db = db;
        this.standingsService = standingsService;
    }

    @GetMapping
    public List<Map<String, Object>> listSessions(
            @RequestParam(required = false) String formatId) {
        String sql = "SELECT * FROM sessions ORDER BY date DESC";
        if (formatId != null && !formatId.isBlank()) {
            return db.fetch("SELECT * FROM sessions WHERE format_id = ? ORDER BY date DESC", formatId).intoMaps();
        }
        return db.fetch(sql).intoMaps();
    }

    @GetMapping("/{sessionId}")
    public Map<String, Object> getSession(@PathVariable String sessionId) {
        List<Map<String, Object>> sessions = db.fetch(
                "SELECT s.*, ts.name AS series_name " +
                "FROM sessions s LEFT JOIN tournament_series ts ON ts.id = s.series_id " +
                "WHERE s.id = ?", sessionId
        ).intoMaps();

        if (sessions.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
        }

        Map<String, Object> session = new LinkedHashMap<>(sessions.get(0));
        String status = (String) session.getOrDefault("status", "completed");

        List<Map<String, Object>> media = db.fetch(
                "SELECT * FROM session_media WHERE session_id = ? ORDER BY created_at", sessionId
        ).intoMaps();

        Map<String, Object> assignments = buildAssignments(sessionId);

        if ("active".equals(status)) {
            List<Map<String, Object>> roundGames = db.fetch(
                    "SELECT * FROM round_games WHERE session_id = ? ORDER BY round_number, game_number", sessionId
            ).intoMaps();

            List<Map<String, Object>> liveStandings = standingsService.computeLiveStandings(sessionId);

            session.put("results", List.of());
            session.put("round_games", roundGames);
            session.put("round_assignments", assignments);
            session.put("live_standings", liveStandings);
            session.put("media", media);
        } else {
            List<Map<String, Object>> results = db.fetch(
                    "SELECT gr.*, p.name AS player_name FROM game_results gr " +
                    "JOIN players p ON p.id = gr.player_id WHERE gr.session_id = ?", sessionId
            ).intoMaps();

            session.put("results", results);
            session.put("round_assignments", assignments);
            session.put("media", media);
        }

        return session;
    }

    @GetMapping("/formats")
    public List<Map<String, Object>> listFormats() {
        return db.fetch(
                "SELECT id, name, description FROM tournament_formats WHERE active = true"
        ).intoMaps();
    }

    // ---------- Shared helpers ----------

    private Map<String, Object> buildAssignments(String sessionId) {
        List<Map<String, Object>> rows = db.fetch(
                "SELECT ra.round_number, ra.team, p.id AS player_id, p.name, p.gender " +
                "FROM round_assignments ra JOIN players p ON p.id = ra.player_id " +
                "WHERE ra.session_id = ? ORDER BY ra.round_number", sessionId
        ).intoMaps();

        Map<String, Object> assignments = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String rn = String.valueOf(row.get("round_number"));
            String team = (String) row.get("team");

            @SuppressWarnings("unchecked")
            Map<String, Object> round = (Map<String, Object>) assignments.computeIfAbsent(rn, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("Aces", new ArrayList<>());
                m.put("Kings", new ArrayList<>());
                m.put("Queens", new ArrayList<>());
                return m;
            });

            Map<String, Object> player = Map.of(
                    "id", row.get("player_id"),
                    "name", row.get("name"),
                    "gender", row.getOrDefault("gender", "")
            );
            ((List<Map<String, Object>>) round.get(team)).add(player);
        }
        return assignments;
    }
}
