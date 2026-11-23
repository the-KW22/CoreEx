package com.coreex.chat;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.coreex.ai.Model.ContentBlock;
import com.coreex.common.ApiException;
import com.coreex.identity.User;
import com.coreex.mcp.ToolCatalogue;

import tools.jackson.databind.json.JsonMapper;

/**
 * Proposals (issue #199, ADR 0009): when the model in a Chat calls a write tool, nothing is changed. A Proposal is stored
 * and the model is told it waits. The User approves (the same tool runs, as the Chat agent, through the same services as
 * {@code /mcp}) or rejects. A batch is approved in one transaction, so it is all or nothing. The stored tool result of each
 * Proposal is rewritten with the answer, so the next turn replays what really happened.
 */
@Service
class ChatProposals {

	private static final Logger LOG = LoggerFactory.getLogger(ChatProposals.class);

	private static final JsonMapper JSON = JsonMapper.builder().build();

	/** The tools whose Proposal has a text diff, and so an editable text. */
	private static final Set<String> NOTE_TOOLS = Set.of("create_note", "update_note", "edit_note");

	private static final int RESULT_MAX = 1_000;

	private static final int MOST_AT_ONCE = 50;

	static final String PROPOSED = "Proposed to the User. Nothing has changed yet: it waits for their approval. Do not say it "
			+ "is done. You will be told here whether it was applied or rejected.";

	private static final String REJECTED_TEXT = "The User rejected this proposal. Nothing was changed. Do not propose it again "
			+ "unless they ask.";

	private static final String REPLACED_TEXT = "Replaced by a newer proposal for the same Note. Nothing was changed.";

	/** A link to what an applied Proposal made or changed. */
	record Link(UUID id, String type, String title) {
	}

	private final ChatProposalRepository proposals;

	private final ChatRepository chats;

	private final ToolCatalogue catalogue;

	private final PlatformTransactionManager transactions;

	private final Clock clock;

	ChatProposals(ChatProposalRepository proposals, ChatRepository chats, ToolCatalogue catalogue,
			PlatformTransactionManager transactions, Clock clock) {
		this.proposals = proposals;
		this.chats = chats;
		this.catalogue = catalogue;
		this.transactions = transactions;
		this.clock = clock;
	}

	boolean handles(String tool) {
		return catalogue.isWrite(tool);
	}

	List<Proposal> list(UUID chatId) {
		return proposals.list(chatId);
	}

	List<Proposal> pendingForNote(UUID owner, UUID noteId) {
		return proposals.pendingForNote(owner, noteId);
	}

	/**
	 * Stores the Proposal for a write tool call and returns what the model is told. A Note tool is checked first, as the tool
	 * itself would (a stale version, an edit that does not apply), so the model hears of a bad one at once. A newer Proposal
	 * for a Note replaces the older pending ones.
	 */
	String propose(User owner, UUID chatId, UUID messageId, UUID batchId, ContentBlock.ToolUse use) {
		Map<String, Object> input = use.input() == null ? Map.of() : use.input();
		ToolCatalogue.NotePreview preview = NOTE_TOOLS.contains(use.name()) ? catalogue.preview(owner, use.name(), input) : null;
		var target = preview == null ? null : preview.noteId();
		var change = catalogue.describe(owner, use.name(), input);
		var now = clock.instant();
		if (target != null) {
			for (var old : proposals.replacePending(chatId, target, now)) {
				markResult(chatId, old.toolUseId(), REPLACED_TEXT);
			}
		}
		proposals.add(chatId, messageId, batchId, use.id(), use.name(), label(use.name(), input, preview), input, target,
				preview == null ? null : preview.before(), preview == null ? null : preview.after(), change, now);
		return PROPOSED;
	}

