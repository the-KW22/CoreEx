package com.coreex.ai;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The markers that wrap text the model must read as data: {@code <note>} around a quoted piece of a Note and
 * {@code <data>} around a tool result. Text inside a marker can never close it: every closing form of either tag is
 * neutralised first (case-insensitive, spaces allowed), and attribute values are escaped.
 */
public final class DataMarkers {

	private static final Pattern CLOSING = Pattern.compile("<\\s*/\\s*(note|data)", Pattern.CASE_INSENSITIVE);

	private DataMarkers() {
	}

	/** The text with every closing {@code note} or {@code data} tag in it turned into {@code <\/note} or {@code <\/data}. */
	public static String neutralise(String text) {
		return CLOSING.matcher(text).replaceAll("<\\\\/$1");
	}

	/** One quoted piece of a Note, as the model receives it. */
	public static String note(UUID id, String title, String heading, String text) {
		return "<note id=\"" + escape(id.toString()) + "\" title=\"" + escape(title) + "\" heading=\"" + escape(heading) + "\">"
				+ neutralise(text) + "</note>";
	}

	/** A tool's result, as the model receives it. */
	public static String data(String tool, String text) {
		return "<data tool=\"" + escape(tool) + "\">" + neutralise(text) + "</data>";
	}

	private static String escape(String value) {
		return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
	}

}
