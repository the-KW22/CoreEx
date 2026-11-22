package com.coreex.chat;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The limits of one Chat reply (ADR 0009): tool steps and time per reply, how long a reply's claim holds before it
 * counts as released, and the output size of each model call.
 */
@ConfigurationProperties("coreex.chat")
record ChatProperties(@DefaultValue("15") int maxToolSteps, @DefaultValue("PT5M") Duration maxReplyDuration,
		@DefaultValue("PT15M") Duration staleClaim, @DefaultValue("8000") long maxOutputTokens) {
}