	/**
	 * Applies or rejects Proposals of the Chat. Approving runs them in order in one transaction: if one fails, none is
	 * applied and the failure reaches the caller (a stale Note is VERSION_CONFLICT). {@code edits} holds the User's own
	 * text for a Note Proposal, saved in place of the model's. Every Proposal must still be pending.
	 */
	List<Proposal> answer(User owner, UUID chatId, List<UUID> ids, boolean approve, Map<UUID, String> edits) {
		if (ids == null || ids.isEmpty() || ids.size() > MOST_AT_ONCE || ids.stream().distinct().count() != ids.size()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Give between 1 and " + MOST_AT_ONCE + " Proposals.");
		}
		var chosen = new ArrayList<Proposal>();
		for (var id : ids) {
			var found = proposals.find(chatId, id)
					.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "That Proposal does not exist."));
			if (!Proposal.PENDING.equals(found.status())) {
				throw new ApiException(HttpStatus.CONFLICT, "ALREADY_ANSWERED", "That Proposal has already been answered.");
			}
			chosen.add(found);
		}
		// In the order they were made, which is the order they are applied in.
		var order = proposals.list(chatId).stream().map(Proposal::id).toList();
		chosen.sort(Comparator.comparingInt(p -> order.indexOf(p.id())));
		var told = new LinkedHashMap<Proposal, String>();
		if (approve) {
			new TransactionTemplate(transactions).executeWithoutResult(status -> {
				for (var proposal : chosen) {
					var text = edits == null ? null : edits.get(proposal.id());
					var tool = text == null ? proposal.tool() : editedTool(proposal);
					var result = catalogue.apply(owner, tool, text == null ? proposal.input() : edited(proposal, text));
					if (!proposals.answer(proposal.id(), Proposal.APPLIED, result, clock.instant())) {
						throw new ApiException(HttpStatus.CONFLICT, "ALREADY_ANSWERED", "That Proposal has already been answered.");
					}
					told.put(proposal, "Approved by the User and applied" + (text == null ? "" : ", after they edited the text")
							+ ". Result: " + cut(result));
				}
			});
		}
		else {
			for (var proposal : chosen) {
				if (!proposals.answer(proposal.id(), Proposal.REJECTED, null, clock.instant())) {
					throw new ApiException(HttpStatus.CONFLICT, "ALREADY_ANSWERED", "That Proposal has already been answered.");
				}
				told.put(proposal, REJECTED_TEXT);
			}
		}
		told.forEach((proposal, text) -> markResult(chatId, proposal.toolUseId(), text));
		return chosen.stream().map(p -> proposals.find(chatId, p.id()).orElse(p)).toList();
	}

	/** The tool that saves a User's edited text: a Note's whole text, so an edit_note becomes an update_note. */
	private static String editedTool(Proposal proposal) {
		if (!NOTE_TOOLS.contains(proposal.tool())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "That Proposal has no text to edit.");
		}
		return "edit_note".equals(proposal.tool()) ? "update_note" : proposal.tool();
	}

	private static Map<String, Object> edited(Proposal proposal, String text) {
		var input = new HashMap<String, Object>();
		if (!"edit_note".equals(proposal.tool())) {
			input.putAll(proposal.input());
		}
		else {
			input.put("id", proposal.input().get("id"));
			input.put("version", proposal.input().get("version"));
		}
		input.put("markdown", text);
		return input;
	}

	/** What a Proposal made or changed, for a link: only Note and Asset tools return one. */
	static Optional<Link> link(Proposal proposal) {
		if (!Proposal.APPLIED.equals(proposal.status()) || proposal.result() == null) {
			return Optional.empty();
		}
		var type = NOTE_TOOLS.contains(proposal.tool()) ? "NOTE" : "update_asset".equals(proposal.tool()) ? "ASSET" : null;
		if (type == null) {
			return Optional.empty();
		}
		try {
			var tree = JSON.readTree(proposal.result());
			return Optional.of(new Link(UUID.fromString(tree.path("id").asString()), type, tree.path("title").asString()));
		}
		catch (RuntimeException e) {
			return Optional.empty();
		}
	}

	/** The words on a Proposal's card: what it would do, with the name it was given when there is one. */
	private static String label(String tool, Map<String, Object> input, ToolCatalogue.NotePreview preview) {
		return switch (tool) {
			case "create_note" -> "Create the Note " + quoted(titleOf(input, preview == null ? null : preview.after()));
			case "update_note" -> "Replace the text of " + quoted(titleOf(null, preview == null ? null : preview.before()));
			case "edit_note" -> "Edit the Note " + quoted(titleOf(null, preview == null ? null : preview.before()));
			case "update_asset" -> "Change the details of an Asset" + (text(input, "title") == null ? "" : " to " + quoted(text(input, "title")));
			case "create_folder" -> "Create the Folder " + quoted(text(input, "name"));
			case "rename_folder" -> "Rename a Folder to " + quoted(text(input, "name"));
			case "move_folder" -> "Move a Folder";
			case "trash_folder" -> "Move a Folder to the Trash";
			case "create_tag" -> "Create the Tag " + quoted(text(input, "name"));
			case "rename_tag" -> "Rename a Tag to " + quoted(text(input, "name"));
			case "set_tag_colour" -> "Set the colour of a Tag" + (text(input, "colour") == null ? "" : " to " + text(input, "colour"));
			case "set_tags" -> "Set the Tags of an Item to " + (input.get("tags") instanceof List<?> tags ? tags : "none");
			case "move_item" -> "Move an Item to a Folder";
			case "trash_item" -> "Move an Item to the Trash";
			case "restore" -> "Restore an Item from the Trash";
			default -> tool;
		};
	}

	private static String titleOf(Map<String, Object> input, String markdown) {
		var given = input == null ? null : text(input, "title");
		if (given != null) {
			return given;
		}
		var heading = markdown == null ? null : markdown.lines().filter(l -> l.startsWith("# ")).findFirst().orElse(null);
		return heading == null ? "Untitled" : heading.substring(2).strip();
	}

	private static String text(Map<String, Object> input, String field) {
		return input.get(field) instanceof String value && !value.isBlank() ? value : null;
	}

	private static String quoted(String name) {
		return name == null ? "" : "“" + (name.length() > 80 ? name.substring(0, 80) + "…" : name) + "”";
	}

	private static String cut(String result) {
		return result.length() <= RESULT_MAX ? result : result.substring(0, RESULT_MAX) + "…";
	}

	/** Rewrites the stored result of a tool call, so a later turn replays the answer. A missing one is left alone. */
	private void markResult(UUID chatId, String toolUseId, String text) {
		try {
			for (var row : chats.messages(chatId)) {
				var changed = false;
				var blocks = new ArrayList<ContentBlock>();
				for (var block : row.blocks()) {
					if (block instanceof ContentBlock.ToolResult result && result.toolUseId().equals(toolUseId)) {
						blocks.add(new ContentBlock.ToolResult(toolUseId, text, false));
						changed = true;
					}
					else {
						blocks.add(block);
					}
				}
				if (changed) {
					chats.setMessage(row.id(), List.copyOf(blocks), row.status(), row.errorCode());
					return;
				}
			}
		}
		catch (RuntimeException e) {
			LOG.warn("A Proposal's answer could not be written to the Chat: {}", e.getClass().getSimpleName());
		}
	}

}
