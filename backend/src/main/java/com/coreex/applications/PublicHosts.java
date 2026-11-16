package com.coreex.applications;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;

/**
 * Which addresses a posting may be read from. Only public ones: reading a link makes this server fetch a page for a
 * User, so anything that reaches inside the network the server runs in (loopback, private ranges, link-local and the
 * cloud metadata address, shared and reserved ranges) is refused. An IPv4 address written as IPv6
 * ({@code ::ffff:10.0.0.1}) arrives as its IPv4 form and is judged as that.
 */
final class PublicHosts {

	private PublicHosts() {
	}

	static boolean isPublic(InetAddress address) {
		if (address == null || address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
				|| address.isSiteLocalAddress() || address.isMulticastAddress()) {
			return false;
		}
		var b = address.getAddress();
		if (address instanceof Inet4Address) {
			var a = b[0] & 0xff;
			var second = b[1] & 0xff;
			var third = b[2] & 0xff;
			return !(a == 0 // "this network"
					|| (a == 100 && second >= 64 && second <= 127) // carrier-grade NAT, 100.64.0.0/10
					|| (a == 192 && second == 0 && third == 0) // IETF protocol assignments, 192.0.0.0/24
					|| (a == 192 && second == 0 && third == 2) // documentation
					|| (a == 198 && (second == 18 || second == 19)) // benchmarking, 198.18.0.0/15
					|| (a == 198 && second == 51 && third == 100) // documentation
					|| (a == 203 && second == 0 && third == 113) // documentation
					|| a >= 240); // reserved and broadcast
		}
		if (address instanceof Inet6Address) {
			var first = b[0] & 0xff;
			var second = b[1] & 0xff;
			return !((first & 0xfe) == 0xfc // unique local, fc00::/7
					|| (first == 0x20 && second == 0x02) // 6to4: carries an IPv4 address inside
					|| (first == 0x20 && second == 0x01 && b[2] == 0x0d && (b[3] & 0xff) == 0xb8) // documentation
					|| (first == 0x00 && second == 0x64 && (b[2] & 0xff) == 0xff && (b[3] & 0xff) == 0x9b) // NAT64
					|| isIpv4Compatible(b));
		}
		return false;
	}

	/** The old "::a.b.c.d" form, which some stacks treat as that IPv4 address. */
	private static boolean isIpv4Compatible(byte[] b) {
		for (int i = 0; i < 12; i++) {
			if (b[i] != 0) {
				return false;
			}
		}
		return true;
	}

}
