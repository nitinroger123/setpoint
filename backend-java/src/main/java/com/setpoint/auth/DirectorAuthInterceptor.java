package com.setpoint.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Checks the X-Director-Pin header on all /director/** routes.
 * Equivalent to the require_director FastAPI dependency.
 */
@Component
public class DirectorAuthInterceptor implements HandlerInterceptor {

    @Value("${director.pin}")
    private String expectedPin;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String pin = request.getHeader("X-Director-Pin");
        if (!expectedPin.equals(pin)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("{\"error\": \"Invalid director PIN\"}");
            return false;
        }
        return true;
    }
}
