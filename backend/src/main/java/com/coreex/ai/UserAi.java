package com.coreex.ai;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import com.coreex.ai.AiProperties.ModelPrice;

/**
 * A User's own AI settings (issue #203): the Chat model they picked and their own key, sealed by {@link AiKeyVault}.
 * Every read and write is for the one owner it is given, so no caller can reach another User's row.
 */
@Component
class UserAi {

	/** Where a call goes: the model for the User's Chats, and their own key when one is stored and can be opened. */
	record Route(ModelPrice model, Optional<String> ownKey) {
	}

	/** What the screens may show about a stored key: never the key itself. */
	record Saved(String provider, String last4) {
	}

	private record Row(String chatModel, String provider, String last4, byte[] sealed) {
	}

	private final JdbcClient jdbc;

	private final AiSettings settings;

	private final AiKeyVault vault;

	UserAi(JdbcClient jdbc, AiSettings settings, AiKeyVault vault) {
		this.jdbc = jdbc;
		this.settings = settings;
		this.vault = vault;
	}

	/** The User's chosen model while it is still in the list, else the Admin's current model. */
	Route resolve(UUID owner) {
		var row = row(owner);
		var model = row.map(Row::chatModel).flatMap(id -> settings.models().stream().filter(m -> m.id().equals(id)).findFirst())
				.orElseGet(() -> settings.current().model());
		return new Route(model, row.flatMap(this::openKey));
	}

	/** The stored key's provider and last four characters, or empty when none is stored or it cannot be opened. */
	Optional<Saved> saved(UUID owner) {
		return row(owner).filter(r -> openKey(r).isPresent()).map(r -> new Saved(r.provider(), r.last4()));
	}

	void setChatModel(UUID owner, String model) {
		jdbc.sql("""
				insert into user_ai_settings (owner_id, chat_model) values (:owner, :model)
				on conflict (owner_id) do update set chat_model = excluded.chat_model, updated_at = now()""")
				.param("owner", owner).param("model", model).update();
	}

	void saveKey(UUID owner, String provider, byte[] sealed, String last4) {
		jdbc.sql("""
				insert into user_ai_settings (owner_id, key_provider, key_ciphertext, key_last4) values (:owner, :provider, :sealed, :last4)
				on conflict (owner_id) do update set key_provider = excluded.key_provider, key_ciphertext = excluded.key_ciphertext,
				key_last4 = excluded.key_last4, updated_at = now()""")
				.param("owner", owner).param("provider", provider).param("sealed", sealed).param("last4", last4).update();
	}

	/** Removes the key only; the chosen model stays. */
	void deleteKey(UUID owner) {
		jdbc.sql("""
				update user_ai_settings set key_provider = null, key_ciphertext = null, key_last4 = null, updated_at = now()
				where owner_id = :owner""").param("owner", owner).update();
	}

	private Optional<Row> row(UUID owner) {
		return jdbc.sql("select chat_model, key_provider, key_last4, key_ciphertext from user_ai_settings where owner_id = :owner")
				.param("owner", owner)
				.query((rs, i) -> new Row(rs.getString("chat_model"), rs.getString("key_provider"), rs.getString("key_last4"),
						rs.getBytes("key_ciphertext")))
				.optional();
	}

	/** A key that cannot be opened (the secret was changed) counts as no key at all. */
	private Optional<String> openKey(Row row) {
		if (row.sealed() == null || !vault.available()) {
			return Optional.empty();
		}
		try {
			return Optional.of(vault.decrypt(row.sealed()));
		}
		catch (IllegalArgumentException e) {
			return Optional.empty();
		}
	}

}
