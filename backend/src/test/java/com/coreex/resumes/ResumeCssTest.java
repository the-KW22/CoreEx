package com.coreex.resumes;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ResumeCssTest {

	@Test
	void ruleAimedAtKnownPartsWithKnownValuesAreFine() {
		assertThat(ResumeCss.problems("")).isEmpty();
		assertThat(ResumeCss.problems(null)).isEmpty();
		assertThat(ResumeCss.problems("/* a note */ heading { color: #FF0000; font-size: 14pt; text-transform: uppercase }")).isEmpty();
		assertThat(ResumeCss.problems("entry-title, entry-dates { font-weight: bold; margin-bottom: 4 }\nname { font-size: 24.5 }")).isEmpty();
	}

	@Test
	void anUnknownPropertyIsRefused() {
		assertThat(ResumeCss.problems("heading { position: fixed }")).singleElement().asString().contains("position");
		assertThat(ResumeCss.problems("heading { background: url(javascript:alert(1)) }")).isNotEmpty();
		assertThat(ResumeCss.problems("heading { color }")).isNotEmpty();
	}

	@Test
	void anUnknownValueIsRefused() {
		assertThat(ResumeCss.problems("heading { color: red }")).isNotEmpty();
		assertThat(ResumeCss.problems("heading { font-size: 999 }")).isNotEmpty();
		assertThat(ResumeCss.problems("heading { font-size: 5 }")).isNotEmpty();
		assertThat(ResumeCss.problems("heading { text-align: sideways }")).isNotEmpty();
		assertThat(ResumeCss.problems("heading { margin-top: -3 }")).isNotEmpty();
	}

	@Test
	void anUnknownPartOrABrokenRuleIsRefused() {
		assertThat(ResumeCss.problems("script { color: #000000 }")).singleElement().asString().contains("script");
		assertThat(ResumeCss.problems("body { color: #000000 }")).isNotEmpty();
		assertThat(ResumeCss.problems("heading { color: #000000")).isNotEmpty();
		assertThat(ResumeCss.problems("heading color: #000000 }")).isNotEmpty();
		assertThat(ResumeCss.problems("heading { heading { color: #000000 } }")).isNotEmpty();
	}

	@Test
	void aVeryLongStyleIsRefused() {
		assertThat(ResumeCss.problems("heading { color: #000000 } ".repeat(400))).singleElement().asString().contains("longer");
	}

}
