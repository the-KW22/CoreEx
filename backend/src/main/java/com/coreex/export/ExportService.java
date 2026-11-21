package com.coreex.export;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.applications.ApplicationService;
import com.coreex.career.CareerService;
import com.coreex.career.OfferService;
import com.coreex.common.ApiException;
import com.coreex.export.ExportRepository.Row;
import com.coreex.folders.Folder;
import com.coreex.folders.FolderService;
import com.coreex.knowledge.KnowledgeService;
import com.coreex.resumes.Resume;
import com.coreex.resumes.ResumeDocument;
import com.coreex.resumes.ResumeService;
import com.coreex.resumes.CoverLetterService;
import com.coreex.storage.Storage;
import com.coreex.tags.Tag;
import com.coreex.tags.TagService;

import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Writes everything a User keeps as one zip: Notes as Markdown exactly as stored, Assets as their original files,
 * Applications and Resumes as JSON (a Resume also as Markdown and PDF), in folders that mirror the Folder tree, and a
 * manifest.json that lists every Item and anything left out. The zip is written as it is made, so a big account is
 * never held in memory whole.
 */
@Service
class ExportService {

	private static final Logger log = LoggerFactory.getLogger(ExportService.class);

	// A Note may be 1 MB and its text is held twice (as text and as bytes), so a batch of 25 is at most about 50 MB.
	private static final int BATCH = 25;

	// The photo limits the editor applies (ResumeCss and the photo picker): PNG or JPEG, and at most 5 MB.
	private static final Set<String> PHOTO_TYPES = Set.of("image/png", "image/jpeg");

	private static final long MAX_PHOTO = 5_000_000L;

	private static final Dir TOP = new Dir("", null);

	private static final String FACTS = "career/facts.json";

	private static final String OFFERS = "career/offers.json";

	private static final String RESULTS = "career/results.json";

	/** A directory in the zip, and the Folder path the manifest shows for it. */
	private record Dir(String path, String label) {
	}

	private final ExportRepository repository;

	private final FolderService folders;

	private final TagService tags;

	private final ApplicationService applications;

	private final ResumeService resumes;
	private final CoverLetterService letters;

	private final ResumePdfRenderer renderer;

	private final Storage storage;

	private final Clock clock;

	private final ExportProperties properties;

	private final OfferService offers;

	private final CareerService career;

	private final KnowledgeService knowledge;

	private final JsonMapper json = JsonMapper.builder().build();

	// shortcut: remembered in memory on this instance, so a second API instance would not see it. Move it to the
	// database if the API is ever run on more than one.
	private final Map<UUID, Instant> lastExport = new ConcurrentHashMap<>();

