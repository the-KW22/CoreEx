package com.coreex.items;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

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
	void leavesOutALeadingFrontMatterBlock() {
		var body = "---\ndate: 2026-10-29\nissues: [\"#42\"]\n---\n\n# Session\n\nWhat was done.";

		assertThat(Snippet.of("A file name", body)).isEqualTo("Session What was done.");
		assertThat(Snippet.of("Session", body)).isEqualTo("What was done.");
	}

	@Test
	void leavesOutFrontMatterBehindTheHeadingTheTitleFieldAdds() {
		assertThat(Snippet.of("T", "# T\n---\ndate: 2026-10-29\n---\nWhat was done.")).isEqualTo("What was done.");
	}

	@Test
	void treatsAFrontMatterBlockThatNeverClosesAsAllFrontMatter() {
		assertThat(Snippet.of("T", "---\ndate: 2026-10-29\nagent: Claude")).isNull();
	}

	@Test
	void keepsTextBetweenTwoRulesThatIsNotFrontMatter() {
		assertThat(Snippet.of("T", "---\nJust a thought\n---\nAnd another")).isEqualTo("Just a thought And another");
	}

	@Test
	void showsNoRulesCodeFencesOrTableSyntax() {
		assertThat(Snippet.of("T", "Before\n\n---\n***\n___\nTitle\n===\nAfter")).isEqualTo("Before Title After");
		assertThat(Snippet.of("T", "```java\nvar x = 1;\n```\n~~~\nmore\n~~~")).isEqualTo("var x = 1; more");
		assertThat(Snippet.of("T", "| Name | Age |\n|---|:--:|\n| Ann | 30 |")).isEqualTo("Name Age Ann 30");
	}

	@Test
	void stripsNestedAndParenthesisedLineMarks() {
		assertThat(Snippet.of("T", "> - quoted item\n1) first\n  - [x] done")).isEqualTo("quoted item first done");
	}

	@Test
	void isNullWhenOnlyMarkdownSyntaxIsLeft() {
		assertThat(Snippet.of("T", "---\ndate: 2026-10-29\n---\n\n---\n```\n```")).isNull();
	}

	// A regex that recurses per repeat would overflow the stack here, and one such Note would fail the whole Item list.
	@Test
	void survivesALineThatIsOneLongRunOfMarks() throws Exception {
		var failure = new AtomicReference<Throwable>();
		var thread = new Thread(null, () -> {
			for (var mark : List.of("-", "- ", "=", "> ", "- > ", "1. ", "# ")) {
				Snippet.of("T", mark.repeat(2000 / mark.length()));
				Snippet.of("T", mark.repeat(2000 / mark.length()) + "x");
			}
		}, "small-stack", 256 * 1024);
		thread.setUncaughtExceptionHandler((t, e) -> failure.set(e));
		thread.start();
		thread.join();

		assertThat(failure.get()).isNull();
	}

	@Test
	void isCutAtTheLimitOnAWordWithAnEllipsis() {
		var cut = Snippet.of("T", "word ".repeat(100));

		assertThat(cut).hasSizeLessThanOrEqualTo(Snippet.MAX + 1).endsWith("…").doesNotContain("  ");
	}

}
