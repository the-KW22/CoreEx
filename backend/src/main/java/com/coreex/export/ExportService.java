package com.coreex.export;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.common.ApiException;
import com.coreex.export.ExportRepository.Row;
import com.coreex.folders.Folder;
import com.coreex.folders.FolderService;
import com.coreex.storage.Storage;
import com.coreex.tags.Tag;
import com.coreex.tags.TagService;

import tools.jackson.databind.json.JsonMapper;

/**
 * Writes everything a User keeps as one zip: Notes as Markdown exactly as stored, Assets as their original files,
 * in folders that mirror the Folder tree, and a manifest.json that lists every Item and anything left out. The zip is
 * written as it is made, so a big account is never held in memory whole.
 */
@Service
class ExportService {

	// A Note may be 1 MB and its text is held twice (as text and as bytes), so a batch of 25 is at most about 50 MB.
	private static final int BATCH = 25;

	private static final Dir TOP = new Dir("", null);

	/** A directory in the zip, and the Folder path the manifest shows for it. */
	private record Dir(String path, String label) {
	}

	private final ExportRepository repository;

	private final FolderService folders;

	private final TagService tags;

	private final Storage storage;

	private final Clock clock;

	private final ExportProperties properties;

	private final JsonMapper json = JsonMapper.builder().build();

	// shortcut: remembered in memory on this instance, so a second API instance would not see it. Move it to the
	// database if the API is ever run on more than one.
	private final Map<UUID, Instant> lastExport = new ConcurrentHashMap<>();

	ExportService(ExportRepository repository, FolderService folders, TagService tags, Storage storage, Clock clock,
			ExportProperties properties) {
		this.repository = repository;
		this.folders = folders;
		this.tags = tags;
		this.storage = storage;
		this.clock = clock;
		this.properties = properties;
	}

	/** Lets the User start an export, or answers 429 when they started one less than the minimum interval ago. */
	void requireDue(UUID userId) {
		var now = clock.instant();
		var allowed = new boolean[1];
		lastExport.compute(userId, (id, was) -> {
			if (was == null || !now.isBefore(was.plus(properties.minInterval()))) {
				allowed[0] = true;
				return now;
			}
			return was;
		});
		if (!allowed[0]) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "EXPORT_TOO_SOON",
					"You can export once a minute. Try again shortly.");
		}
	}

	void write(UUID ownerId, OutputStream out) throws IOException {
		var names = new ExportNames();
		var directories = directories(ownerId, names);
		var rows = repository.live(ownerId);
		var items = new ArrayList<Map<String, Object>>();
		var omitted = new ArrayList<Map<String, Object>>();
		var zip = new ZipOutputStream(out);

		for (int from = 0; from < rows.size(); from += BATCH) {
			var batch = rows.subList(from, Math.min(from + BATCH, rows.size()));
			var bodies = repository.bodies(ownerId, batch.stream().filter(r -> "NOTE".equals(r.type())).map(Row::id).toList());
			var tagsByItem = tags.forItems(ownerId, batch.stream().map(Row::id).toList());
			for (var row : batch) {
				var dir = directories.getOrDefault(row.folderId(), TOP);
				byte[] content;
				String name;
				if ("NOTE".equals(row.type())) {
					content = bodies.getOrDefault(row.id(), "").getBytes(StandardCharsets.UTF_8);
					name = names.file(dir.path(), row.title(), ".md");
				}
				else if ("APPLICATION".equals(row.type())) {
					// shortcut: Applications are listed as omitted, not exported, until #241 adds their JSON.
					omitted.add(omission(row, "Applications are not in the Export yet."));
					continue;
				}
				else {
					content = readFile(row, omitted);
					if (content == null) {
						continue;
					}
					name = names.file(dir.path(), row.title(), ExportNames.extensionFor(row.title(), row.mimeType()));
				}
				var path = dir.path().isEmpty() ? name : dir.path() + "/" + name;
				put(zip, path, row.updatedAt(), content);
				items.add(manifestItem(row, dir, path, tagsByItem.getOrDefault(row.id(), List.of())));
			}
		}

		var manifest = new LinkedHashMap<String, Object>();
		manifest.put("exportedAt", clock.instant().toString());
		manifest.put("items", items);
		manifest.put("omitted", omitted);
		put(zip, "manifest.json", clock.instant(), json.writeValueAsBytes(manifest));
		zip.finish();
		zip.flush();
	}

	/** Every live Folder's directory in the zip and its Folder path, shallow before deep, names made unique. */
	private Map<UUID, Dir> directories(UUID ownerId, ExportNames names) {
		var byParent = new HashMap<UUID, List<Folder>>();
		for (var folder : folders.list(ownerId)) {
			byParent.computeIfAbsent(folder.parentId(), k -> new ArrayList<>()).add(folder);
		}
		var directories = new HashMap<UUID, Dir>();
		place(null, TOP, byParent, names, directories);
		return directories;
	}

	private void place(UUID parent, Dir dir, Map<UUID, List<Folder>> byParent, ExportNames names,
			Map<UUID, Dir> directories) {
		var children = byParent.getOrDefault(parent, List.of()).stream()
				.sorted(Comparator.comparing((Folder f) -> f.name().toLowerCase(Locale.ROOT)).thenComparing(Folder::id))
				.toList();
		for (var folder : children) {
			var segment = names.folder(dir.path(), folder.name());
			var child = new Dir(dir.path().isEmpty() ? segment : dir.path() + "/" + segment,
					dir.label() == null ? folder.name() : dir.label() + " / " + folder.name());
			directories.put(folder.id(), child);
			place(folder.id(), child, byParent, names, directories);
		}
	}

	/** The Asset's file, read whole so a failure never leaves half a file in the zip; null (and listed) when it cannot be. */
	private byte[] readFile(Row row, List<Map<String, Object>> omitted) {
		try {
			var stream = storage.read(row.storageKey());
			if (stream.isEmpty()) {
				omitted.add(omission(row, "The file is missing from Storage."));
				return null;
			}
			try (var in = stream.get()) {
				return in.readAllBytes();
			}
		}
		catch (ApiException | IOException e) {
			omitted.add(omission(row, "The file could not be read from Storage."));
			return null;
		}
	}

	private static Map<String, Object> omission(Row row, String reason) {
		var omission = new LinkedHashMap<String, Object>();
		omission.put("id", row.id().toString());
		omission.put("title", row.title());
		omission.put("reason", reason);
		return omission;
	}

	private static Map<String, Object> manifestItem(Row row, Dir dir, String path, List<Tag> itemTags) {
		var item = new LinkedHashMap<String, Object>();
		item.put("id", row.id().toString());
		item.put("type", row.type());
		item.put("title", row.title());
		item.put("folder", dir.label());
		item.put("tags", itemTags.stream().map(tag -> {
			var entry = new LinkedHashMap<String, Object>();
			entry.put("name", tag.name());
			entry.put("colour", tag.colour() == null ? null : tag.colour().name());
			return entry;
		}).toList());
		item.put("createdAt", row.createdAt().toString());
		item.put("updatedAt", row.updatedAt().toString());
		item.put("path", path);
		if ("ASSET".equals(row.type())) {
			item.put("mimeType", row.mimeType());
			item.put("sizeBytes", row.sizeBytes());
			item.put("description", row.description());
		}
		return item;
	}

	private static void put(ZipOutputStream zip, String path, Instant time, byte[] content) throws IOException {
		var entry = new ZipEntry(path);
		entry.setTime(time.toEpochMilli());
		zip.putNextEntry(entry);
		zip.write(content);
		zip.closeEntry();
	}

}
