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

	@Test
	void isCutAtTheLimitOnAWordWithAnEllipsis() {
		var cut = Snippet.of("T", "word ".repeat(100));

		assertThat(cut).hasSizeLessThanOrEqualTo(Snippet.MAX + 1).endsWith("…").doesNotContain("  ");
	}

}
