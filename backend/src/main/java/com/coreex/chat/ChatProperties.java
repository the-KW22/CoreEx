package com.coreex.chat;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The limits of one Chat reply (ADR 0009): tool steps and time per reply, how long a reply's claim holds before it
 * counts as released, the output size of each model call, and the size of each tool result sent back to the model.
 */
@ConfigurationProperties("coreex.chat")
record ChatProperties(@DefaultValue("15") int maxToolSteps, @DefaultValue("PT5M") Duration maxReplyDuration,
		@DefaultValue("PT15M") Duration staleClaim, @DefaultValue("8000") long maxOutputTokens,
		// shortcut: a fixed character cap per tool result, not a token count; upgrade to a token budget when the model's limits bite.
		@DefaultValue("60000") int maxToolResultCharacters) {
}
