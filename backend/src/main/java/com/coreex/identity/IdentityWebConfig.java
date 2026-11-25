package com.coreex.identity;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
class IdentityWebConfig implements WebMvcConfigurer {

	private final CurrentUserInterceptor currentUser;

	IdentityWebConfig(CurrentUserInterceptor currentUser) {
		this.currentUser = currentUser;
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(currentUser).addPathPatterns("/api/**").excludePathPatterns("/api/health", "/api/access-requests");
	}

}
