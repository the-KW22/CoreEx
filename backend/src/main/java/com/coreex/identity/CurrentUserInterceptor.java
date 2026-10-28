package com.coreex.identity;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Runs on every authenticated API call, so a Disabled or uninvited person is refused everywhere. */
@Component
class CurrentUserInterceptor implements HandlerInterceptor {

	static final String ATTRIBUTE = "currentUser";

	private final IdentityService identity;

	CurrentUserInterceptor(IdentityService identity) {
		this.identity = identity;
	}

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		var jwt = (Jwt) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
		var user = identity.resolve(UUID.fromString(jwt.getSubject()), jwt.getClaimAsString("email"));
		request.setAttribute(ATTRIBUTE, user);
		// The role comes from our database, not the token, so method security (@PreAuthorize) can enforce ROLE_ADMIN.
		SecurityContextHolder.getContext().setAuthentication(
				new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + user.role()))));
		return true;
	}

}
