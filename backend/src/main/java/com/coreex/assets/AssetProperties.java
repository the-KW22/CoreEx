package com.coreex.assets;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** The Asset limits: configuration, not code. Public so the admin screens show the same default quota. */
@ConfigurationProperties("coreex.assets")
public record AssetProperties(@DefaultValue("5242880") long maxSizeBytes, @DefaultValue("104857600") long defaultQuotaBytes,
		@DefaultValue("24h") Duration pendingTtl, @DefaultValue("5m") Duration urlTtl,
		@DefaultValue("20") int maxPendingUploads) {
}
