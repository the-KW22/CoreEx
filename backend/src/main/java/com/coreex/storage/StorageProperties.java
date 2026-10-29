package com.coreex.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Where Supabase Storage's REST API is ({@code https://<project>.supabase.co/storage/v1}), the secret key that may
 * use it, and the private bucket that holds the Assets. An empty url means Storage is not set up.
 */
@ConfigurationProperties("coreex.storage")
record StorageProperties(@DefaultValue("") String url, @DefaultValue("") String serviceKey,
		@DefaultValue("assets") String bucket) {
}
