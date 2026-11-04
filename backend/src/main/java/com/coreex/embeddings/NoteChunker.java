package com.coreex.embeddings;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Cuts a Note into Chunks for Semantic search: at headings first, then whole paragraphs and fenced code blocks packed
 * up to about 250 words. Every Chunk starts with the Note's title and its heading path, so a paragraph that says "it
 * costs $7" still carries what "it" is. {@code [[id|Title]]} and {@code [[Title]]} Links become their plain titles.
 */
final class NoteChunker {

	/** A piece of a Note: the text to embed and the SHA-256 of it, which tells whether it changed. */
	record Chunk(String text, String hash) {
	}

	private record Block(String path, String text, int words, boolean code) {
	}

	/** The model reads 512 tokens, about 350 words; a Chunk of 250 words plus its heading path fits. */
	private static final int MAX_WORDS = 250;

	private static final Pattern LINK = Pattern.compile("\\[\\[(?:[^\\[\\]|\\n]+\\|)?([^\\[\\]\\n]+)]]");

	private static final Pattern HEADING = Pattern.compile("^ {0,3}(#{1,6})\\s+(.*?)(?:\\s+#+)?\\s*$");

	private static final Pattern FENCE = Pattern.compile("^ {0,3}(```|~~~).*");

	private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?])\\s+|\\R+");

	private NoteChunker() {
	}

	static List<Chunk> split(String title, String body) {
		var chunks = new ArrayList<Chunk>();
		var current = new ArrayList<Block>();
		var currentWords = 0;
		for (var block : blocks(LINK.matcher(body).replaceAll("$1"))) {
			for (var piece : block.code() || block.words() <= MAX_WORDS ? List.of(block) : sentences(block)) {
				var samePath = current.isEmpty() || current.get(0).path().equals(piece.path());
				if (!samePath || (currentWords + piece.words() > MAX_WORDS && !current.isEmpty())) {
					chunks.add(chunk(title, current));
					current.clear();
					currentWords = 0;
				}
				current.add(piece);
				currentWords += piece.words();
			}
		}
		if (!current.isEmpty()) {
			chunks.add(chunk(title, current));
		}
		if (chunks.isEmpty() && !title.isBlank()) {
			chunks.add(chunk(title, List.of()));
		}
		return chunks;
	}

	private static Chunk chunk(String title, List<Block> blocks) {
		var text = new StringBuilder(prefix(title, blocks.isEmpty() ? "" : blocks.get(0).path()));
		for (var block : blocks) {
			text.append(text.isEmpty() ? "" : "\n\n").append(block.text());
		}
		return new Chunk(text.toString(), sha256(text.toString()));
	}

	private static String prefix(String title, String path) {
		return title.isBlank() ? path : path.isEmpty() ? title.strip() : title.strip() + " › " + path;
	}

	/** Paragraphs and fenced blocks in order, each with the heading path it sits under. */
	private static List<Block> blocks(String markdown) {
		var blocks = new ArrayList<Block>();
		var headings = new String[6];
		var paragraph = new StringBuilder();
		var fence = (String) null;
		var path = "";
		for (var line : markdown.split("\\R", -1)) {
			var fenceLine = FENCE.matcher(line);
			var heading = HEADING.matcher(line);
			if (fence != null) {
				paragraph.append('\n').append(line);
				if (fenceLine.matches() && line.strip().startsWith(fence)) {
					flush(blocks, paragraph, path, true);
					fence = null;
				}
			}
			else if (fenceLine.matches()) {
				flush(blocks, paragraph, path, false);
				paragraph.append(line);
				fence = fenceLine.group(1);
			}
			else if (heading.matches()) {
				flush(blocks, paragraph, path, false);
				var level = heading.group(1).length();
				headings[level - 1] = heading.group(2);
				Arrays.fill(headings, level, headings.length, null);
				path = String.join(" › ", Arrays.stream(headings).filter(h -> h != null && !h.isBlank()).toList());
			}
			else if (line.isBlank()) {
				flush(blocks, paragraph, path, false);
			}
			else {
				paragraph.append(paragraph.isEmpty() ? "" : "\n").append(line);
			}
		}
		flush(blocks, paragraph, path, fence != null);
		return blocks;
	}

	private static void flush(List<Block> blocks, StringBuilder paragraph, String path, boolean code) {
		var text = paragraph.toString().strip();
		paragraph.setLength(0);
		if (!text.isEmpty()) {
			blocks.add(new Block(path, text, words(text), code));
		}
	}

	/** A paragraph over the limit, cut at sentence and line ends into pieces of at most about 250 words. */
	// shortcut: one sentence or line (or one code block) over the limit stays whole and the model reads only its first
	// 512 tokens, split at clauses if searching long unbroken text ever matters.
	private static List<Block> sentences(Block paragraph) {
		var pieces = new ArrayList<Block>();
		var piece = new StringBuilder();
		for (var sentence : SENTENCE_END.split(paragraph.text())) {
			if (!piece.isEmpty() && words(piece.toString()) + words(sentence) > MAX_WORDS) {
				pieces.add(new Block(paragraph.path(), piece.toString(), words(piece.toString()), false));
				piece.setLength(0);
			}
			piece.append(piece.isEmpty() ? "" : " ").append(sentence);
		}
		pieces.add(new Block(paragraph.path(), piece.toString(), words(piece.toString()), false));
		return pieces;
	}

	private static int words(String text) {
		return text.isBlank() ? 0 : text.strip().split("\\s+").length;
	}

	private static String sha256(String text) {
		try {
			return java.util.HexFormat.of().formatHex(
					MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e); // every JDK has SHA-256
		}
	}

}