	ExportService(ExportRepository repository, FolderService folders, TagService tags, ApplicationService applications,
			ResumeService resumes, CoverLetterService letters, ResumePdfRenderer renderer, Storage storage, Clock clock, ExportProperties properties,
			OfferService offers, CareerService career, KnowledgeService knowledge) {
		this.repository = repository;
		this.offers = offers;
		this.career = career;
		this.knowledge = knowledge;
		this.folders = folders;
		this.tags = tags;
		this.applications = applications;
		this.resumes = resumes;
		this.letters = letters;
		this.renderer = renderer;
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
		// The career/ directory is ours: a Folder or file of the User with that name is renamed, never merged into it.
		names.folder("", "career");
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
				if ("RESUME".equals(row.type())) {
					resume(ownerId, row, dir, names, tagsByItem.getOrDefault(row.id(), List.of()), zip, items, omitted);
					continue;
				}
				if ("COVER_LETTER".equals(row.type())) {
					letter(ownerId, row, dir, names, tagsByItem.getOrDefault(row.id(), List.of()), zip, items, omitted);
					continue;
				}
				byte[] content;
				String name;
				if ("NOTE".equals(row.type())) {
					content = bodies.getOrDefault(row.id(), "").getBytes(StandardCharsets.UTF_8);
					name = names.file(dir.path(), row.title(), ".md");
				}
				else if ("APPLICATION".equals(row.type())) {
					content = applicationJson(ownerId, row, tagsByItem.getOrDefault(row.id(), List.of()));
					name = names.file(dir.path(), row.title(), ".json");
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

		put(zip, FACTS, clock.instant(), factsJson(ownerId));
		put(zip, OFFERS, clock.instant(), offersJson(ownerId));
		put(zip, RESULTS, clock.instant(), resultsJson(ownerId, rows));

		var manifest = new LinkedHashMap<String, Object>();
		manifest.put("exportedAt", clock.instant().toString());
		manifest.put("items", items);
		manifest.put("omitted", omitted);
		manifest.put("career", List.of(FACTS, OFFERS, RESULTS));
		put(zip, "manifest.json", clock.instant(), json.writeValueAsBytes(manifest));
		zip.finish();
		zip.flush();
	}

	/** Every Fact of the User once, switched-off ones too (with their status), with earlier wordings. The source key is left out. */
	// shortcut: the Facts are built in memory before they are written. Upgrade with the Offers shortcut below.
	private byte[] factsJson(UUID ownerId) {
		var all = knowledge.facts(ownerId, null, null).stream().map(view -> {
			var f = view.fact();
			var revisions = view.revisions().stream().map(r -> fields("text", r.text(), "savedAt", r.savedAt().toString())).toList();
			return fields("id", f.id().toString(), "text", f.text(), "category", f.category(), "sourceKind", f.sourceKind(),
					"sourceId", f.sourceId() == null ? null : f.sourceId().toString(), "quote", f.quote(), "status", f.status(),
					"updatedAt", f.updatedAt().toString(), "revisions", revisions);
		}).toList();
		return json.writeValueAsBytes(all);
	}

	/** Every Offer of the User once, with its earlier terms; the computed checks are left out. */
	// shortcut: the Offers are built in memory before they are written, so a User with very many holds them all at once. Upgrade to writing them row by row when that matters.
	private byte[] offersJson(UUID ownerId) {
		var all = offers.all(ownerId).stream().map(listed -> {
			var offer = listed.offer();
			var earlier = offers.versions(ownerId, offer.id()).stream()
					.map(v -> fields("version", v.version(), "savedAt", v.savedAt().toString(), "terms", v.terms())).toList();
			return fields("id", offer.id().toString(), "applicationId", offer.applicationId().toString(),
					"applicationTitle", listed.applicationTitle(), "company", listed.company(), "role", listed.role(),
					"version", offer.version(), "updatedAt", offer.updatedAt().toString(), "terms", offer.terms(),
					"versions", earlier);
		}).toList();
		return json.writeValueAsBytes(all);
	}

	/** The Career results of every live Application of the User, as one flat list. Out-of-date is left out: it is derived. */
	// shortcut: the results are built in memory before they are written, one Application's list after another. Upgrade with the Offers shortcut above.
	private byte[] resultsJson(UUID ownerId, List<Row> rows) {
		var all = new ArrayList<Map<String, Object>>();
		for (var row : rows) {
			if (!"APPLICATION".equals(row.type())) {
				continue;
			}
			for (var result : career.results(ownerId, row.id())) {
				all.add(fields("id", result.id().toString(), "applicationId", row.id().toString(), "kind", result.kind(),
						"result", result.result(), "resolution", result.resolution(), "createdAt", result.createdAt().toString()));
			}
		}
		return json.writeValueAsBytes(all);
	}

	/** An object for the JSON with its keys in the order given. A null value stays null. */
	private static Map<String, Object> fields(Object... keyValues) {
		var out = new LinkedHashMap<String, Object>();
		for (int i = 0; i < keyValues.length; i += 2) {
			out.put((String) keyValues[i], keyValues[i + 1]);
		}
		return out;
	}

	private void letter(UUID ownerId, Row row, Dir dir, ExportNames names, List<Tag> itemTags, ZipOutputStream zip,
			List<Map<String, Object>> items, List<Map<String, Object>> omitted) throws IOException {
		CoverLetterService.Letter letter;
		try { letter = letters.get(ownerId, row.id()); }
		catch (ApiException e) { return; }
		var paths = new ArrayList<String>();
		var jsonPath = pathIn(dir, names.file(dir.path(), row.title(), ".json"));
		var markdownPath = pathIn(dir, names.file(dir.path(), row.title(), ".md"));
		put(zip, jsonPath, row.updatedAt(), json.writeValueAsBytes(letter.document()));
		put(zip, markdownPath, row.updatedAt(), letter.document().markdown().getBytes(StandardCharsets.UTF_8));
		paths.add(jsonPath);
		paths.add(markdownPath);
		try {
			var doc = letter.document().asResume();
			var pdf = renderer.render(new ResumePdfRequest(doc, photoSrc(ownerId, doc), true));
			var path = pathIn(dir, names.file(dir.path(), row.title(), ".pdf"));
			put(zip, path, row.updatedAt(), pdf);
			paths.add(path);
		}
		catch (IOException | RuntimeException e) {
			log.warn("A Cover Letter's PDF was left out of an export: {}", e.getMessage());
			omitted.add(omission(row, "The PDF could not be made."));
		}
		var item = manifestItem(row, dir, jsonPath, itemTags);
		item.put("paths", paths);
		items.add(item);
	}

	/**
	 * A Resume as three files in its Folder: the document as JSON, its Markdown, and a PDF drawn by the frontend. A PDF
	 * that cannot be made is listed as omitted and the other two are still written. The Resume's manifest entry names its
	 * JSON file as "path" and every file written as "paths".
	 */
	private void resume(UUID ownerId, Row row, Dir dir, ExportNames names, List<Tag> itemTags, ZipOutputStream zip,
			List<Map<String, Object>> items, List<Map<String, Object>> omitted) throws IOException {
		Resume resume;
		try {
			resume = resumes.get(ownerId, row.id());
		}
		catch (ApiException e) {
			// Trashed between the list and this read: it is not part of the export.
			return;
		}
		var paths = new ArrayList<String>();
		var jsonPath = pathIn(dir, names.file(dir.path(), row.title(), ".json"));
		var markdownPath = pathIn(dir, names.file(dir.path(), row.title(), ".md"));
		var document = (ObjectNode) json.valueToTree(resume.document());
		document.put("kind", resume.kind().name());
		put(zip, jsonPath, row.updatedAt(), json.writeValueAsBytes(document));
		put(zip, markdownPath, row.updatedAt(), resumes.markdown(resume.document()).getBytes(StandardCharsets.UTF_8));
		paths.add(jsonPath);
		paths.add(markdownPath);
		// shortcut: each PDF is drawn one after another inside the export's response, up to 60 s each, so a User with many
		// Resumes waits for every one. Upgrade by drawing them in parallel or in a background job that writes them later.
		try {
			var pdf = renderer.render(new ResumePdfRequest(resume.document(), photoSrc(ownerId, resume.document())));
			var path = pathIn(dir, names.file(dir.path(), row.title(), ".pdf"));
			put(zip, path, row.updatedAt(), pdf);
			paths.add(path);
		}
		catch (IOException | RuntimeException e) {
			log.warn("A Resume's PDF was left out of an export: {}", e.getMessage());
			omitted.add(omission(row, "The PDF could not be made."));
		}
		var item = manifestItem(row, dir, jsonPath, itemTags);
		item.put("paths", paths);
		items.add(item);
	}

	/** The photo as the editor shows it: the User's own PNG or JPEG under 5 MB, and only when the photo is visible. */
	private String photoSrc(UUID ownerId, ResumeDocument document) throws IOException {
		var photo = document.basics().photo();
		if (photo == null || photo.assetId() == null || photo.assetId().isEmpty() || !Boolean.TRUE.equals(photo.visible())) {
			return null;
		}
		var file = repository.item(ownerId, UUID.fromString(photo.assetId())).orElse(null);
		if (file == null || file.storageKey() == null || file.sizeBytes() == null || file.sizeBytes() > MAX_PHOTO
				|| !PHOTO_TYPES.contains(file.mimeType())) {
			return null;
		}
		var stream = storage.read(file.storageKey());
		if (stream.isEmpty()) {
			return null;
		}
		try (var in = stream.get()) {
			return "data:" + file.mimeType() + ";base64," + Base64.getEncoder().encodeToString(in.readAllBytes());
		}
	}

	private static String pathIn(Dir dir, String name) {
		return dir.path().isEmpty() ? name : dir.path() + "/" + name;
	}

	/** An Application as JSON: every field and its whole timeline, with its Tags by name. */
	private byte[] applicationJson(UUID ownerId, Row row, List<Tag> itemTags) {
		var a = applications.get(ownerId, row.id());
		var out = new LinkedHashMap<String, Object>();
		out.put("id", a.id().toString());
		out.put("title", a.title());
		out.put("company", a.company());
		out.put("role", a.role());
		out.put("location", a.location());
		out.put("postingUrl", a.postingUrl());
		out.put("postingText", a.postingText());
		out.put("stage", a.stage().name());
		out.put("closeReason", a.closeReason() == null ? null : a.closeReason().name());
		out.put("appliedOn", a.appliedOn() == null ? null : a.appliedOn().toString());
		out.put("reminderOn", a.reminderOn() == null ? null : a.reminderOn().toString());
		out.put("reminderTime", a.reminderTime() == null ? null : a.reminderTime().toString());
		out.put("tags", itemTags.stream().map(Tag::name).toList());
		out.put("timeline", a.timeline().stream().map(e -> {
			var entry = new LinkedHashMap<String, Object>();
			entry.put("type", e.type());
			entry.put("stage", e.stage() == null ? null : e.stage().name());
			entry.put("at", e.at().toString());
			entry.put("seq", e.seq());
			entry.put("text", e.text());
			entry.put("kind", e.kind());
			return entry;
		}).toList());
		out.put("createdAt", a.createdAt().toString());
		out.put("updatedAt", a.updatedAt().toString());
		return json.writeValueAsBytes(out);
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
