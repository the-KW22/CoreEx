package com.coreex.mcp;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.assets.AssetService;
import com.coreex.common.ApiException;
import com.coreex.folders.Folder;
import com.coreex.folders.FolderService;
import com.coreex.items.Item;
import com.coreex.items.ItemService;
import com.coreex.notes.Note;
import com.coreex.notes.NoteService;
import com.coreex.tags.Tag;
import com.coreex.tags.TagColour;
import com.coreex.tags.TagService;
import com.coreex.tokens.Agent;
import com.coreex.trash.TrashService;

import io.modelcontextprotocol.common.McpTransportContext;

/**
 * What an Agent can change. Like {@link ReadTools}, every tool goes through a feature's service with the calling
 * User's id, so the REST API's rules apply (ADR 0007). Nothing here removes anything for good: the Trash is as far as
 * an Agent can go, and the User can restore from it.
 */
@Component
class WriteTools {

	record NoteSaved(UUID id, String title, int version, Instant updatedAt) {
	}

	record TextEdit(@McpToolParam(description = "Text that appears exactly once in the Note") String oldText,
			@McpToolParam(description = "What to put in its place; empty removes the text") String newText) {
	}

	record Done(UUID id, String result) {
	}

	record TagSaved(UUID id, String name, String colour) {
	}

	record ItemTags(UUID id, List<ReadTools.TagRef> tags) {
	}

	record AssetSaved(UUID id, String title, String description) {
	}

	private static final String TRASH_HINT = " Use restore to bring it back.";

	private final ItemService items;

	private final NoteService notes;

	private final AssetService assets;

	private final FolderService folders;

	private final TagService tagService;

	private final TrashService trash;

	WriteTools(ItemService items, NoteService notes, AssetService assets, FolderService folders, TagService tagService,
			TrashService trash) {
		this.items = items;
		this.notes = notes;
		this.assets = assets;
		this.folders = folders;
		this.tagService = tagService;
		this.trash = trash;
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "create_note", description = "Create a new Note. Start the Markdown with a '# Title' line, which is also the Note's title unless you pass one. Write [[Exact Title]] to link to another Item. Returns the id and the version (1); keep the version to edit the Note later.")
	NoteSaved createNote(McpTransportContext context,
			@McpToolParam(required = false, description = "The title; by default the first '# Heading' line of the Markdown") String title,
			@McpToolParam(description = "The Note's text in Markdown") String markdown,
			@McpToolParam(required = false, description = "The Folder to put it in (an id from list_folders); by default the top level") UUID folderId,
			@McpToolParam(required = false, description = "Tag names to put on it; missing Tags are created") List<String> tags) {
		var agent = McpConfig.agent(context);
		var text = Input.markdown(markdown);
		var noteTitle = Input.title(title, text, "");
		var tagNames = Input.tagNames(tags);
		var note = notes.create(agent.user().id(), folderId, noteTitle, text);
		tagNames.forEach(name -> tagService.attach(agent.user().id(), note.id(), name));
		items.recordAgentEdit(agent.user().id(), note.id(), agent.tokenName());
		return saved(note);
	}

	@McpTool(name = "update_note", description = "Replace a Note's whole text. You must pass the version you read with get_item; if the Note changed since, nothing is saved and you get a conflict, so read it again. Prefer edit_note for a small change. A first line '# Heading' becomes the title unless you pass one.")
	NoteSaved updateNote(McpTransportContext context, @McpToolParam(description = "The Note's id") UUID id,
			@McpToolParam(description = "The version from get_item") int version,
			@McpToolParam(description = "The new text in Markdown") String markdown,
			@McpToolParam(required = false, description = "A new title; by default the first '# Heading' line, else the current title") String title) {
		var agent = McpConfig.agent(context);
		var text = Input.markdown(markdown);
		var current = notes.get(agent.user().id(), id);
		return save(agent, current, Input.title(title, text, current.title()), text, version);
	}

