package com.coreex.embeddings;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.coreex.embeddings.NoteChunker.Chunk;

class NoteChunkerTest {

	private static String words(String word, int count) {
		return String.join(" ", java.util.Collections.nCopies(count, word));
	}

	private static List<String> texts(List<Chunk> chunks) {
		return chunks.stream().map(Chunk::text).toList();
	}

	@Test
	void aShortNoteIsOneChunkThatStartsWithItsTitle() {
		assertThat(texts(NoteChunker.split("Plan", "Buy milk"))).containsExactly("Plan\n\nBuy milk");
	}

	@Test
	void everyChunkStartsWithItsHeadingPathAndNeverSpansTwoHeadings() {
		var chunks = NoteChunker.split("T", "intro\n\n# A\ntext a\n## B\ntext b\n### Skipped level\ntext c\n# C\ntext d");

		assertThat(texts(chunks)).containsExactly("T\n\nintro", "T › A\n\ntext a", "T › A › B\n\ntext b",
				"T › A › B › Skipped level\n\ntext c", "T › C\n\ntext d");
	}

	@Test
	void wholeParagraphsArePackedUpToAboutTwoHundredFiftyWordsAndNeverCut() {
		var paragraph = words("word", 100);

		var chunks = NoteChunker.split("T", paragraph + "\n\n" + paragraph + "\n\n" + paragraph);

		assertThat(texts(chunks)).containsExactly("T\n\n" + paragraph + "\n\n" + paragraph, "T\n\n" + paragraph);
	}

	@Test
	void aFencedCodeBlockStaysWholeWithHashesAndBlankLinesInsideIt() {
		var code = "```java\n# not a heading\n\nint x = 1;\n```";

		var chunks = NoteChunker.split("T", "before\n\n" + code + "\n\nafter");

		assertThat(texts(chunks)).containsExactly("T\n\nbefore\n\n" + code + "\n\nafter");
	}

	@Test
	void aParagraphOverTheLimitIsCutAtSentenceEnds() {
		var sentence = words("word", 99) + " end.";
		var paragraph = String.join(" ", java.util.Collections.nCopies(6, sentence));

		var chunks = NoteChunker.split("T", paragraph);

		assertThat(chunks).hasSize(3);
		assertThat(texts(chunks)).allSatisfy(t -> assertThat(t).endsWith("end."));
		assertThat(texts(chunks)).allSatisfy(t -> assertThat(t.split("\\s+").length).isLessThanOrEqualTo(250 + 1));
	}

	@Test
	void aLongListWithoutPeriodsIsCutAtLineEndsSoNoItemIsLeftUnread() {
		var lines = new java.util.ArrayList<String>();
		for (var i = 0; i < 60; i++) {
			lines.add("- item" + i + " " + words("w", 9));
		}

		var chunks = NoteChunker.split("T", String.join("\n", lines));

		assertThat(chunks).hasSizeGreaterThanOrEqualTo(3);
		assertThat(texts(chunks)).allSatisfy(t -> assertThat(t.split("\\s+").length).isLessThanOrEqualTo(250 + 1));
		assertThat(String.join(" ", texts(chunks))).contains("item0 ").contains("item59 ");
	}

	@Test
	void anOversizeCodeBlockIsKeptWholeInItsOwnChunk() {
		var code = "```\n" + words("x", 400) + "\n```";

		var chunks = NoteChunker.split("T", "intro\n\n" + code);

		assertThat(texts(chunks)).containsExactly("T\n\nintro", "T\n\n" + code);
	}

	@Test
	void linksBecomeTheirPlainTitles() {
		var chunks = NoteChunker.split("T", "See [[1b4e28ba-2fa1-11d2-883f-0016d3cca427|Other Note]] and [[Plain]].");

		assertThat(texts(chunks)).containsExactly("T\n\nSee Other Note and Plain.");
	}

	@Test
	void aTitleOnlyNoteIsOneChunkAndABlankNoteHasNone() {
		assertThat(texts(NoteChunker.split("Buy milk", ""))).containsExactly("Buy milk");
		assertThat(texts(NoteChunker.split("Buy milk", " \n\n "))).containsExactly("Buy milk");
		assertThat(NoteChunker.split("", "")).isEmpty();
		assertThat(texts(NoteChunker.split("", "just text"))).containsExactly("just text");
	}

	@Test
	void windowsLineEndingsGiveTheSameChunksAsUnixOnes() {
		var unix = NoteChunker.split("T", "# A\nline one\nline two\n\nnext");
		var windows = NoteChunker.split("T", "# A\r\nline one\r\nline two\r\n\r\nnext");

		assertThat(windows).isEqualTo(unix);
	}

	@Test
	void theHashIsTheSameForTheSameTextAndDifferentOtherwise() {
		var a = NoteChunker.split("T", "same").get(0);

		assertThat(NoteChunker.split("T", "same").get(0).hash()).isEqualTo(a.hash()).hasSize(64);
		assertThat(NoteChunker.split("T", "other").get(0).hash()).isNotEqualTo(a.hash());
		assertThat(NoteChunker.split("Renamed", "same").get(0).hash()).isNotEqualTo(a.hash());
	}

}
