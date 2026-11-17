package com.coreex.resumes;

import java.util.List;
import java.util.UUID;
import java.time.Instant;
import java.time.OffsetDateTime;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;

import io.swagger.v3.oas.annotations.media.Schema;
import tools.jackson.databind.json.JsonMapper;

@Service
public class CoverLetterService {

	public record Letter(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) CoverLetterDocument document,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID linkedResumeId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId) { }
	record CoverLetterVersion(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) String name,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) CoverLetterDocument document,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant savedAt) { }

	private final JdbcClient jdbc;
	private final ResumeService resumes;
	private final ResumeRepository resumeRepository;
	private final ResumeVersionProperties versionProperties;
	private final JsonMapper json = JsonMapper.builder().build();

	CoverLetterService(JdbcClient jdbc, ResumeService resumes, ResumeRepository resumeRepository, ResumeVersionProperties versionProperties) {
		this.jdbc = jdbc;
		this.resumes = resumes;
		this.resumeRepository = resumeRepository;
		this.versionProperties = versionProperties;
	}

	private static ApiException missing() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Cover Letter not found.");
	}

	public Letter get(UUID owner, UUID id) {
		return jdbc.sql("""
				select i.id, i.title, i.folder_id, c.document::text as document, c.version, c.linked_resume_id
				from items i join cover_letter_contents c on c.item_id = i.id
				where i.id = :id and i.owner_id = :owner and i.type = 'COVER_LETTER' and i.deleted_at is null
				""").param("id", id).param("owner", owner)
				.query((rs, n) -> new Letter(rs.getObject("id", UUID.class), rs.getString("title"),
						json.readValue(rs.getString("document"), CoverLetterDocument.class), rs.getInt("version"),
						rs.getObject("linked_resume_id", UUID.class), rs.getObject("folder_id", UUID.class))).optional().orElseThrow(CoverLetterService::missing);
	}

	public List<Letter> list(UUID owner) {
		return jdbc.sql("""
				select i.id, i.title, i.folder_id, c.document::text as document, c.version, c.linked_resume_id
				from items i join cover_letter_contents c on c.item_id = i.id
				where i.owner_id = :owner and i.type = 'COVER_LETTER' and i.deleted_at is null
				order by i.updated_at desc, i.id
				""").param("owner", owner).query((rs, n) -> new Letter(rs.getObject("id", UUID.class), rs.getString("title"),
						json.readValue(rs.getString("document"), CoverLetterDocument.class), rs.getInt("version"),
						rs.getObject("linked_resume_id", UUID.class), rs.getObject("folder_id", UUID.class))).list();
	}

	@Transactional
	public Letter create(UUID owner, String title, UUID resumeId, CoverLetterDocument imported) {
		return create(owner, null, title, resumeId, imported);
	}

	/**
	 * With an {@code id} the caller made up, a repeated request returns the letter as stored instead of making a second
	 * one; an id that is someone else's is refused with the same answer as a missing one.
	 */
	@Transactional
	public Letter create(UUID owner, UUID wantedId, String title, UUID resumeId, CoverLetterDocument imported) {
		if (wantedId != null) {
			// shortcut: check-then-insert, so two simultaneous retries can still collide on the key; fine for one Agent, add a unique-violation catch if not.
			var taken = jdbc.sql("select owner_id, type from items where id = :id").param("id", wantedId)
					.query((rs, n) -> rs.getObject("owner_id", UUID.class).equals(owner) && rs.getString("type").equals("COVER_LETTER"))
					.optional();
			if (taken.isPresent()) {
				if (!taken.get()) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "That id cannot be used for a new Cover Letter.");
				return get(owner, wantedId);
			}
		}
		var document = new CoverLetterDocument(null, null, null, null, null, null, null);
		if (resumeId != null) {
			// Serialize the snapshot with Resume saves so a concurrent edit cannot leave a newly linked letter stale.
			jdbc.sql("""
					select c.item_id from resume_contents c join items i on i.id = c.item_id
					where i.id = :id and i.owner_id = :owner and i.type = 'RESUME' and i.deleted_at is null for update of c
					""").param("id", resumeId).param("owner", owner).query(UUID.class).optional().orElseThrow(CoverLetterService::missing);
			var source = resumes.get(owner, resumeId).document();
			document = document.withSenderAndDesign(source.basics(), source.metadata());
		}
		var id = jdbc.sql("insert into items (id, owner_id, type, title) values (coalesce(:id, gen_random_uuid()), :owner, 'COVER_LETTER', :title) returning id")
				.param("id", wantedId).param("owner", owner).param("title", title).query(UUID.class).single();
		jdbc.sql("insert into cover_letter_contents (item_id, linked_resume_id, document) values (:id, :resume, :document::jsonb)")
				.param("id", id).param("resume", resumeId).param("document", json.writeValueAsString(document)).update();
		return imported == null ? get(owner, id) : save(owner, id, title, 1, imported);
	}

	@Transactional
	Letter save(UUID owner, UUID id, String title, int version, CoverLetterDocument document) {
		return save(owner, id, title, version, document, false);
	}

	/** An Agent's save: the same checks as any save, and the document it replaces is always kept as a version. */
	@Transactional
	public Letter saveByAgent(UUID owner, UUID id, String title, int version, CoverLetterDocument document) {
		return save(owner, id, title, version, document, true);
	}

	private Letter save(UUID owner, UUID id, String title, int version, CoverLetterDocument document, boolean keepOld) {
		var existing = get(owner, id);
		var cleaned = document.clean();
		if (existing.linkedResumeId() == null && !cleaned.sender().photo().assetId().isEmpty()
				&& !cleaned.sender().photo().assetId().equals(existing.document().sender().photo().assetId())) {
			try {
				if (!resumeRepository.isImageAsset(owner, UUID.fromString(cleaned.sender().photo().assetId()))) throw new IllegalArgumentException();
			}
			catch (IllegalArgumentException e) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Choose one of your image Assets.");
			}
		}
		var serialised = json.writeValueAsString(cleaned);
		if (serialised.length() > 1_000_000 || serialised.contains("\\u0000") || !ResumeCss.problems(cleaned.design().customCss()).isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "The Cover Letter contains invalid content or style.");
		}
		jdbc.sql("""
				insert into cover_letter_versions (owner_id, item_id, title, document, saved_at)
				select i.owner_id, i.id, i.title, c.document, i.updated_at from items i
				join cover_letter_contents c on c.item_id = i.id
				where i.id = :id and i.owner_id = :owner and i.deleted_at is null and c.version = :version and c.plain_text <> ''
				and (:always or not exists (select 1 from cover_letter_versions v where v.item_id = i.id
				  and v.saved_at > i.updated_at - make_interval(secs => :gap)))
				""").param("id", id).param("owner", owner).param("version", version).param("always", keepOld).param("gap", versionProperties.gap().toSeconds()).update();
		var updated = jdbc.sql("""
				update cover_letter_contents c set document = case when c.linked_resume_id is null then :doc::jsonb
				else jsonb_set(jsonb_set(:doc::jsonb, '{sender}', c.document->'sender'), '{design}', c.document->'design') end,
				plain_text = :plain, markdown = :markdown, version = c.version + 1
				from items i where c.item_id = i.id and i.id = :id and i.owner_id = :owner
				and i.type = 'COVER_LETTER' and i.deleted_at is null and c.version = :version
				""").param("doc", serialised).param("plain", cleaned.plain()).param("markdown", cleaned.markdown())
				.param("id", id).param("owner", owner).param("version", version).update();
		if (updated == 0) throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "This Cover Letter changed elsewhere.");
		jdbc.sql("""
				delete from cover_letter_versions where item_id = :id and owner_id = :owner and name is null
				and (saved_at < now() - make_interval(secs => :retention) or id not in
				  (select id from cover_letter_versions where item_id = :id and name is null order by saved_at desc, id limit :keep))
				""").param("id", id).param("owner", owner).param("retention", versionProperties.retention().toSeconds())
				.param("keep", versionProperties.keep()).update();
		jdbc.sql("update items set title = :title, updated_at = now() where id = :id and owner_id = :owner")
				.param("title", title).param("id", id).param("owner", owner).update();
		return get(owner, id);
	}

	Letter acceptDraft(UUID owner, UUID id, String body, int version) {
		var letter = get(owner, id);
		return save(owner, id, letter.title(), version, letter.document().withBody(body), true);
	}

	@Transactional
	Letter unlink(UUID owner, UUID id, int version) {
		get(owner, id);
		var updated = jdbc.sql("""
				update cover_letter_contents c set linked_resume_id = null, version = c.version + 1
				from items i where c.item_id = i.id and i.id = :id and i.owner_id = :owner and i.deleted_at is null and c.version = :version
				""").param("id", id).param("owner", owner).param("version", version).update();
		if (updated == 0) throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "This Cover Letter changed elsewhere.");
		return get(owner, id);
	}

	List<CoverLetterVersion> versions(UUID owner, UUID id) {
		get(owner, id);
		return jdbc.sql("""
				select id, title, name, saved_at from cover_letter_versions
				where item_id = :id and owner_id = :owner order by saved_at desc, id
				""").param("id", id).param("owner", owner).query((rs, n) -> new CoverLetterVersion(rs.getObject("id", UUID.class),
						rs.getString("title"), rs.getString("name"), null,
						rs.getObject("saved_at", OffsetDateTime.class).toInstant())).list();
	}

	CoverLetterVersion version(UUID owner, UUID id, UUID versionId) {
		get(owner, id);
		return jdbc.sql("""
				select id, title, name, document::text as document, saved_at from cover_letter_versions
				where item_id = :id and owner_id = :owner and id = :version
				""").param("id", id).param("owner", owner).param("version", versionId)
				.query((rs, n) -> new CoverLetterVersion(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("name"),
						json.readValue(rs.getString("document"), CoverLetterDocument.class), rs.getObject("saved_at", OffsetDateTime.class).toInstant()))
				.optional().orElseThrow(CoverLetterService::missing);
	}

	@Transactional
	CoverLetterVersion nameCurrent(UUID owner, UUID id, String name) {
		get(owner, id);
		var versionId = jdbc.sql("""
				insert into cover_letter_versions (owner_id, item_id, title, document, name, saved_at)
				select i.owner_id, i.id, i.title, c.document, :name, i.updated_at
				from items i join cover_letter_contents c on c.item_id = i.id
				where i.id = :id and i.owner_id = :owner and i.deleted_at is null returning id
				""").param("id", id).param("owner", owner).param("name", name.strip()).query(UUID.class).single();
		return version(owner, id, versionId);
	}

	@Transactional
	Letter restore(UUID owner, UUID id, UUID versionId, int seenVersion) {
		var found = version(owner, id, versionId);
		return save(owner, id, found.title(), seenVersion, found.document(), true);
	}

	public void trash(UUID owner, UUID id) {
		var removed = jdbc.sql("""
				update items set deleted_at = now(), trash_batch_id = gen_random_uuid()
				where id = :id and owner_id = :owner and type = 'COVER_LETTER' and deleted_at is null
				""").param("id", id).param("owner", owner).update();
		if (removed == 0) throw missing();
	}
}