	@McpTool(name = "edit_note", description = "Change part of a Note by replacing exact pieces of its text, in the order given. Each oldText must appear exactly once at its turn, or nothing is changed; add surrounding words to make it unique. You must pass the version you read with get_item. Use this for small changes; it cannot touch anything you did not name.")
	NoteSaved editNote(McpTransportContext context, @McpToolParam(description = "The Note's id") UUID id,
			@McpToolParam(description = "The version from get_item") int version,
			@McpToolParam(description = "The replacements, applied in order") List<TextEdit> edits) {
		var agent = McpConfig.agent(context);
		if (edits == null || edits.isEmpty()) {
			throw Input.invalid("Give at least one edit.");
		}
		var current = notes.get(agent.user().id(), id);
		if (current.version() != version) {
			throw conflict();
		}
		var text = current.body();
		for (int i = 0; i < edits.size(); i++) {
			var oldText = edits.get(i).oldText();
			if (oldText == null || oldText.isEmpty()) {
				throw Input.invalid("Edit " + (i + 1) + ": oldText must not be empty.");
			}
			var at = text.indexOf(oldText);
			if (at < 0) {
				throw Input.invalid("Edit " + (i + 1) + ": the text to replace was not found. Nothing was changed.");
			}
			if (text.indexOf(oldText, at + 1) >= 0) {
				throw Input.invalid("Edit " + (i + 1) + ": the text to replace appears more than once. Add words around it to make it unique. Nothing was changed.");
			}
			var newText = edits.get(i).newText() == null ? "" : edits.get(i).newText();
			text = text.substring(0, at) + newText + text.substring(at + oldText.length());
		}
		text = Input.markdown(text);
		return save(agent, current, Input.title(null, text, current.title()), text, version);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "create_folder", description = "Create a Folder, at the top level or inside another Folder.")
	ReadTools.FolderInfo createFolder(McpTransportContext context,
			@McpToolParam(description = "The Folder's name") String name,
			@McpToolParam(required = false, description = "The parent Folder (an id from list_folders); by default the top level") UUID parentId) {
		var user = McpConfig.agent(context).user();
		return info(user.id(), folders.create(user.id(), parentId, Input.required("name", name, Input.TITLE_MAX)));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "rename_folder", description = "Rename a Folder.")
	ReadTools.FolderInfo renameFolder(McpTransportContext context, @McpToolParam(description = "The Folder's id") UUID id,
			@McpToolParam(description = "The new name") String name) {
		var user = McpConfig.agent(context).user();
		return info(user.id(), folders.rename(user.id(), id, Input.required("name", name, Input.TITLE_MAX)));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "move_folder", description = "Move a Folder, with everything in it, inside another Folder or to the top level. A Folder cannot go inside itself or one of its own subfolders.")
	ReadTools.FolderInfo moveFolder(McpTransportContext context, @McpToolParam(description = "The Folder's id") UUID id,
			@McpToolParam(required = false, description = "The new parent Folder; leave out for the top level") UUID parentId) {
		var user = McpConfig.agent(context).user();
		return info(user.id(), folders.move(user.id(), id, parentId));
	}

	@McpTool(name = "trash_folder", description = "Move a Folder to the Trash with its subfolders and the Items in them. They stay there 30 days; restore brings them back.")
	Done trashFolder(McpTransportContext context, @McpToolParam(description = "The Folder's id") UUID id) {
		folders.delete(McpConfig.agent(context).user().id(), id);
		return new Done(id, "Moved to the Trash." + TRASH_HINT);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "create_tag", description = "Create a Tag. You rarely need this: create_note and set_tags create missing Tags for you.")
	TagSaved createTag(McpTransportContext context, @McpToolParam(description = "The Tag's name") String name,
			@McpToolParam(required = false, description = "gray, red, orange, yellow, green, teal, blue or pink; by default chosen from the name") TagColour colour) {
		var user = McpConfig.agent(context).user();
		var tag = tagService.create(user.id(), Input.required("name", name, Input.TAG_MAX));
		return saved(colour == null ? tag : tagService.setColour(user.id(), tag.id(), colour));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "rename_tag", description = "Rename a Tag everywhere it is used.")
	TagSaved renameTag(McpTransportContext context, @McpToolParam(description = "The Tag's id (from list_tags)") UUID id,
			@McpToolParam(description = "The new name") String name) {
		var user = McpConfig.agent(context).user();
		return saved(tagService.rename(user.id(), id, Input.required("name", name, Input.TAG_MAX)));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "set_tag_colour", description = "Set a Tag's colour.")
	TagSaved setTagColour(McpTransportContext context, @McpToolParam(description = "The Tag's id (from list_tags)") UUID id,
			@McpToolParam(required = false, description = "gray, red, orange, yellow, green, teal, blue or pink; leave out for automatic") TagColour colour) {
		var user = McpConfig.agent(context).user();
		return saved(tagService.setColour(user.id(), id, colour));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "set_tags", description = "Make an Item's Tags exactly this list: missing Tags are added (and created if they do not exist), others are taken off. The Tags themselves are kept. Pass the full list you want, not only the new ones.")
	ItemTags setTags(McpTransportContext context, @McpToolParam(description = "The Item's id") UUID id,
			@McpToolParam(description = "All the Tag names the Item should have") List<String> tags) {
		var userId = McpConfig.agent(context).user().id();
		var wanted = Input.tagNames(tags);
		items.requireLive(userId, id);
		var current = tagService.forItem(userId, id);
		var wantedKeys = wanted.stream().map(WriteTools::key).toList();
		current.stream().filter(t -> !wantedKeys.contains(key(t.name()))).forEach(t -> tagService.detach(userId, id, t.id()));
		var haveKeys = current.stream().map(t -> key(t.name())).toList();
		wanted.stream().filter(n -> !haveKeys.contains(key(n))).forEach(n -> tagService.attach(userId, id, n));
		return new ItemTags(id,
				tagService.forItem(userId, id).stream().map(t -> new ReadTools.TagRef(t.id(), t.name())).toList());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "move_item", description = "Move a Note or Asset into a Folder, or to the top level.")
	Done moveItem(McpTransportContext context, @McpToolParam(description = "The Item's id") UUID id,
			@McpToolParam(required = false, description = "The Folder (an id from list_folders); leave out for the top level") UUID folderId) {
		items.move(McpConfig.agent(context).user().id(), id, folderId);
		return new Done(id, "Moved.");
	}

