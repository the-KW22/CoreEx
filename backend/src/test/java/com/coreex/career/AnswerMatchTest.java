package com.coreex.career;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AnswerMatchTest {

	@Test
	void identicalQuestionsScoreOne() {
		assertThat(AnswerMatch.score("Why do you want to work here?", "Why do you want to work here?")).isEqualTo(1.0);
	}

	@Test
	void unrelatedQuestionScoresBelowThreshold() {
		assertThat(AnswerMatch.score("Why do you want to work here?", "How would you handle a difficult customer complaint?"))
				.isLessThan(AnswerMatch.THRESHOLD);
	}

	@Test
	void rewordedSameQuestionScoresAtOrAboveThreshold() {
		assertThat(AnswerMatch.score("Why do you want to work here?", "Tell us why you want to work at our company"))
				.isGreaterThanOrEqualTo(AnswerMatch.THRESHOLD);
	}

	@Test
	void stopWordsAndShortWordsAreIgnored() {
		assertThat(AnswerMatch.score("the and for are you", "about your with is at")).isZero();
		assertThat(AnswerMatch.score("What is the best way", "best way")).isEqualTo(1.0);
	}

	@Test
	void caseIsIgnored() {
		assertThat(AnswerMatch.score("WORK Here", "work here")).isEqualTo(1.0);
	}

	@Test
	void emptyOrNullInputScoresZero() {
		assertThat(AnswerMatch.score(null, "work here")).isZero();
		assertThat(AnswerMatch.score("work here", null)).isZero();
		assertThat(AnswerMatch.score("", "")).isZero();
		assertThat(AnswerMatch.score(null, null)).isZero();
	}
}
