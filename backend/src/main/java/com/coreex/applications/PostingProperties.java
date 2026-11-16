package com.coreex.applications;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Reading a posting from a link. {@code allowPrivateHosts} is for the end-to-end tests, which read a fake posting page
 * from this machine; it must stay false everywhere else, because it lifts the rule that only public hosts are read.
 */
@ConfigurationProperties("coreex.postings")
record PostingProperties(@DefaultValue("false") boolean allowPrivateHosts, @DefaultValue("2000000") long maxBytes,
		@DefaultValue("PT8S") Duration timeout, @DefaultValue("3") int maxRedirects) {
}
