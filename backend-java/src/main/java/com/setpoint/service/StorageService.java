package com.setpoint.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/**
 * Handles file uploads to Supabase Storage.
 */
@Service
public class StorageService {

    private final WebClient webClient;
    private final String supabaseUrl;
    private final String serviceKey;

    public StorageService(
            @Value("${supabase.url}") String supabaseUrl,
            @Value("${supabase.service-key}") String serviceKey) {
        this.supabaseUrl = supabaseUrl;
        this.serviceKey  = serviceKey;
        this.webClient   = WebClient.builder().build();
    }

    /**
     * Upload a file to Supabase Storage and return its public URL.
     *
     * @param bucket   storage bucket name
     * @param path     object path within the bucket (e.g. "sessionId/uuid.jpg")
     * @param file     the uploaded file
     * @return public URL of the uploaded file
     */
    public String upload(String bucket, String path, MultipartFile file) throws IOException {
        byte[] bytes = file.getBytes();
        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";

        webClient.post()
                .uri(supabaseUrl + "/storage/v1/object/" + bucket + "/" + path)
                .header("Authorization", "Bearer " + serviceKey)
                .header("x-upsert", "true")
                .contentType(MediaType.parseMediaType(contentType))
                .bodyValue(bytes)
                .retrieve()
                .toBodilessEntity()
                .block();

        return supabaseUrl + "/storage/v1/object/public/" + bucket + "/" + path;
    }
}
