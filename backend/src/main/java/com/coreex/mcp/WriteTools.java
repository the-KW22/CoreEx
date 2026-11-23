package com.coreex.mcp;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.applications.ApplicationService;
import com.coreex.assets.AssetService;
import com.coreex.common.ApiException;
import com.coreex.folders.Folder;
import com.coreex.folders.FolderService;
import com.coreex.identity.User;
import com.coreex.items.Item;
import com.coreex.items.ItemService;
import com.coreex.notes.Note;
import com.coreex.notes.NoteService;
import com.coreex.resumes.ResumeService;
import com.coreex.resumes.CoverLetterService;
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

	private static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();

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

	record UploadStarted(UUID uploadId, String uploadUrl, String howToSend) {
	}

	// As AssetController's mimeType.
	private static final int MIME_MAX = 100;

	private static final String TRASH_HINT = " Use restore to bring it back.";

	private static final String TOP_LEVEL = "At the top level";

	private static final String IN_TRASH = "In the Trash";

	private static final String BACK = "Back where it was";

	private final ItemService items;

	private final NoteService notes;

	private final AssetService assets;

	private final FolderService folders;

	private final TagService tagService;

	private final TrashService trash;

	private final ApplicationService applications;

	private final ResumeService resumes;
	private final CoverLetterService letters;

	WriteTools(ItemService items, NoteService notes, AssetService assets, FolderService folders, TagService tagService,
			TrashService trash, ApplicationService applications, ResumeService resumes, CoverLetterService letters) {
		this.resumes = resumes;
		this.letters = letters;
		this.applications = applications;
		this.items = items;
		this.notes = notes;
		this.assets = assets;
		this.folders = folders;
		this.tagService = tagService;
		this.trash = trash;
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "create_note", description = "Create a new Note. Start the Markdown with a '# Title' line, which is also the Note's title unless you pass one. Write [[Exact Title]] to link to another Item. Returns the id and the version (1); keep the version to edit the Note later. Pass an id you made up (a UUID) to make a retry safe: sending the same call again returns that Note as it is, with nothing applied twice, instead of making a second one.")
	NoteSaved createNote(McpTransportContext context,
			@McpToolParam(required = false, description = "The title; by default the first '# Heading' line of the Markdown") String title,
			@McpToolParam(description = "The Note's text in Markdown") String markdown,
			@McpToolParam(required = false, description = "The Folder to put it in (an id from list_folders); by default the top level") UUID folderId,
			@McpToolParam(required = false, description = "Tag names to put on it; missing Tags are created") List<String> tags,
			@McpToolParam(required = false, description = "An id you make up (a UUID), so a retried call returns the same Note instead of making another") UUID id) {
		var agent = McpConfig.agent(context);
		var text = Input.markdown(markdown);
		var noteTitle = Input.title(title, text, "");
		var tagNames = Input.tagNames(tags);
		var made = notes.create(agent.user().id(), folderId, noteTitle, text, id);
		var note = made.note();
		// A repeated call returns the Note as it is now: its Tags and edit mark are not applied again.
		if (made.isNew()) {
			tagNames.forEach(name -> tagService.attach(agent.user().id(), note.id(), name));
			items.recordAgentEdit(agent.user().id(), note.id(), agent.tokenName());
		}
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
		var text = applyEdits(current.body(), edits);
		// As in the editor, the title follows the heading only when the edit touched the first line.
		var firstLineChanged = !text.lines().findFirst().equals(current.body().lines().findFirst());
		return save(agent, current, firstLineChanged ? Input.title(null, text, current.title()) : current.title(), text,
				version);
	}

	/** The text after the replacements, each applied in order; the first that cannot be applied cancels all of them. */
	private static String applyEdits(String original, List<TextEdit> edits) {
		var text = original;
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
		return Input.markdown(text);
	}

	/**
	 * What a Note tool would write, worked out without writing it, for Chat to show as a diff before the User approves.
	 * Refuses what the tool itself would refuse (a stale version, an edit that does not apply), so the model hears of it at
	 * once. Only create_note, update_note and edit_note have a preview.
	 */
	ToolCatalogue.NotePreview preview(User user, String tool, Map<String, Object> input) {
		return switch (tool) {
			case "create_note" -> new ToolCatalogue.NotePreview(null, null, null, Input.markdown(text(input, "markdown")));
			case "update_note" -> {
				var current = notes.get(user.id(), noteId(input));
				if (current.version() != version(input)) {
					throw conflict();
				}
				yield new ToolCatalogue.NotePreview(current.id(), current.version(), current.body(),
						Input.markdown(text(input, "markdown")));
			}
			case "edit_note" -> {
				var current = notes.get(user.id(), noteId(input));
				if (current.version() != version(input)) {
					throw conflict();
				}
				var edits = JSON.convertValue(input.get("edits"), JSON.getTypeFactory().constructCollectionType(List.class, TextEdit.class));
				if (edits == null || ((List<?>) edits).isEmpty()) {
					throw Input.invalid("Give at least one edit.");
				}
				@SuppressWarnings("unchecked")
				var list = (List<TextEdit>) edits;
				yield new ToolCatalogue.NotePreview(current.id(), current.version(), current.body(), applyEdits(current.body(), list));
			}
			default -> throw Input.invalid("This tool has no preview.");
		};
	}

	/**
	 * The words for an organising change's card, worked out before anything changes: what it is about, and where it is
	 * or its state before and after. Null for the tools that have none (Note tools and creates). Throws when a lookup
	 * fails; {@link ToolCatalogue#describe} turns that into no words.
	 */
	ToolCatalogue.Change describe(User user, String tool, Map<String, Object> input) {
		var userId = user.id();
		return switch (tool) {
			case "move_item" -> {
				var item = itemNamed(userId, input);
				yield new ToolCatalogue.Change(item.title(), place(userId, item.folderId()), place(userId, id(input, "folderId")));
			}
			case "trash_item" -> {
				var item = itemNamed(userId, input);
				yield new ToolCatalogue.Change(item.title(), place(userId, item.folderId()), IN_TRASH);
			}
			case "set_tags" -> {
				var item = itemNamed(userId, input);
				var now = tagService.forItem(userId, item.id()).stream().map(Tag::name).toList();
				var listed = input.get("tags") instanceof List<?> tags ? tags.stream().map(String::valueOf).toList() : List.<String>of();
				yield new ToolCatalogue.Change(item.title(), tagNames(now), tagNames(listed));
			}
			case "restore" -> new ToolCatalogue.Change(null, IN_TRASH, BACK);
			case "add_fact" -> new ToolCatalogue.Change(text(input, "category"), null,
					Objects.requireNonNullElse(text(input, "text"), "") + "\n“" + Objects.requireNonNullElse(text(input, "quote"), "") + "”");
			case "add_story" -> new ToolCatalogue.Change(text(input, "title"), null,
					"Situation: " + Objects.requireNonNullElse(text(input, "situation"), "") + "\nAction: "
							+ Objects.requireNonNullElse(text(input, "action"), "") + "\nResult: "
							+ Objects.requireNonNullElse(text(input, "result"), ""));
			case "move_folder", "trash_folder" -> {
				var folder = folders.requireLive(userId, id(input, "id"));
				yield new ToolCatalogue.Change(folder.name(), place(userId, folder.parentId()),
						tool.equals("trash_folder") ? IN_TRASH : place(userId, id(input, "parentId")));
			}
			case "rename_folder" -> {
				var folder = folders.requireLive(userId, id(input, "id"));
				yield new ToolCatalogue.Change("Folder", folder.name(), text(input, "name"));
			}
			case "rename_tag" -> {
				var tag = tagService.requireTag(userId, id(input, "id"));
				yield new ToolCatalogue.Change("Tag", tag.name(), text(input, "name"));
			}
			case "set_tag_colour" -> {
				var tag = tagService.requireTag(userId, id(input, "id"));
				yield new ToolCatalogue.Change(tag.name(), colour(tag.colour()), colour(input.get("colour")));
			}
			case "update_asset" -> {
				var asset = assets.get(user, id(input, "id"));
				var title = text(input, "title");
				var description = text(input, "description");
				var was = new ArrayList<String>();
				var becomes = new ArrayList<String>();
				if (title != null) {
					was.add("Title: " + asset.title());
					becomes.add("Title: " + title);
				}
				if (description != null) {
					was.add("Description: " + Objects.requireNonNullElse(asset.description(), "none"));
					becomes.add("Description: " + description);
				}
				yield new ToolCatalogue.Change(asset.title(), String.join("; ", was), String.join("; ", becomes));
			}
			default -> null;
		};
	}

	private Item itemNamed(UUID userId, Map<String, Object> input) {
		return items.findLive(userId, List.of(id(input, "id"))).stream().findFirst()
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Item."));
	}

	/** Where a Folder is: its full path, or the top level when it is none. */
	private String place(UUID userId, UUID folderId) {
		if (folderId == null) {
			return TOP_LEVEL;
		}
		var path = folders.paths(userId).get(folderId);
		if (path == null) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Folder.");
		}
		return "In the Folder “" + path + "”";
	}

	private static String tagNames(List<String> names) {
		return names.isEmpty() ? "No Tags" : String.join(", ", names);
	}

	private static String colour(Object colour) {
		return colour == null ? "Automatic" : colour.toString().toLowerCase(Locale.ROOT);
	}

	/** The id in the input under this field, or null when it is not given. */
	private static UUID id(Map<String, Object> input, String field) {
		return input.get(field) == null ? null : UUID.fromString(String.valueOf(input.get(field)));
	}

	private static String text(Map<String, Object> input, String field) {
		return input.get(field) instanceof String value ? value : null;
	}

	private static UUID noteId(Map<String, Object> input) {
		try {
			return UUID.fromString(String.valueOf(input.get("id")));
		}
		catch (IllegalArgumentException e) {
			throw Input.invalid("id is not a valid id.");
		}
	}

	private static int version(Map<String, Object> input) {
		return input.get("version") instanceof Number number ? number.intValue() : -1;
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

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "move_item", description = "Move a Note, Asset, Application or Resume into a Folder, or to the top level.")
	Done moveItem(McpTransportContext context, @McpToolParam(description = "The Item's id") UUID id,
			@McpToolParam(required = false, description = "The Folder (an id from list_folders); leave out for the top level") UUID folderId) {
		items.move(McpConfig.agent(context).user().id(), id, folderId);
		return new Done(id, "Moved.");
	}

	@McpTool(name = "trash_item", description = "Move a Note, Asset, Application or Resume to the Trash. It stays there 30 days; restore brings it back.")
	Done trashItem(McpTransportContext context, @McpToolParam(description = "The Item's id") UUID id) {
		var user = McpConfig.agent(context).user();
		var item = items.findLive(user.id(), List.of(id)).stream().findFirst()
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Item."));
		if (item.type() == Item.Type.NOTE) {
			notes.delete(user.id(), id);
		}
		else if (item.type() == Item.Type.APPLICATION) {
			applications.trash(user.id(), id);
		}
		else if (item.type() == Item.Type.RESUME) {
			resumes.trash(user.id(), id);
		}
		else if (item.type() == Item.Type.COVER_LETTER) {
			letters.trash(user.id(), id);
		}
		else {
			assets.delete(user, id);
		}
		return new Done(id, "Moved to the Trash." + TRASH_HINT);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "restore", description = "Bring a Note, Asset, Application, Resume or Folder back from the Trash (see list_trash). A Folder returns with what was deleted with it; an Item also brings back the Folders it was in.")
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

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "start_upload", description = "Step 1 of adding a file (an image or PDF) as a new Asset. Check the file's type and size and get a link to send it to: only PNG, JPEG, WebP, GIF and PDF are accepted, at most 5 MB, and it must fit the User's storage quota. Then step 2 is yours: PUT the file's bytes to uploadUrl with the header Content-Type set to the same mimeType, for example curl -X PUT -H \"Content-Type: image/png\" --data-binary @file.png \"<uploadUrl>\". Step 3: call confirm_upload with the uploadId. The Asset exists only after step 3. The link is a bearer link: anyone who has it can send a file to it until it expires, so use it right away and do not share it. Unconfirmed uploads are removed after 24 hours.")
	UploadStarted startUpload(McpTransportContext context,
			@McpToolParam(description = "The file's name, such as diagram.png; it becomes the Asset's title unless confirm_upload gives one") String filename,
			@McpToolParam(description = "image/png, image/jpeg, image/webp, image/gif or application/pdf") String mimeType,
			@McpToolParam(description = "The file's size in bytes") long sizeBytes,
			@McpToolParam(required = false, description = "The Folder to put it in (an id from list_folders); by default the top level") UUID folderId) {
		var user = McpConfig.agent(context).user();
		if (sizeBytes <= 0) {
			throw Input.invalid("sizeBytes must be more than 0.");
		}
		var type = Input.required("mimeType", mimeType, MIME_MAX);
		var upload = assets.createUpload(user, Input.required("filename", filename, Input.TITLE_MAX), type, sizeBytes,
				folderId);
		return new UploadStarted(upload.id(), upload.url().toString(),
				"PUT the file to uploadUrl with the header Content-Type: " + type + " (curl -X PUT -H \"Content-Type: "
						+ type + "\" --data-binary @FILE \"<uploadUrl>\"), then call confirm_upload with this uploadId.");
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "confirm_upload", description = "Step 3 of adding a file: after you PUT the file to the uploadUrl from start_upload, call this with its uploadId. CoreEx checks the stored file's real size and type (not what you announced) and creates the Asset. If you get 'not been uploaded yet', send the file and call this again. If the file is refused, the upload is discarded and you must start again. Give a title or description to replace the defaults (the file's name, and empty).")
	AssetSaved confirmUpload(McpTransportContext context,
			@McpToolParam(description = "The uploadId from start_upload") UUID uploadId,
			@McpToolParam(required = false, description = "The Asset's title; by default the file's name") String title,
			@McpToolParam(required = false, description = "The Asset's description") String description) {
		var agent = McpConfig.agent(context);
		// Checked before the Asset exists, so bad text does not leave an Asset behind with an error.
		var newTitle = title == null ? null : Input.required("title", title, Input.TITLE_MAX);
		var newDescription = Input.optional("description", description, Input.DESCRIPTION_MAX);
		var asset = assets.confirm(agent.user(), uploadId);
		if (newTitle != null || newDescription != null) {
			asset = assets.update(agent.user(), asset.id(), newTitle == null ? asset.title() : newTitle,
					newDescription == null ? asset.description() : newDescription);
		}
		items.recordAgentEdit(agent.user().id(), asset.id(), agent.tokenName());
		return new AssetSaved(asset.id(), asset.title(), asset.description());
	}

	private NoteSaved save(Agent agent, Note current, String title, String text, int version) {
		// keepOld: every Agent edit leaves a restore point.
		var note = notes.save(agent.user().id(), current.id(), title, text, version, true);
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
