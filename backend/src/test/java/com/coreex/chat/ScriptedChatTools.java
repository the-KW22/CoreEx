package com.coreex.chat;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import com.coreex.TestSupportConfiguration.TestClock;
import com.coreex.identity.User;

/**
 * Three tools for the tests: {@code echo} returns its input, {@code boom} fails with a stack-trace-like message that
 * must never reach the model, and {@code slow} moves the test clock on by six minutes (past the reply's time limit).
 */
@TestConfiguration(proxyBeanMethods = false)
class ScriptedChatTools {

	static final String BOOM_DETAIL = "secret stack detail";

	/** Primary, so it wins over the real {@link ChatToolbox}, which is always scanned in. */
	@Bean
	@Primary
	ChatTools scriptedChatTools(TestClock clock) {
		return new ChatTools() {

			@Override
			public List<com.coreex.ai.Model.ToolSpec> specs() {
				var object = Map.<String, Object>of("type", "object");
				return List.of(new com.coreex.ai.Model.ToolSpec("echo", "Echoes its input", object),
						new com.coreex.ai.Model.ToolSpec("boom", "Always fails", object),
						new com.coreex.ai.Model.ToolSpec("slow", "Takes a long time", object));
			}

			@Override
			public String run(User user, String name, Map<String, Object> input) {
				return switch (name) {
					case "echo" -> "echoed " + input;
					case "boom" -> throw new IllegalStateException(BOOM_DETAIL);
					case "slow" -> {
						clock.advance(Duration.ofMinutes(6));
						yield "slow done";
					}
					default -> throw new IllegalArgumentException("unknown " + name);
				};
			}

		};
	}

}
