package com.setpoint.controllers;

import com.setpoint.config.AppConstants;
import com.setpoint.config.AppConstants.RoundSchedule;
import com.setpoint.service.StandingsService;
import com.setpoint.service.StorageService;
import org.jooq.DSLContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Director-only session endpoints.
 * All routes are under /director/** — protected by DirectorAuthInterceptor.
 * Maps to backend/routers/director.py (session + media sections).
 */
@RestController
@RequestMapping("/director")
public class DirectorSessionController {

    private final DSLContext db;
    private final StandingsService standingsService;
    private final StorageService storageService;

    public DirectorSessionController(DSLContext db, StandingsService standingsService, StorageService storageService) {
        this.db = db;
        this.standingsService = standingsService;
        this.storageService = storageService;
    }

    // ---------- Sessions ----------

    @GetMapping("/sessions")
    public List<Map<String, Object>> listSessions() {
        return db.fetch(
                "SELECT s.*, ts.name AS series_name FROM sessions s " +
                "LEFT JOIN tournament_series ts ON ts.id = s.series_id " +
                "ORDER BY s.date DESC"
        ).intoMaps();
    }

    @PostMapping("/sessions")
    public Map<String, Object> createSession(@RequestBody Map<String, Object> body) {
        String date = (String) body.get("date");
        if (date == null || date.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "date is required");
        }
        String formatId = (String) body.getOrDefault("format_id", "revco-roundrobin-4s");
        String seriesId = (String) body.get("series_id");

