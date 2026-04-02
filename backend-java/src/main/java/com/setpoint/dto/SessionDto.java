package com.setpoint.dto;

import java.time.LocalDate;

public record SessionDto(
        String id,
        LocalDate date,
        String status,
        String formatId,
        String location
) {}
