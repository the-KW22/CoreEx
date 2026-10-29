package com.coreex.identity;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Where Supabase Auth's REST API is ({@code https://<project>.supabase.co/auth/v1}) and the secret key that may use its
 * admin calls. An empty url or key means removing a User's sign-in is not set up.
 */
@ConfigurationProperties("coreex.auth")
record AuthProperties(@DefaultValue("") String url, @DefaultValue("") String serviceKey) {
}
