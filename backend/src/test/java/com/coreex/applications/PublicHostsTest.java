package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetAddress;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Which addresses a posting may be read from: public ones only. */
class PublicHostsTest {

	@ParameterizedTest
	@ValueSource(strings = { "127.0.0.1", "127.255.255.254", "::1", "0.0.0.0", "::", "10.0.0.1", "10.255.255.255",
			"172.16.0.1", "172.31.255.255", "192.168.0.1", "192.168.255.255", "169.254.169.254", "169.254.0.1", "fe80::1",
			"fc00::1", "fd12:3456::1", "100.64.0.1", "100.127.255.255", "224.0.0.1", "239.255.255.255", "ff02::1",
			"::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "192.0.0.1", "198.18.0.1", "240.0.0.1",
			"255.255.255.255" })
	void anInternalAddressIsRefused(String literal) throws Exception {
		assertThat(PublicHosts.isPublic(InetAddress.getByName(literal))).as(literal).isFalse();
	}

	@ParameterizedTest
	@ValueSource(strings = { "8.8.8.8", "93.184.216.34", "1.1.1.1", "172.15.255.255", "172.32.0.1", "100.63.255.255",
			"100.128.0.1", "192.169.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888" })
	void aPublicAddressIsAllowed(String literal) throws Exception {
		assertThat(PublicHosts.isPublic(InetAddress.getByName(literal))).as(literal).isTrue();
	}

}
