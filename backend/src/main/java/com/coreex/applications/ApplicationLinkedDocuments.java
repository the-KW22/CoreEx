package com.coreex.applications;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;
import com.coreex.resumes.CoverLetterService;
import com.coreex.resumes.Resume;
import com.coreex.resumes.ResumeCheckScore;
import com.coreex.resumes.ResumeKind;
import com.coreex.resumes.ResumeService;

import io.swagger.v3.oas.annotations.media.Schema;
import tools.jackson.databind.json.JsonMapper;

@Service
class ApplicationLinkedDocuments {

	enum Kind { RESUME, COVER_LETTER }

	record LinkedDocument(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Kind kind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID itemId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) String sentTitle,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) Map<String, Object> sentDocument,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) Integer sentVersion,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) Integer checkScore,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) Instant sentAt) { }

	record LinkedApplication(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean sent) { }

	record GroupedDocument(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID applicationId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String applicationTitle,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Kind kind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID itemId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String documentTitle,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean sent) { }

	private final JdbcClient jdbc;
	private final ResumeService resumes;
	private final CoverLetterService letters;
	private final Clock clock;
	private final JsonMapper json = JsonMapper.builder().build();

	ApplicationLinkedDocuments(JdbcClient jdbc, ResumeService resumes, CoverLetterService letters, Clock clock) {
		this.jdbc = jdbc; this.resumes = resumes; this.letters = letters; this.clock = clock;
	}

	private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Item."); }
	private static ApiException sent() { return new ApiException(HttpStatus.CONFLICT, "DOCUMENT_SENT", "A sent document cannot be changed."); }

	/** Locks the Application so linking and moving to Applied are serialized. */
	private boolean lockApplication(UUID owner, UUID id) {
		return jdbc.sql("""
				select c.applied_on is not null from application_contents c join items i on i.id = c.item_id
				where i.id = :id and i.owner_id = :owner and i.type = 'APPLICATION' and i.deleted_at is null for update of c
				""").param("owner", owner).param("id", id).query(Boolean.class).optional().orElseThrow(ApplicationLinkedDocuments::missing);
	}

	List<LinkedDocument> list(UUID owner, UUID id) {
		var exists = jdbc.sql("select count(*) from items where id = :id and owner_id = :owner and type = 'APPLICATION' and deleted_at is null")
				.param("id", id).param("owner", owner).query(Long.class).single();
		if (exists == 0) throw missing();
		return jdbc.sql("""
				select kind, item_id, sent_title, sent_document::text as document, sent_version, check_score, sent_at
				from application_linked_documents where owner_id = :owner and application_id = :id order by kind
				""").param("owner", owner).param("id", id).query((rs, n) -> new LinkedDocument(Kind.valueOf(rs.getString("kind")),
						rs.getObject("item_id", UUID.class), rs.getString("sent_title"),
						rs.getString("document") == null ? null : readDocument(rs.getString("document")),
						rs.getObject("sent_version", Integer.class), rs.getObject("check_score", Integer.class),
						rs.getObject("sent_at", OffsetDateTime.class) == null ? null : rs.getObject("sent_at", OffsetDateTime.class).toInstant())).list();
	}

	@SuppressWarnings("unchecked")
	private Map<String, Object> readDocument(String value) {
		return json.readValue(value, Map.class);
	}

	List<LinkedApplication> forItem(UUID owner, UUID id) {
		var exists = jdbc.sql("select count(*) from items where id = :id and owner_id = :owner and type in ('RESUME', 'COVER_LETTER') and deleted_at is null")
				.param("owner", owner).param("id", id).query(Long.class).single();
		if (exists == 0) throw missing();
		return jdbc.sql("""
				select i.id, i.title, d.sent_at is not null as sent from application_linked_documents d
				join items i on i.id = d.application_id
				where d.owner_id = :owner and d.item_id = :id and i.owner_id = :owner and i.deleted_at is null
				order by i.updated_at desc, i.id
				""").param("owner", owner).param("id", id).query((rs, n) -> new LinkedApplication(rs.getObject("id", UUID.class),
						rs.getString("title"), rs.getBoolean("sent"))).list();
	}

	List<GroupedDocument> grouped(UUID owner) {
		return jdbc.sql("""
				select a.id as app_id, a.title as app_title, d.kind,
				  case when i.deleted_at is null then i.id else null end as item_id,
				  coalesce(i.title, d.sent_title, 'Unavailable') as document_title, d.sent_at is not null as sent
				from application_linked_documents d join items a on a.id = d.application_id
				left join items i on i.id = d.item_id and i.owner_id = :owner
				where d.owner_id = :owner and a.owner_id = :owner and a.deleted_at is null
				order by lower(a.title), a.id, d.kind
				""").param("owner", owner).query((rs, n) -> new GroupedDocument(rs.getObject("app_id", UUID.class),
						rs.getString("app_title"), Kind.valueOf(rs.getString("kind")), rs.getObject("item_id", UUID.class),
						rs.getString("document_title"), rs.getBoolean("sent"))).list();
	}

	@Transactional
	List<LinkedDocument> link(UUID owner, UUID app, Kind kind, UUID item, boolean replaceExisting) {
		var applied = lockApplication(owner, app);
		var old = list(owner, app).stream().filter(d -> d.kind() == kind).findFirst();
		if (old.isPresent() && old.get().sentAt() != null) {
			if (item != null && item.equals(old.get().itemId())) return list(owner, app);
			throw sent();
		}
		if (!replaceExisting && old.isPresent() && old.get().itemId() != null && !old.get().itemId().equals(item)) {
			throw new ApiException(HttpStatus.CONFLICT, "DOCUMENT_LINKED", "The Application already has a linked document of this type.");
		}
		if (item == null) {
			jdbc.sql("delete from application_linked_documents where owner_id = :owner and application_id = :app and kind = :kind")
					.param("owner", owner).param("app", app).param("kind", kind.name()).update();
			return list(owner, app);
		}
		if (kind == Kind.RESUME) {
			if (resumes.get(owner, item).kind() == ResumeKind.CV) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "A CV cannot be linked to an Application. Make a Resume from it first.");
		}
		else letters.get(owner, item);
		jdbc.sql("""
				insert into application_linked_documents (owner_id, application_id, kind, item_id)
				values (:owner, :app, :kind, :item)
				on conflict (application_id, kind) do update set item_id = excluded.item_id
				""").param("owner", owner).param("app", app).param("kind", kind.name()).param("item", item).update();
		if (applied) snapshot(owner, app);
		return list(owner, app);
	}

	/** Called after a successful Applied transition inside its transaction. */
	void snapshot(UUID owner, UUID app) {
		for (var link : list(owner, app)) {
			if (link.sentAt() != null || link.itemId() == null) continue;
			var table = link.kind() == Kind.RESUME ? "resume_contents" : "cover_letter_contents";
			jdbc.sql("select c.item_id from " + table + " c join items i on i.id = c.item_id where i.id = :id and i.owner_id = :owner and i.deleted_at is null for share of c, i")
					.param("id", link.itemId()).param("owner", owner).query(UUID.class).optional().orElseThrow(ApplicationLinkedDocuments::missing);
			String title; Object document; int version; Integer score = null;
			if (link.kind() == Kind.RESUME) {
				var current = resumes.get(owner, link.itemId());
				title = current.title(); document = current.document(); version = current.version();
				score = ResumeCheckScore.score(current.document(), clock.instant().atZone(ZoneOffset.UTC).getYear());
			}
			else {
				var current = letters.get(owner, link.itemId());
				title = current.title(); document = current.document(); version = current.version();
			}
			jdbc.sql("""
					update application_linked_documents set sent_title = :title, sent_document = :document::jsonb,
					  sent_version = :version, check_score = :score, sent_at = :at
					where owner_id = :owner and application_id = :app and kind = :kind and sent_at is null
					""").param("title", title).param("document", json.writeValueAsString(document)).param("version", version)
					.param("score", score).param("at", java.sql.Timestamp.from(clock.instant())).param("owner", owner)
					.param("app", app).param("kind", link.kind().name()).update();
		}
	}

	@Transactional
	Resume copyForJob(UUID owner, UUID app, UUID source, UUID request) {
		lockApplication(owner, app);
		jdbc.sql("select pg_advisory_xact_lock(hashtextextended(:key, 0))").param("key", owner + ":" + request).query((rs, n) -> 1).single();
		var existing = jdbc.sql("select application_id, source_id, copy_id from application_resume_copies where owner_id = :owner and request_id = :request")
				.param("owner", owner).param("request", request).query((rs, n) -> new UUID[] { rs.getObject("application_id", UUID.class),
						rs.getObject("source_id", UUID.class), rs.getObject("copy_id", UUID.class) }).optional();
		if (existing.isPresent()) {
			var row = existing.get();
			if (!app.equals(row[0]) || !source.equals(row[1])) throw new ApiException(HttpStatus.CONFLICT, "INVALID_REQUEST", "That request id was already used.");
			return resumes.get(owner, row[2]);
		}
		var copy = resumes.copyForJob(owner, source, UUID.randomUUID());
		link(owner, app, Kind.RESUME, copy.id(), true);
		jdbc.sql("insert into application_resume_copies (owner_id, request_id, application_id, source_id, copy_id) values (:owner, :request, :app, :source, :copy)")
				.param("owner", owner).param("request", request).param("app", app).param("source", source).param("copy", copy.id()).update();
		return copy;
	}
}
