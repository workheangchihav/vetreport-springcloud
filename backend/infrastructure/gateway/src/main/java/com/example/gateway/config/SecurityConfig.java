package com.example.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;

import org.springframework.http.HttpStatus;
import reactor.core.publisher.Mono;

import org.springframework.security.config.Customizer;

@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http
            .cors(Customizer.withDefaults())
            .csrf(csrf -> csrf.disable())
            .authorizeExchange(exchanges -> exchanges
                .anyExchange().permitAll()
            )
            .build();
    }
}
