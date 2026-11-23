package com.coreex.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class AiKeyVaultTest {

	private static AiProperties properties(String secret) {
		return new AiProperties("fake", "", "claude-opus-5-5", "", 0.5, 1000, 100_000, null, secret, 300_000, 10_000);
	}

	@Test
	void aKeyComesBackAsItWasSealed() {
		var vault = new AiKeyVault(properties("a-long-test-secret"));

		assertThat(vault.available()).isTrue();
		assertThat(vault.decrypt(vault.encrypt("sk-ant-test-1111"))).isEqualTo("sk-ant-test-1111");
	}

	@Test
	void aSealedKeyIsRandomlyEncryptedEachTime() {
		var vault = new AiKeyVault(properties("a-long-test-secret"));

		assertThat(vault.encrypt("sk-ant-test-1111")).isNotEqualTo(vault.encrypt("sk-ant-test-1111"));
	}

	@Test
	void aFlippedByteFailsToOpenAndTheErrorDoesNotShowTheKey() {
		var vault = new AiKeyVault(properties("a-long-test-secret"));
		var sealed = vault.encrypt("sk-ant-test-1111");
		sealed[sealed.length - 1] ^= 1;

		assertThatThrownBy(() -> vault.decrypt(sealed)).isInstanceOf(IllegalArgumentException.class)
				.hasMessageNotContaining("sk-ant");
	}

	@Test
	void aKeySealedUnderAnotherSecretDoesNotOpen() {
		var sealed = new AiKeyVault(properties("a-long-test-secret")).encrypt("sk-ant-test-1111");

		assertThatThrownBy(() -> new AiKeyVault(properties("another-secret")).decrypt(sealed))
				.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void noSecretMeansNoVault() {
		assertThat(new AiKeyVault(properties("")).available()).isFalse();
	}

}
