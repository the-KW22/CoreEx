package com.coreex.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;

/** Supabase exposes every table in `public` through its REST API, so CoreEx keeps its own schema. */
class SchemaApiTest extends ApiTest {

	@Autowired
	JdbcClient jdbc;

	private List<String> tablesIn(String schema) {
		return jdbc.sql("select table_name from information_schema.tables where table_schema = :schema and table_name in ('users', 'invites') order by 1")
				.param("schema", schema).query(String.class).list();
	}

	@Test
	void coreExTablesLiveInTheirOwnSchemaNotPublic() {
		assertThat(tablesIn("coreex")).containsExactly("invites", "users");
		assertThat(tablesIn("public")).isEmpty();
	}

	@Test
	void everyCoreExTableHasRowLevelSecurityOn() {
		assertThat(tablesIn("coreex")).isNotEmpty();
		var withoutRls = jdbc.sql("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'coreex' and c.relkind = 'r' and not c.relrowsecurity and c.relname <> 'flyway_schema_history' order by 1")
				.query(String.class).list();

		assertThat(withoutRls).isEmpty();
	}

}