	@McpTool(name = "trash_item", description = "Move a Note or Asset to the Trash. It stays there 30 days; restore brings it back.")
	Done trashItem(McpTransportContext context, @McpToolParam(description = "The Item's id") UUID id) {
		var user = McpConfig.agent(context).user();
		var item = items.findLive(user.id(), List.of(id)).stream().findFirst()
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Item."));
		if (item.type() == Item.Type.NOTE) {
			notes.delete(user.id(), id);
		}
		else {
			assets.delete(user, id);
		}
		return new Done(id, "Moved to the Trash." + TRASH_HINT);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "restore", description = "Bring a Note, Asset or Folder back from the Trash (see list_trash). A Folder returns with what was deleted with it; an Item also brings back the Folders it was in.")
	Done restore(McpTransportContext context, @McpToolParam(description = "The id from list_trash") UUID id) {
		var userId = McpConfig.agent(context).user().id();
		try {
			trash.restoreItem(userId, id);
		}
		catch (ApiException e) {
			if (e.status() != HttpStatus.NOT_FOUND) {
				throw e;
			}
			trash.restoreFolder(userId, id);
		}
		return new Done(id, "Restored.");
	}

	@McpTool(name = "update_asset", description = "Change an Asset's title or description. The file itself cannot be changed. Leave out what should stay as it is.")
	AssetSaved updateAsset(McpTransportContext context, @McpToolParam(description = "The Asset's id") UUID id,
			@McpToolParam(required = false, description = "The new title") String title,
			@McpToolParam(required = false, description = "The new description") String description) {
		var agent = McpConfig.agent(context);
		var current = assets.get(agent.user(), id);
		var newTitle = title == null ? current.title() : Input.required("title", title, Input.TITLE_MAX);
		var newDescription = description == null ? current.description()
				: Input.optional("description", description, Input.DESCRIPTION_MAX);
		var asset = assets.update(agent.user(), id, newTitle, newDescription);
		items.recordAgentEdit(agent.user().id(), id, agent.tokenName());
		return new AssetSaved(asset.id(), asset.title(), asset.description());
	}

	private NoteSaved save(Agent agent, Note current, String title, String text, int version) {
		var note = notes.save(agent.user().id(), current.id(), title, text, version);
		items.recordAgentEdit(agent.user().id(), note.id(), agent.tokenName());
		return saved(note);
	}

	private ReadTools.FolderInfo info(UUID userId, Folder folder) {
		return new ReadTools.FolderInfo(folder.id(), folder.parentId(), folder.name(),
				folders.paths(userId).get(folder.id()), folder.itemCount());
	}

	private static NoteSaved saved(Note note) {
		return new NoteSaved(note.id(), note.title(), note.version(), note.updatedAt());
	}

	private static TagSaved saved(Tag tag) {
		return new TagSaved(tag.id(), tag.name(), tag.colour() == null ? null : tag.colour().name());
	}

	private static String key(String tagName) {
		return tagName.toLowerCase(Locale.ROOT);
	}

	private static ApiException conflict() {
		return new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
				"This Note was changed somewhere else since you read it. Read it again with get_item and redo your change.");
	}

}
