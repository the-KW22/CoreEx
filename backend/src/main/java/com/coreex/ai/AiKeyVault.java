package com.coreex.ai;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

/**
 * Seals a User's own key with AES-GCM under a key made from the server's secret ({@code coreex.ai.key-secret}, held only
 * in the host's environment). The random 12-byte IV is stored in front of the ciphertext. Without a secret nothing can
 * be sealed or opened, so the keys feature is off. Nothing here logs or quotes the key.
 */
@Component
class AiKeyVault {

	private static final int IV_BYTES = 12;

	private static final int TAG_BITS = 128;

	private final SecretKeySpec key;

	private final SecureRandom random = new SecureRandom();

	AiKeyVault(AiProperties properties) {
		this.key = properties.keySecret().isBlank() ? null
				: new SecretKeySpec(sha256(properties.keySecret()), "AES");
	}

	/** Whether a secret is configured, so keys can be stored at all. */
	boolean available() {
		return key != null;
	}

	byte[] encrypt(String plain) {
		if (key == null) {
			throw new IllegalStateException("No key secret is configured");
		}
		try {
			var iv = new byte[IV_BYTES];
			random.nextBytes(iv);
			var cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
			var sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
			return ByteBuffer.allocate(IV_BYTES + sealed.length).put(iv).put(sealed).array();
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException("The key could not be sealed", e);
		}
	}

	/** Refuses with IllegalArgumentException when the bytes were changed or sealed under another secret. */
	String decrypt(byte[] sealed) {
		if (key == null) {
			throw new IllegalStateException("No key secret is configured");
		}
		try {
			var cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES));
			return new String(cipher.doFinal(sealed, IV_BYTES, sealed.length - IV_BYTES), StandardCharsets.UTF_8);
		}
		catch (GeneralSecurityException | RuntimeException e) {
			throw new IllegalArgumentException("The stored key cannot be opened", e);
		}
	}

	private static byte[] sha256(String secret) {
		try {
			return MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8));
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}

}
