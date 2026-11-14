package com.coreex.export;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * File and Folder names for the zip. Titles can hold anything, so each becomes a name that unpacks on Windows,
 * macOS and Linux, and no two names in one directory collide, ignoring case (Windows and macOS do), Folders
 * and files together. One instance serves one export: it remembers what it handed out.
 */
final class ExportNames {

	private static final int MAX_LENGTH = 100;

	private static final Pattern BAD_CHARACTERS = Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]");

	// Windows cannot create these, with or without an extension.
	private static final Pattern RESERVED = Pattern.compile("(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\..*)?$");

	private static final Pattern TRAILING = Pattern.compile("[. ]+$");

	private static final Pattern HAS_EXTENSION = Pattern.compile("\\.[A-Za-z0-9]{1,5}$");

	private static final Map<String, String> TYPE_EXTENSIONS = Map.of("image/png", ".png", "image/jpeg", ".jpg",
			"image/gif", ".gif", "image/webp", ".webp", "image/svg+xml", ".svg", "application/pdf", ".pdf");

	private final Map<String, Set<String>> used = new HashMap<>();

	/** A name for a Folder inside the directory {@code dir} ("" is the top). */
	String folder(String dir, String name) {
		return unique(dir, safe(name), "");
	}

	/** A name for a file inside {@code dir}: the title, plus {@code extension} unless the title already ends in it. */
	String file(String dir, String title, String extension) {
		var base = safe(title);
		var add = extension == null || base.toLowerCase(Locale.ROOT).endsWith(extension.toLowerCase(Locale.ROOT)) ? ""
				: extension;
		return unique(dir, base, add);
	}

	/** The extension an Asset's file needs: none when its title already ends in one, else from its type. */
	static String extensionFor(String title, String mimeType) {
		return title != null && HAS_EXTENSION.matcher(title).find() ? "" : TYPE_EXTENSIONS.getOrDefault(mimeType, "");
	}

	private static String safe(String title) {
		var name = BAD_CHARACTERS.matcher(title == null ? "" : title.strip()).replaceAll("-");
		if (name.length() > MAX_LENGTH) {
			// Not between the two halves of a character outside the basic plane.
			var cut = Character.isHighSurrogate(name.charAt(MAX_LENGTH - 1)) ? MAX_LENGTH - 1 : MAX_LENGTH;
			name = name.substring(0, cut);
		}
		name = TRAILING.matcher(name).replaceAll("");
		if (name.isEmpty()) {
			name = "Untitled";
		}
		return RESERVED.matcher(name).matches() ? "_" + name : name;
	}

	private String unique(String dir, String base, String extension) {
		var taken = used.computeIfAbsent(dir, d -> new HashSet<>());
		var name = base + extension;
		for (int n = 2; !taken.add(name.toLowerCase(Locale.ROOT)); n++) {
			name = base + " (" + n + ")" + extension;
		}
		return name;
	}

}
