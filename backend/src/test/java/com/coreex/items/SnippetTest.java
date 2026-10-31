package com.coreex.items;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SnippetTest {

	@Test
	void skipsTheHeadingThatIsTheTitleAndStripsMarkdownMarks() {
		var body = "# My Note\n\nSome **bold** and _italic_ words, `code`, a [link](https://example.com) and [[0b6f1c3e-5d1a-4e57-9c1d-2f8a7b6c5d4e|Other Note]].\n\n- [ ] a task\n> quoted";

		assertThat(Snippet.of("My Note", body))
				.isEqualTo("Some bold and italic words, code, a link and Other Note. a task quoted");
	}

	@Test
	void keepsAFirstLineThatIsNotTheTitle() {
		assertThat(Snippet.of("Other", "## Plans\nShip it")).isEqualTo("Plans Ship it");
	}

	@Test
	void isNullWhenThereIsNoText() {
		assertThat(Snippet.of("T", null)).isNull();
		assertThat(Snippet.of("T", "# T\n\n  \n")).isNull();
	}

	@Test
	void isCutAtTheLimitOnAWordWithAnEllipsis() {
		var cut = Snippet.of("T", "word ".repeat(100));

		assertThat(cut).hasSizeLessThanOrEqualTo(Snippet.MAX + 1).endsWith("…").doesNotContain("  ");
	}

}
