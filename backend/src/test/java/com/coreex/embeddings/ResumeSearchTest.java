package com.coreex.embeddings;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestEmbedder;
import tools.jackson.databind.json.JsonMapper;

class ResumeSearchTest extends ApiTest {

	@Autowired JdbcClient jdbc;
	@Autowired NoteEmbeddingSweep sweep;
	@Autowired TestEmbedder embedder;

	@BeforeEach
	void clean() {
		jdbc.sql("delete from users").update();
		embedder.clear();
	}

	@Test
	void resumeIsSearchableLinkedAndEmbeddedOnlyForItsOwner() throws Exception {
		var owner = UUID.randomUUID();
		var other = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')")
				.param("id", owner).param("email", owner + "@example.com").update();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')")
				.param("id", other).param("email", other + "@example.com").update();
		var a = TestJwts.tokenFor(owner, owner + "@example.com");
		var b = TestJwts.tokenFor(other, other + "@example.com");
		var id = UUID.randomUUID();
		assertThat(post("/api/resumes", a, "{\"id\":\"" + id + "\",\"title\":\"My CV\",\"sample\":true}").statusCode()).isEqualTo(201);
		var resume = JsonMapper.builder().build().readTree(get("/api/resumes/" + id, a).body());
		var document = resume.get("document").deepCopy();
		((tools.jackson.databind.node.ObjectNode) document).put("summary", "<p>zebrawrangler</p>");
		var save = JsonMapper.builder().build().writeValueAsString(java.util.Map.of("title", "My CV", "version", 1, "document", document));
		assertThat(put("/api/resumes/" + id, a, save).statusCode()).isEqualTo(200);
		assertThat(get("/api/search?q=zebrawrangler", a).body()).contains(id.toString());
		assertThat(get("/api/search?q=zebrawrangler", b).body()).doesNotContain(id.toString());
		var note = post("/api/notes", a, "{\"title\":\"Plan\",\"body\":\"[[My CV]]\"}");
		assertThat(note.statusCode()).isEqualTo(201);
		var noteId = JsonMapper.builder().build().readTree(note.body()).get("id").asString();
		assertThat(get("/api/items/" + id + "/backlinks", a).body()).contains("Plan");
		assertThat(get("/api/items/" + id + "/backlinks", b).statusCode()).isEqualTo(404);
		assertThat(get("/api/links/graph", a).body()).contains("\"source\":\"" + noteId + "\"")
				.contains("\"target\":\"" + id + "\"");
		assertThat(get("/api/links/graph", b).body()).doesNotContain(id.toString());
		sweep.run(Duration.ZERO);
		assertThat(jdbc.sql("select count(*) from note_chunks where note_id = :id").param("id", id).query(Long.class).single()).isPositive();
		jdbc.sql("delete from note_chunks where note_id = :id").param("id", id).update();
		var vector = embedder.embed(List.of("car repair")).orElseThrow().get(0);
		jdbc.sql("""
				insert into note_chunks (owner_id, note_id, position, content, content_hash, model, embedding)
				values (:owner, :id, 0, 'car repair', 'x', 'gte-small', cast(:vector as halfvec))""")
				.param("owner", owner).param("id", id).param("vector", Embedder.literal(vector)).update();
		assertThat(get("/api/search?q=car%20repair", a).body()).contains(id.toString());
		assertThat(get("/api/search?q=car%20repair", b).body()).doesNotContain(id.toString());
		assertThat(delete("/api/resumes/" + id, a).statusCode()).isEqualTo(204);
		assertThat(get("/api/search?q=car%20repair", a).body()).doesNotContain(id.toString());
	}
}