        List<Map<String, Object>> result = db.fetch(
                "INSERT INTO sessions (date, format_id, series_id, status) VALUES (?, ?, ?, 'draft') RETURNING *",
                date, formatId, seriesId
        ).intoMaps();
        return result.get(0);
    }

    @GetMapping("/sessions/{sessionId}")
    public Map<String, Object> getSession(@PathVariable String sessionId) {
        List<Map<String, Object>> sessions = db.fetch(
                "SELECT s.*, ts.name AS series_name FROM sessions s " +
                "LEFT JOIN tournament_series ts ON ts.id = s.series_id WHERE s.id = ?", sessionId
        ).intoMaps();

        if (sessions.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
        }

        Map<String, Object> session = new LinkedHashMap<>(sessions.get(0));

        // Roster
        List<Map<String, Object>> roster = db.fetch(
                "SELECT p.id, p.name, p.gender FROM session_roster sr " +
                "JOIN players p ON p.id = sr.player_id WHERE sr.session_id = ?", sessionId
        ).intoMaps();

        // Round assignments
        Map<String, Object> assignments = buildAssignments(sessionId);

        // Round games
        List<Map<String, Object>> roundGames = db.fetch(
                "SELECT * FROM round_games WHERE session_id = ? ORDER BY round_number, game_number", sessionId
        ).intoMaps();

        // Live standings
        List<Map<String, Object>> liveStandings;
        try {
            liveStandings = standingsService.computeLiveStandings(sessionId);
        } catch (Exception e) {
            liveStandings = List.of();
        }

        session.put("roster", roster);
        session.put("assignments", assignments);
        session.put("round_games", roundGames);
        session.put("live_standings", liveStandings);
        return session;
    }

    @PostMapping("/sessions/{sessionId}/activate")
    public Map<String, Object> activateSession(@PathVariable String sessionId) {
        List<Map<String, Object>> sessions = db.fetch(
                "SELECT status FROM sessions WHERE id = ?", sessionId
        ).intoMaps();

        if (sessions.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found");
        }
        if ("completed".equals(sessions.get(0).get("status"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Session is already completed.");
        }

        long r1Count = (long) db.fetch(
                "SELECT COUNT(*) AS cnt FROM round_assignments WHERE session_id = ? AND round_number = 1", sessionId
        ).get(0).get("cnt");

        if (r1Count < AppConstants.ROSTER_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Assign Round 1 teams before activating.");
        }

        // Pre-create G1 entries for all 4 rounds
        for (Map.Entry<Integer, RoundSchedule> entry : AppConstants.ROUND_SCHEDULE.entrySet()) {
            int rn = entry.getKey();
            RoundSchedule sched = entry.getValue();
            db.execute(
                    "DELETE FROM round_games WHERE session_id = ? AND round_number = ? AND game_number = 1",
                    sessionId, rn);
            db.execute(
                    "INSERT INTO round_games (session_id, round_number, game_number, team_a, team_b) VALUES (?, ?, 1, ?, ?)",
                    sessionId, rn, sched.teamA(), sched.teamB());
        }

        db.execute("UPDATE sessions SET status = 'active' WHERE id = ?", sessionId);
        return Map.of("ok", true);
    }

    @DeleteMapping("/sessions/{sessionId}")
    public Map<String, Object> deleteSession(@PathVariable String sessionId) {
        db.execute("DELETE FROM sessions WHERE id = ?", sessionId);
        return Map.of("ok", true);
    }

    // ---------- Roster ----------

    @PostMapping("/sessions/{sessionId}/roster")
    public Map<String, Object> addToRoster(@PathVariable String sessionId, @RequestBody Map<String, Object> body) {
        String playerId = (String) body.get("player_id");
        try {
            db.execute("INSERT INTO session_roster (session_id, player_id) VALUES (?, ?)", sessionId, playerId);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Player already in roster");
        }
        return Map.of("ok", true);
    }

    @DeleteMapping("/sessions/{sessionId}/roster/{playerId}")
    public Map<String, Object> removeFromRoster(
            @PathVariable String sessionId, @PathVariable String playerId) {
        db.execute("DELETE FROM session_roster WHERE session_id = ? AND player_id = ?", sessionId, playerId);
        return Map.of("ok", true);
    }

    // ---------- Team assignment ----------

    @PostMapping("/sessions/{sessionId}/rounds/{roundNumber}/assign-teams")
    public List<Map<String, Object>> assignTeams(
            @PathVariable String sessionId, @PathVariable int roundNumber) {

        if (roundNumber < 1 || roundNumber > AppConstants.NUM_ROUNDS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "round_number must be 1–" + AppConstants.NUM_ROUNDS);
        }

        List<Map<String, Object>> players = db.fetch(
                "SELECT p.id, p.name, p.gender FROM session_roster sr " +
                "JOIN players p ON p.id = sr.player_id WHERE sr.session_id = ?", sessionId
        ).intoMaps();

        List<Map<String, Object>> men       = players.stream().filter(p -> "m".equals(p.get("gender"))).collect(Collectors.toList());
        List<Map<String, Object>> women     = players.stream().filter(p -> "f".equals(p.get("gender"))).collect(Collectors.toList());
        List<Map<String, Object>> ungendered = players.stream().filter(p -> p.get("gender") == null || "".equals(p.get("gender"))).collect(Collectors.toList());

        if (!ungendered.isEmpty()) {
            String names = ungendered.stream().map(p -> (String) p.get("name")).collect(Collectors.joining(", "));
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Gender not set for: " + names + ". Please set gender before assigning teams.");
        }

        int minGender = AppConstants.NUM_TEAMS * AppConstants.MIN_GENDER_PER_TEAM;
        if (men.size() < minGender || women.size() < minGender) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Need at least " + minGender + " men and " + minGender + " women. " +
                    "Currently: " + men.size() + "M / " + women.size() + "F.");
        }

        Collections.shuffle(men);
        Collections.shuffle(women);

        List<Map<String, Object>> records = new ArrayList<>();

        if (men.size() % AppConstants.NUM_TEAMS == 0 && women.size() % AppConstants.NUM_TEAMS == 0) {
            // Even split — distribute exactly evenly
            int mPerTeam = men.size() / AppConstants.NUM_TEAMS;
            int fPerTeam = women.size() / AppConstants.NUM_TEAMS;
            for (int i = 0; i < AppConstants.TEAM_NAMES.size(); i++) {
                String team = AppConstants.TEAM_NAMES.get(i);
                List<Map<String, Object>> teamPlayers = new ArrayList<>();
                teamPlayers.addAll(men.subList(i * mPerTeam, (i + 1) * mPerTeam));
                teamPlayers.addAll(women.subList(i * fPerTeam, (i + 1) * fPerTeam));
                for (Map<String, Object> p : teamPlayers) {
                    records.add(Map.of("session_id", sessionId, "round_number", roundNumber,
                            "player_id", p.get("id"), "team", team));
                }
            }
        } else {
            // Uneven split — guarantee 1 of each gender per team, fill rest randomly
            List<Map<String, Object>> guaranteedM = men.subList(0, AppConstants.NUM_TEAMS);
            List<Map<String, Object>> guaranteedF = women.subList(0, AppConstants.NUM_TEAMS);
            List<Map<String, Object>> remaining   = new ArrayList<>();
            remaining.addAll(men.subList(AppConstants.NUM_TEAMS, men.size()));
            remaining.addAll(women.subList(AppConstants.NUM_TEAMS, women.size()));
            Collections.shuffle(remaining);
            int extrasPerTeam = AppConstants.TEAM_SIZE - (AppConstants.MIN_GENDER_PER_TEAM * 2);
            for (int i = 0; i < AppConstants.TEAM_NAMES.size(); i++) {
                String team = AppConstants.TEAM_NAMES.get(i);
                List<Map<String, Object>> teamPlayers = new ArrayList<>();
                teamPlayers.add(guaranteedM.get(i));
                teamPlayers.add(guaranteedF.get(i));
                teamPlayers.addAll(remaining.subList(i * extrasPerTeam, (i + 1) * extrasPerTeam));
                for (Map<String, Object> p : teamPlayers) {
                    records.add(Map.of("session_id", sessionId, "round_number", roundNumber,
                            "player_id", p.get("id"), "team", team));
                }
            }
        }

        db.execute("DELETE FROM round_assignments WHERE session_id = ? AND round_number = ?", sessionId, roundNumber);
        for (Map<String, Object> r : records) {
            db.execute("INSERT INTO round_assignments (session_id, round_number, player_id, team) VALUES (?, ?, ?, ?)",
                    r.get("session_id"), r.get("round_number"), r.get("player_id"), r.get("team"));
        }
        return records;
    }

    @PostMapping("/sessions/{sessionId}/rounds/{roundNumber}/set-teams")
    public List<Map<String, Object>> setTeams(
            @PathVariable String sessionId, @PathVariable int roundNumber,
            @RequestBody Map<String, Object> body) {

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> assignments = (List<Map<String, Object>>) body.get("assignments");
        if (assignments == null || assignments.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No assignments provided");
        }
        Set<String> validTeams = Set.of("Aces", "Kings", "Queens");
        for (Map<String, Object> a : assignments) {
            if (!validTeams.contains(a.get("team"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid team: " + a.get("team"));
            }
        }

        db.execute("DELETE FROM round_assignments WHERE session_id = ? AND round_number = ?", sessionId, roundNumber);
        List<Map<String, Object>> records = new ArrayList<>();
        for (Map<String, Object> a : assignments) {
            db.execute("INSERT INTO round_assignments (session_id, round_number, player_id, team) VALUES (?, ?, ?, ?)",
                    sessionId, roundNumber, a.get("player_id"), a.get("team"));
            records.add(Map.of("session_id", sessionId, "round_number", roundNumber,
                    "player_id", a.get("player_id"), "team", a.get("team")));
        }
        return records;
    }

    // ---------- Scoring ----------

    @PostMapping("/sessions/{sessionId}/rounds/{roundNumber}/games/{gameNumber}/score")
    public List<Map<String, Object>> submitScore(
            @PathVariable String sessionId,
            @PathVariable int roundNumber,
            @PathVariable int gameNumber,
            @RequestBody Map<String, Object> body) {

        if (!AppConstants.ROUND_SCHEDULE.containsKey(roundNumber)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "round_number must be 1–4");
        }

        int scoreA = (int) body.get("score_a");
        int scoreB = (int) body.get("score_b");

        long exists = (long) db.fetch(
                "SELECT COUNT(*) AS cnt FROM round_games WHERE session_id = ? AND round_number = ? AND game_number = ?",
                sessionId, roundNumber, gameNumber
        ).get(0).get("cnt");

        if (exists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Game " + gameNumber + " for round " + roundNumber + " not found. Score Game 1 first.");
        }

        db.execute("UPDATE round_games SET score_a = ?, score_b = ? WHERE session_id = ? AND round_number = ? AND game_number = ?",
                scoreA, scoreB, sessionId, roundNumber, gameNumber);

        // After G1, determine and create G2 + G3 matchups
        if (gameNumber == 1) {
            Map<String, Object> g1 = db.fetch(
                    "SELECT team_a, team_b FROM round_games WHERE session_id = ? AND round_number = ? AND game_number = 1",
                    sessionId, roundNumber
            ).intoMaps().get(0);

            RoundSchedule sched = AppConstants.ROUND_SCHEDULE.get(roundNumber);
            String winner  = scoreA > scoreB ? (String) g1.get("team_a") : (String) g1.get("team_b");
            String loser   = scoreA > scoreB ? (String) g1.get("team_b") : (String) g1.get("team_a");
            String waiting = sched.waiting();

            for (int[] gn : new int[][]{{2, 0}, {3, 1}}) {
                String ta = gn[0] == 2 ? winner : loser;
                String tb = waiting;
                db.execute("DELETE FROM round_games WHERE session_id = ? AND round_number = ? AND game_number = ?",
                        sessionId, roundNumber, gn[0]);
                db.execute("INSERT INTO round_games (session_id, round_number, game_number, team_a, team_b) VALUES (?, ?, ?, ?, ?)",
                        sessionId, roundNumber, gn[0], ta, tb);
            }
        }

        return standingsService.computeLiveStandings(sessionId);
    }

    @DeleteMapping("/sessions/{sessionId}/rounds/{roundNumber}/games/{gameNumber}/score")
    public Map<String, Object> clearScore(
            @PathVariable String sessionId, @PathVariable int roundNumber, @PathVariable int gameNumber) {

        db.execute("UPDATE round_games SET score_a = NULL, score_b = NULL WHERE session_id = ? AND round_number = ? AND game_number = ?",
                sessionId, roundNumber, gameNumber);

        if (gameNumber == 1) {
            db.execute("DELETE FROM round_games WHERE session_id = ? AND round_number = ? AND game_number IN (2, 3)",
                    sessionId, roundNumber);
        }

        return Map.of("ok", true);
    }

    @PostMapping("/sessions/{sessionId}/complete")
    public Map<String, Object> completeSession(@PathVariable String sessionId) {
        List<Map<String, Object>> standings = standingsService.computeLiveStandings(sessionId);
        if (standings.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No scored games found — cannot complete session.");
        }

        Map<String, Map<String, Object>> finalStats = new HashMap<>();
        for (Map<String, Object> s : standings) {
            finalStats.put((String) s.get("id"), s);
        }

        // Write session_standings
        db.execute("DELETE FROM session_standings WHERE session_id = ?", sessionId);
        for (Map<String, Object> s : standings) {
            db.execute("INSERT INTO session_standings (session_id, player_id, total_wins, total_diff, place) VALUES (?, ?, ?, ?, ?)",
                    sessionId, s.get("id"), s.get("wins"), s.get("diff"), s.get("place"));
        }

        // Build team->player lookup per round
        List<Map<String, Object>> assignmentRows = db.fetch(
                "SELECT round_number, team, player_id FROM round_assignments WHERE session_id = ?", sessionId
        ).intoMaps();
        Map<String, List<String>> teamPlayers = new HashMap<>();
        for (Map<String, Object> a : assignmentRows) {
            String key = a.get("round_number") + ":" + a.get("team");
            teamPlayers.computeIfAbsent(key, k -> new ArrayList<>()).add((String) a.get("player_id"));
        }

        // Write game_results
        List<Map<String, Object>> games = db.fetch(
                "SELECT * FROM round_games WHERE session_id = ? AND score_a IS NOT NULL AND score_b IS NOT NULL", sessionId
        ).intoMaps();

        db.execute("DELETE FROM game_results WHERE session_id = ?", sessionId);
        for (Map<String, Object> g : games) {
            int scoreA = (int) g.get("score_a");
            int scoreB = (int) g.get("score_b");
            int diff   = scoreA - scoreB;
            String teamA = (String) g.get("team_a");
            String teamB = (String) g.get("team_b");
            String rn    = String.valueOf(g.get("round_number"));

            for (String team : List.of(teamA, teamB)) {
                int playerDiff = team.equals(teamA) ? diff : -diff;
                String key = rn + ":" + team;
                for (String playerId : teamPlayers.getOrDefault(key, List.of())) {
                    Map<String, Object> s = finalStats.getOrDefault(playerId,
                            Map.of("wins", 0, "diff", 0, "place", 99));
                    db.execute(
                            "INSERT INTO game_results (session_id, player_id, round_number, game_number, team, point_diff, total_wins, total_diff, place) " +
                            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            sessionId, playerId, g.get("round_number"), g.get("game_number"),
                            team, playerDiff, s.get("wins"), s.get("diff"), s.get("place"));
                }
            }
        }

        db.execute("UPDATE sessions SET status = 'completed' WHERE id = ?", sessionId);
        return Map.of("ok", true, "players_finalized", standings.size());
    }

    // ---------- Media ----------

    @GetMapping("/sessions/{sessionId}/media")
    public List<Map<String, Object>> listMedia(@PathVariable String sessionId) {
        return db.fetch(
                "SELECT * FROM session_media WHERE session_id = ? ORDER BY created_at", sessionId
        ).intoMaps();
    }

    @PostMapping("/sessions/{sessionId}/media")
    public Map<String, Object> addMedia(@PathVariable String sessionId, @RequestBody Map<String, Object> body) {
        String url = ((String) body.getOrDefault("url", "")).strip();
        if (url.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "url is required");
        }

        String mediaType = detectMediaType(url, (String) body.getOrDefault("media_type", ""));
        boolean isFeatured = Boolean.TRUE.equals(body.get("is_featured"));
        String caption = ((String) body.getOrDefault("caption", "")).strip();

        if (isFeatured) {
            db.execute("UPDATE session_media SET is_featured = false WHERE session_id = ?", sessionId);
        }

        List<Map<String, Object>> result = db.fetch(
                "INSERT INTO session_media (session_id, url, caption, media_type, is_featured) VALUES (?, ?, ?, ?, ?) RETURNING *",
                sessionId, url, caption.isBlank() ? null : caption, mediaType, isFeatured
        ).intoMaps();
        return result.get(0);
    }

    @PostMapping("/sessions/{sessionId}/media/upload")
    public Map<String, Object> uploadMedia(
            @PathVariable String sessionId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "") String caption,
            @RequestParam(defaultValue = "false") boolean isFeatured) throws IOException {

        String contentType = file.getContentType() != null ? file.getContentType() : "";
        if (!AppConstants.ALLOWED_IMAGE_TYPES.contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only JPEG, PNG, GIF, and WebP images are supported");
        }

        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "image";
        String ext = originalName.contains(".") ? originalName.substring(originalName.lastIndexOf('.') + 1).toLowerCase() : "jpg";
        String path = sessionId + "/" + UUID.randomUUID() + "." + ext;

        String url = storageService.upload(AppConstants.STORAGE_BUCKET, path, file);

        if (isFeatured) {
            db.execute("UPDATE session_media SET is_featured = false WHERE session_id = ?", sessionId);
        }

        String cap = caption.strip();
        List<Map<String, Object>> result = db.fetch(
                "INSERT INTO session_media (session_id, url, caption, media_type, is_featured) VALUES (?, ?, ?, 'image', ?) RETURNING *",
                sessionId, url, cap.isBlank() ? null : cap, isFeatured
        ).intoMaps();
        return result.get(0);
    }

    @PatchMapping("/sessions/{sessionId}/media/{mediaId}/type")
    public Map<String, Object> setMediaType(
            @PathVariable String sessionId, @PathVariable String mediaId,
            @RequestBody Map<String, Object> body) {

        String mediaType = ((String) body.getOrDefault("media_type", "")).strip();
        if (!Set.of("image", "youtube", "link").contains(mediaType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "media_type must be 'image', 'youtube', or 'link'");
        }
        List<Map<String, Object>> result = db.fetch(
                "UPDATE session_media SET media_type = ? WHERE id = ? RETURNING *", mediaType, mediaId
        ).intoMaps();
        return result.get(0);
    }

    @PatchMapping("/sessions/{sessionId}/media/{mediaId}/feature")
    public Map<String, Object> featureMedia(
            @PathVariable String sessionId, @PathVariable String mediaId) {
        db.execute("UPDATE session_media SET is_featured = false WHERE session_id = ?", sessionId);
        List<Map<String, Object>> result = db.fetch(
                "UPDATE session_media SET is_featured = true WHERE id = ? RETURNING *", mediaId
        ).intoMaps();
        return result.get(0);
    }

    @PatchMapping("/sessions/{sessionId}/media/{mediaId}/unfeature")
    public Map<String, Object> unfeatureMedia(
            @PathVariable String sessionId, @PathVariable String mediaId) {
        List<Map<String, Object>> result = db.fetch(
                "UPDATE session_media SET is_featured = false WHERE id = ? RETURNING *", mediaId
        ).intoMaps();
        return result.get(0);
    }

    @DeleteMapping("/sessions/{sessionId}/media/{mediaId}")
    public Map<String, Object> deleteMedia(
            @PathVariable String sessionId, @PathVariable String mediaId) {
        db.execute("DELETE FROM session_media WHERE id = ?", mediaId);
        return Map.of("ok", true);
    }

    // ---------- Private helpers ----------

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
            ((List<Map<String, Object>>) round.get(team)).add(Map.of(
                    "id", row.get("player_id"), "name", row.get("name"),
                    "gender", row.getOrDefault("gender", "")));
        }
        return assignments;
    }

    private String detectMediaType(String url, String override) {
        if (Set.of("image", "youtube", "link").contains(override)) return override;
        String lower = url.toLowerCase();
        if (lower.contains("youtube.com") || lower.contains("youtu.be")) return "youtube";
        String noQuery = lower.split("\\?")[0];
        if (noQuery.endsWith(".jpg") || noQuery.endsWith(".jpeg") || noQuery.endsWith(".png")
                || noQuery.endsWith(".gif") || noQuery.endsWith(".webp") || lower.contains("i.imgur.com")) {
            return "image";
        }
        return "link";
    }
}
