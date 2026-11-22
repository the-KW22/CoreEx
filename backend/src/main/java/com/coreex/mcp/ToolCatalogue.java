package com.coreex.mcp;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.ai.mcp.annotation.method.tool.utils.McpJsonSchemaGenerator;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.ClassUtils;

import com.coreex.ai.Model;
import com.coreex.common.ApiException;
import com.coreex.identity.User;
import com.coreex.tokens.Agent;

import io.modelcontextprotocol.common.McpTransportContext;
import tools.jackson.databind.json.JsonMapper;

/**
 * The read tools, each defined once as an {@code @McpTool} method, for both front doors: {@code /mcp} exposes them
 * through the MCP starter, and Chat calls them here (ADR 0007). Only methods marked {@code readOnlyHint} are in the
 * catalogue, so a write tool cannot be reached from Chat.
 */
@Component
public class ToolCatalogue {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private record Tool(String name, String description, Object bean, Method method) {
	}

	private final Map<String, Tool> tools;

	ToolCatalogue(ApplicationContext context) {
		var found = new LinkedHashMap<String, Tool>();
		for (var beanName : context.getBeanNamesForType(Object.class, false, false)) {
			var type = context.getType(beanName);
			if (type == null) {
				continue;
			}
			for (var method : ClassUtils.getUserClass(type).getDeclaredMethods()) {
				var annotation = method.getAnnotation(McpTool.class);
				if (annotation == null || !annotation.annotations().readOnlyHint()) {
					continue;
				}
				var name = annotation.name().isEmpty() ? method.getName() : annotation.name();
				if (found.containsKey(name)) {
					throw new IllegalStateException("Two read tools are named " + name);
				}
				found.put(name, new Tool(name, annotation.description(), context.getBean(beanName), method));
			}
		}
		tools = Collections.unmodifiableMap(found);
	}

	/** Every read tool: its name, its description (the MCP one) and its input as a JSON schema object. */
	public List<Model.ToolSpec> specs() {
		return tools.values().stream().map(t -> new Model.ToolSpec(t.name(), t.description(), schema(t.method()))).toList();
	}

	/**
	 * Runs one read tool for this User and returns its result as JSON text. An unknown name is refused; a bad argument
	 * is an {@link ApiException}; an exception a service throws reaches the caller as itself.
	 */
	public String call(User user, String name, Map<String, Object> input) {
		var tool = tools.get(name);
		if (tool == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "UNKNOWN_TOOL", "There is no such tool.");
		}
		var context = McpConfig.context(new Agent(user, "Chat"));
		var arguments = arguments(tool.method(), context, input == null ? Map.of() : input);
		try {
			return JSON.writeValueAsString(tool.method().invoke(tool.bean(), arguments));
		}
		catch (InvocationTargetException e) {
			if (e.getCause() instanceof RuntimeException cause) {
				throw cause;
			}
			throw new IllegalStateException(e.getCause());
		}
		catch (IllegalAccessException e) {
			throw new IllegalStateException(e);
		}
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> schema(Method method) {
		return JSON.readValue(McpJsonSchemaGenerator.generateForMethodInput(method), Map.class);
	}

	/** The method's arguments from the input by parameter name; the transport context is the caller. */
	private static Object[] arguments(Method method, McpTransportContext context, Map<String, Object> input) {
		var params = method.getParameters();
		var arguments = new Object[params.length];
		for (var i = 0; i < params.length; i++) {
			var param = params[i];
			if (McpTransportContext.class.isAssignableFrom(param.getType())) {
				arguments[i] = context;
				continue;
			}
			var value = input.get(param.getName());
			if (value == null) {
				var declared = param.getAnnotation(McpToolParam.class);
				if (declared != null && declared.required()) {
					throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", param.getName() + " is required.");
				}
				continue;
			}
			try {
				arguments[i] = JSON.convertValue(value, param.getType());
			}
			catch (RuntimeException e) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", param.getName() + " is not valid.");
			}
		}
		return arguments;
	}

}
