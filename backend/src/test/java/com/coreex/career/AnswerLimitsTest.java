package com.coreex.career;

import static com.coreex.career.AnswerLimits.Unit.CHARS;
import static com.coreex.career.AnswerLimits.Unit.WORDS;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AnswerLimitsTest {

	@Test
	void blankOrNullTextCountsAsZero() {
		assertThat(AnswerLimits.count(WORDS, null)).isZero();
		assertThat(AnswerLimits.count(WORDS, " \n\t ")).isZero();
		assertThat(AnswerLimits.count(CHARS, null)).isZero();
		assertThat(AnswerLimits.count(CHARS, "  ")).isZero();
	}

	@Test
	void wordsSplitOnRunsOfSpacesNewlinesAndTabs() {
		assertThat(AnswerLimits.count(WORDS, "one  two\nthree\t\tfour")).isEqualTo(4);
	}

	@Test
	void charsCountCodePointsNotUtf16Units() {
		assertThat(AnswerLimits.count(CHARS, "😀")).isEqualTo(1);
		assertThat(AnswerLimits.count(CHARS, "h😀y")).isEqualTo(3);
	}

	@Test
	void surroundingWhitespaceIsIgnored() {
		assertThat(AnswerLimits.count(WORDS, "  hi there  \n")).isEqualTo(2);
		assertThat(AnswerLimits.count(CHARS, "  ab  ")).isEqualTo(2);
	}

	@Test
	void exactlyAtTheLimitIsWithin() {
		assertThat(AnswerLimits.within(WORDS, 2, "one two")).isTrue();
		assertThat(AnswerLimits.within(CHARS, 3, "abc")).isTrue();
	}

	@Test
	void oneOverTheLimitIsNotWithin() {
		assertThat(AnswerLimits.within(WORDS, 1, "one two")).isFalse();
		assertThat(AnswerLimits.within(CHARS, 2, "abc")).isFalse();
	}

	@Test
	void noLimitIsAlwaysWithin() {
		assertThat(AnswerLimits.within(WORDS, null, "a b c d e f g")).isTrue();
		assertThat(AnswerLimits.within(CHARS, null, "anything at all")).isTrue();
	}
}
