package com.coreex;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/** Swaps Supabase's real keys and the wall clock for ones the tests control. */
@TestConfiguration(proxyBeanMethods = false)
public class TestSupportConfiguration {

	@Bean
	JwtDecoder jwtDecoder() {
		return TestJwts.decoder();
	}

	@Bean
	@Primary
	public TestClock testClock() {
		return new TestClock();
	}

	public static class TestClock extends Clock {

		private Instant now = Instant.parse("2026-10-28T10:00:00Z");

		public void advance(Duration by) {
			now = now.plus(by);
		}

		@Override
		public Instant instant() {
			return now;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

	}

}
