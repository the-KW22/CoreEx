package com.coreex.tokens;

import java.io.IOException;
import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import com.coreex.common.ApiException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * /mcp is the only place an Access token works, and the only place a Supabase token does not. It has its own filter
 * chain, so the rest of the API keeps accepting only Supabase tokens (ADR 0007).
 */
@Configuration
class McpSecurityConfig {

	@Bean
	@Order(1)
	SecurityFilterChain mcpSecurityFilterChain(HttpSecurity http, AccessTokenService tokens) throws Exception {
		return http.securityMatcher("/mcp", "/mcp/**").csrf(csrf -> csrf.disable())
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(requests -> requests.anyRequest().authenticated())
				.addFilterBefore(new TokenFilter(tokens), AuthorizationFilter.class).build();
	}

	/** Not a bean: a bean filter would be added to every request, not only /mcp. */
	private static final class TokenFilter extends OncePerRequestFilter {

		private final AccessTokenService tokens;

		TokenFilter(AccessTokenService tokens) {
			this.tokens = tokens;
		}

		@Override
		protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
				throws IOException, ServletException {
			var header = request.getHeader("Authorization");
			try {
				if (header == null || !header.startsWith("Bearer ")) {
					throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED",
							"Send your Access token as a Bearer token.");
				}
				var agent = tokens.authenticate(header.substring("Bearer ".length()).trim());
				var user = agent.user();
				request.setAttribute(Agent.ATTRIBUTE, agent);
				SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken
						.authenticated(user.id(), null, List.of(new SimpleGrantedAuthority("ROLE_" + user.role()))));
			}
			catch (ApiException e) {
				// Filters run before Spring MVC's error handling, so the same { code, message } body is written here.
				response.setStatus(e.status().value());
				if (e instanceof AccessTokenService.RateLimitedException limited) {
					response.setHeader("Retry-After", Long.toString(limited.retryAfterSeconds()));
				}
				response.setContentType(MediaType.APPLICATION_JSON_VALUE);
				response.getWriter().write("{\"code\":\"" + e.code() + "\",\"message\":\"" + e.getMessage() + "\"}");
				return;
			}
			chain.doFilter(request, response);
		}

	}

}
