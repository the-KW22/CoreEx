package com.coreex.mcp;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

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
 * The tools, each defined once as an {@code @McpTool} method, for both front doors: {@code /mcp} exposes them through
 * the MCP starter, and Chat calls them here (ADR 0007). The read tools (marked {@code readOnlyHint}) run straight away.
 * The write tools Chat may offer are a fixed list: Chat never runs one when the model calls it, it stores a Proposal, and
 * {@link #apply} runs it only once the User has approved (ADR 0009). Uploads and the Career writes are not on the list.
 */
@Component
public class ToolCatalogue {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	/** The write tools a Chat may propose: what an Agent can do to Notes, Assets, Folders and Tags, never for good. */
	private static final Set<String> PROPOSABLE = Set.of("create_note", "update_note", "edit_note", "update_asset",
			"create_folder", "rename_folder", "move_folder", "trash_folder", "create_tag", "rename_tag", "set_tag_colour",
			"set_tags", "move_item", "trash_item", "restore");

	/** What a Note tool would write: the Note it changes (null for a new one), its version, and its text before and after. */
	public record NotePreview(UUID noteId, Integer version, String before, String after) {
	}

	/** The words on a Proposal's card for an organising change: what it is about, and where it is or its state, before and after. */
	public record Change(String subject, String before, String after) {
	}

	private static final int CHANGE_MAX = 500;

	private record Tool(String name, String description, Object bean, Method method) {
	}

	private final ApplicationContext context;

	private final Map<String, Tool> tools;

	private final Map<String, Tool> writes;

	ToolCatalogue(ApplicationContext context) {
		this.context = context;
		var found = new LinkedHashMap<String, Tool>();
		var proposable = new LinkedHashMap<String, Tool>();
		for (var beanName : context.getBeanNamesForType(Object.class, false, false)) {
			var type = context.getType(beanName);
			if (type == null) {
				continue;
			}
			for (var method : ClassUtils.getUserClass(type).getDeclaredMethods()) {
				var annotation = method.getAnnotation(McpTool.class);
				if (annotation == null) {
					continue;
				}
				var name = annotation.name().isEmpty() ? method.getName() : annotation.name();
				if (annotation.annotations().readOnlyHint()) {
					if (found.containsKey(name)) {
						throw new IllegalStateException("Two read tools are named " + name);
					}
					found.put(name, new Tool(name, annotation.description(), context.getBean(beanName), method));
				}
				else if (PROPOSABLE.contains(name)) {
					proposable.put(name, new Tool(name, annotation.description(), context.getBean(beanName), method));
				}
			}
		}
		if (proposable.size() != PROPOSABLE.size()) {
			throw new IllegalStateException("A write tool Chat may propose is missing: " + PROPOSABLE);
		}
		tools = Collections.unmodifiableMap(found);
		writes = Collections.unmodifiableMap(proposable);
	}

	/** Every read tool: its name, its description (the MCP one) and its input as a JSON schema object. */
	public List<Model.ToolSpec> specs() {
		return tools.values().stream().map(t -> new Model.ToolSpec(t.name(), t.description(), schema(t.method()))).toList();
	}

	/** The write tools Chat may propose, with the same descriptions and inputs as on {@code /mcp}. */
	public List<Model.ToolSpec> writeSpecs() {
		return writes.values().stream().map(t -> new Model.ToolSpec(t.name(), t.description(), schema(t.method()))).toList();
	}

	public boolean isWrite(String name) {
		return writes.containsKey(name);
	}

	/**
	 * Runs one read tool for this User and returns its result as JSON text. An unknown name is refused; a bad argument
	 * is an {@link ApiException}; an exception a service throws reaches the caller as itself.
	 */
	public String call(User user, String name, Map<String, Object> input) {
		return run(tools.get(name), user, input);
	}

	/**
	 * Runs one of the write tools Chat may propose, as the Chat agent of this User. Only for a Proposal the User has
	 * approved: nothing else calls it.
	 */
	public String apply(User user, String name, Map<String, Object> input) {
		return run(writes.get(name), user, input);
	}

	/**
	 * The text a Note tool would write, for the diff the User approves. It refuses what the tool would refuse (a stale
	 * version, an edit that does not apply). Only create_note, update_note and edit_note have one.
	 */
	public NotePreview preview(User user, String name, Map<String, Object> input) {
		if (!writes.containsKey(name)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "UNKNOWN_TOOL", "There is no such tool.");
		}
		return context.getBean(WriteTools.class).preview(user, name, input == null ? Map.of() : input);
	}

	/**
	 * The words for a change's card, worked out before anything changes. Null for the tools that have none (Note tools and
	 * creates) and when anything cannot be looked up: a Proposal is still stored without them, so this never throws.
	 */
	public Change describe(User user, String name, Map<String, Object> input) {
		try {
			var change = context.getBean(WriteTools.class).describe(user, name, input == null ? Map.of() : input);
			return change == null ? null
					: new Change(cap(change.subject()), cap(change.before()), cap(change.after()));
		}
		catch (RuntimeException e) {
			return null;
		}
	}

	private static String cap(String text) {
		return text == null || text.length() <= CHANGE_MAX ? text : text.substring(0, CHANGE_MAX);
	}

	private String run(Tool tool, User user, Map<String, Object> input) {
		if (tool == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "UNKNOWN_TOOL", "There is no such tool.");
		}
		var transport = McpConfig.context(new Agent(user, "Chat"));
		var arguments = arguments(tool.method(), transport, input == null ? Map.of() : input);
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
				// The parameterized type, so a List<TextEdit> becomes TextEdits and not maps.
				arguments[i] = JSON.convertValue(value, JSON.constructType(param.getParameterizedType()));
			}
			catch (RuntimeException e) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", param.getName() + " is not valid.");
			}
		}
		return arguments;
	}

}
