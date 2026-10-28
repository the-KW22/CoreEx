package com.coreex;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/** Mints Supabase-shaped access tokens (sub + email) signed with a throwaway key. */
public final class TestJwts {

	private static final KeyPair KEYS = newKeyPair();

	private static final KeyPair OTHER_KEYS = newKeyPair();

	private TestJwts() {
	}

	private static KeyPair newKeyPair() {
		try {
			var generator = KeyPairGenerator.getInstance("RSA");
			generator.initialize(2048);
			return generator.generateKeyPair();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	public static JwtDecoder decoder() {
		return NimbusJwtDecoder.withPublicKey((RSAPublicKey) KEYS.getPublic()).build();
	}

	public static String tokenFor(UUID sub, String email) {
		return sign(KEYS, sub, email, Instant.now().plusSeconds(3600));
	}

	public static String expiredTokenFor(UUID sub, String email) {
		return sign(KEYS, sub, email, Instant.now().minusSeconds(3600));
	}

	public static String tokenSignedByStranger(UUID sub, String email) {
		return sign(OTHER_KEYS, sub, email, Instant.now().plusSeconds(3600));
	}

	private static String sign(KeyPair keys, UUID sub, String email, Instant expires) {
		try {
			var claims = new JWTClaimsSet.Builder().subject(sub.toString()).claim("email", email)
					.expirationTime(Date.from(expires)).build();
			var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims);
			jwt.sign(new RSASSASigner((RSAPrivateKey) keys.getPrivate()));
			return jwt.serialize();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

}
