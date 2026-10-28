package com.coreex.common;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
class SecurityConfig {

	/** Injected wherever the current time matters, so tests can control it. */
	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

	// Supabase signs the access token; the API only verifies it (keys come from the JWKS URL in application.properties).
	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		return http.csrf(csrf -> csrf.disable())
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(requests -> requests.requestMatchers("/api/health", "/v3/api-docs/**")
						.permitAll().anyRequest().authenticated())
				.oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults())).build();
	}

}
