package com.coreex.search;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * A Supabase project can already have pg_trgm (and vector) installed, typically in its "extensions" schema. The
 * migrations must still work, and the application's search path must still find the extension's operators (this is the
 * production failure of the v0.3.0 deploy).
 */
class TrigramInAnotherSchemaTest {

	@Test
	void migrationsAndTrigramQueriesWorkWhenPgTrgmIsInstalledInAnotherSchema() {
		try (var postgres = new PostgreSQLContainer(
				DockerImageName.parse("pgvector/pgvector:pg17").asCompatibleSubstituteFor("postgres"))) {
			postgres.start();
			var admin = new JdbcTemplate(
					new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
			admin.execute("create schema extensions");
			admin.execute("create extension pg_trgm with schema extensions");
			admin.execute("create extension vector with schema extensions");

			Flyway.configure().dataSource(admin.getDataSource()).schemas("coreex").load().migrate();

			assertThat(admin.queryForObject(
					"select indexdef from pg_indexes where schemaname = 'coreex' and indexname = 'items_title_trgm'",
					String.class)).contains("gin_trgm_ops");
			// The extension was left where it was, not created a second time.
			assertThat(admin.queryForObject("select count(*) from pg_extension where extname = 'pg_trgm'", Long.class))
					.isEqualTo(1L);

			// Same for pgvector: the Chunk table uses the type from where the extension is, and the index its operator class.
			assertThat(admin.queryForObject("select count(*) from pg_extension where extname = 'vector'", Long.class))
					.isEqualTo(1L);
			assertThat(admin.queryForObject("""
					select format_type(atttypid, atttypmod) from pg_attribute
					where attrelid = 'coreex.note_chunks'::regclass and attname = 'embedding'""", String.class))
					.isEqualTo("extensions.halfvec(384)");
			assertThat(admin.queryForObject(
					"select indexdef from pg_indexes where schemaname = 'coreex' and indexname = 'note_chunks_embedding'",
					String.class)).contains("hnsw").contains("halfvec_cosine_ops");

			// A connection as the application opens it: its search path finds the extension's operators and functions.
			try (var connection = new SingleConnectionDataSource(postgres.getJdbcUrl(), postgres.getUsername(),
					postgres.getPassword(), true)) {
				var app = new JdbcTemplate(connection);
				app.execute("set search_path = coreex, extensions");
				// The operator and the function resolve (the application sets its own similarity threshold per request).
				assertThat(app.queryForObject("select 'plan' <% 'Research plan'", Boolean.class)).isTrue();
				assertThat(app.queryForObject("select word_similarity('reserch', 'Research plan') > 0.4", Boolean.class))
						.isTrue();
				assertThat(app.queryForObject("select word_similarity('plan', 'Research plan')", Double.class))
						.isEqualTo(1.0);
				assertThat(app.queryForObject("select count(*) from items where title ilike 'x%'", Long.class))
						.isZero();
				// The sweep stores a vector as text cast to halfvec, which must resolve on the application's search path.
				assertThat(app.queryForObject("select vector_dims(cast('[1,2,3]' as halfvec))", Integer.class))
						.isEqualTo(3);
			}
		}
	}

}
