package com.coreex.chat;

import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.coreex.ai.Model;
import com.coreex.identity.User;

@Configuration(proxyBeanMethods = false)
class ChatConfiguration {

	/** Until the tool catalogue exists, a Chat reply has no tools to call. A tool catalogue bean replaces this one. */
	@Bean
	@ConditionalOnMissingBean(ChatTools.class)
	ChatTools noChatTools() {
		return new ChatTools() {

			@Override
			public List<Model.ToolSpec> specs() {
				return List.of();
			}

			@Override
			public String run(User user, String name, Map<String, Object> input) {
				throw new IllegalStateException("No Chat tools are set up");
			}

		};
	}

}
