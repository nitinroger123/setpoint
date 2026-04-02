package com.setpoint.controllers;

import org.jooq.DSLContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

/**
 * Director-only player management endpoints.
 * Maps to the player section of backend/routers/director.py
 */
@RestController
@RequestMapping("/director/players")
public class DirectorPlayerController {

    private final DSLContext db;

    public DirectorPlayerController(DSLContext db) {
        this.db = db;
    }

    @PostMapping
    public Map<String, Object> createPlayer(@RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
        }
        String phone  = (String) body.get("phone");
        String email  = (String) body.get("email");
        String gender = (String) body.get("gender");

        List<Map<String, Object>> result = db.fetch(
                "INSERT INTO players (name, phone, email, gender) VALUES (?, ?, ?, ?) RETURNING *",
                name.strip(), phone, email, gender
        ).intoMaps();
        return result.get(0);
    }

    @PutMapping("/{playerId}")
    public Map<String, Object> updatePlayer(
            @PathVariable String playerId, @RequestBody Map<String, Object> body) {

        if (body.containsKey("name") && (body.get("name") == null || ((String) body.get("name")).isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name cannot be empty");
        }

        // Build SET clause dynamically for only provided fields
        List<String> setClauses = new ArrayList<>();
        List<Object> params     = new ArrayList<>();
        for (String field : List.of("name", "phone", "email", "gender")) {
            if (body.containsKey(field)) {
                setClauses.add(field + " = ?");
                params.add(body.get(field));
            }
        }
        if (setClauses.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No fields to update");
        }
        params.add(playerId);

        String sql = "UPDATE players SET " + String.join(", ", setClauses) + " WHERE id = ? RETURNING *";
        List<Map<String, Object>> result = db.fetch(sql, params.toArray()).intoMaps();

        if (result.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Player not found");
        }
        return result.get(0);
    }

    @PutMapping("/{playerId}/gender")
    public Map<String, Object> updateGender(
            @PathVariable String playerId, @RequestBody Map<String, Object> body) {

        String gender = (String) body.get("gender");
        if (gender != null && !gender.equals("m") && !gender.equals("f")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "gender must be 'm' or 'f'");
        }
        db.execute("UPDATE players SET gender = ? WHERE id = ?", gender, playerId);
        return Map.of("ok", true);
    }

    @DeleteMapping("/{playerId}")
    public Map<String, Object> deletePlayer(@PathVariable String playerId) {
        try {
            db.execute("DELETE FROM players WHERE id = ?", playerId);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot delete player: " + e.getMessage());
        }
        return Map.of("ok", true);
    }
}
