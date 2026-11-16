package com.coreex.applications;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;

/**
 * The canonical address of a posting: scheme, host (lower case, no "www."), path, and only the parameters that name the
 * job. Tracking and secret parameters (utm_*, gclid, ref, token, key, session...), a fragment, a credential and a
 * default port are dropped, and a trailing slash does not count, so two links to the same job come out the same.
 * Empty when the text is not an http or https address. A parameter this does not know is dropped too, which can only
 * make two postings look alike if their only difference is such a parameter; the list below is what job sites use.
 */
final class CanonicalUrl {

	private static final Set<String> JOB_ID_PARAMETERS = Set.of("id", "jobid", "job_id", "jid", "gh_jid", "jk", "jobkey",
			"currentjobid", "jobreqid", "reqid", "req_id", "requisitionid", "requisition_id", "postingid", "posting_id",
			"positionid", "position_id", "jobcode", "jobnumber", "job_number", "openingid", "opening_id", "oid");

	private CanonicalUrl() {
	}

	static String of(String text) {
		if (text == null || text.isBlank()) {
			return "";
		}
		URI uri;
		try {
			uri = new URI(text.trim());
		}
		catch (URISyntaxException e) {
			return "";
		}
		var scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
		if ((!scheme.equals("http") && !scheme.equals("https")) || uri.getHost() == null || uri.getHost().isBlank()) {
			return "";
		}
		var host = uri.getHost().toLowerCase(Locale.ROOT);
		if (host.startsWith("www.") && host.length() > 4) {
			host = host.substring(4);
		}
		var port = uri.getPort();
		var defaultPort = scheme.equals("http") ? 80 : 443;
		var path = uri.getRawPath() == null || uri.getRawPath().isEmpty() ? "/" : uri.getRawPath();
		if (path.length() > 1 && path.endsWith("/")) {
			path = path.substring(0, path.length() - 1);
		}
		var parameters = new ArrayList<String>();
		if (uri.getRawQuery() != null) {
			for (var pair : uri.getRawQuery().split("&")) {
				var at = pair.indexOf('=');
				var name = (at < 0 ? pair : pair.substring(0, at)).toLowerCase(Locale.ROOT);
				if (JOB_ID_PARAMETERS.contains(name)) {
					parameters.add(name + (at < 0 ? "" : pair.substring(at)));
				}
			}
		}
		parameters.sort(null);
		return scheme + "://" + host + (port == -1 || port == defaultPort ? "" : ":" + port) + path
				+ (parameters.isEmpty() ? "" : "?" + String.join("&", parameters));
	}

}
