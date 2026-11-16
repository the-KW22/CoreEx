package com.coreex.resumes;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ResumeTextTest {

	@Test
	void scriptsHandlersUnsafeLinksAndUnknownTagsAreRemoved() {
		var clean = ResumeText.clean("<p onclick=\"x()\">Hi<script>alert(1)</script> <a href=\"javascript:alert(1)\">bad</a> "
				+ "<a href=\"https://ok.example/a\">ok</a><blink>b</blink><img src=\"x\" onerror=\"y()\"></p>");

		assertThat(clean).contains("Hi").contains("bad").contains("ok").contains("href=\"https://ok.example/a\"")
				.doesNotContain("script", "alert", "onclick", "javascript:", "blink", "onerror", "<img");
	}

	@Test
	void theMarksTiptapMakesSurvive() {
		var html = "<p style=\"text-align: center\"><strong>b</strong><em>i</em><u>u</u><span style=\"color: #ff0000\">c</span></p>"
				+ "<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol><p><a href=\"mailto:a@b.example\">mail</a></p>";

		assertThat(ResumeText.clean(html)).contains("<strong>b</strong>", "<em>i</em>", "<u>u</u>", "text-align: center",
				"color: #ff0000", "<ul>", "<ol>", "<li>", "mailto:a@b.example");
	}

	@Test
	void onlyColourAndAlignmentSurviveInAStyle() {
		var clean = ResumeText.clean("<p style=\"color: red; position: fixed; background: url(javascript:x); text-align: right\">t</p>"
				+ "<span style=\"width: 9px\">s</span>");

		assertThat(clean).doesNotContain("position", "url(", "width", "background");
		assertThat(clean).contains("text-align: right");
	}

	@Test
	void plainTextKeepsBlocksOnTheirOwnLines() {
		assertThat(ResumeText.plain("<p>One</p><ul><li><p>Two</p></li><li><p>Three</p></li></ul><p>A<br>B</p>"))
				.isEqualTo("One\nTwo\nThree\nA\nB");
	}

	@Test
	void markdownKeepsBoldItalicLinksAndLists() {
		var md = ResumeText.markdown("<p><strong>Led</strong> a <em>team</em> of <a href=\"https://x.example\">five</a></p>"
				+ "<ul><li><p>one</p></li><li><p>two</p></li></ul><ol><li><p>first</p></li></ol>");

		assertThat(md).isEqualTo("**Led** a *team* of [five](https://x.example)\n\n- one\n- two\n\n1. first");
	}

}
