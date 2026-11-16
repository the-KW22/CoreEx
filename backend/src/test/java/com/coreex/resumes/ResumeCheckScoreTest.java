package com.coreex.resumes;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class ResumeCheckScoreTest {
	@Test
	void sampleAndIgnoredFindingMatchTheBrowserScore() {
		var sample = ResumeSample.document();
		assertThat(ResumeCheckScore.score(sample, 2026)).isEqualTo(100);
		var blank = ResumeDocument.blank();
		assertThat(ResumeCheckScore.score(blank, 2026)).isEqualTo(56);
		var ignored = new ResumeDocument(blank.locale(), blank.basics(), blank.summary(), blank.sections(), blank.metadata(), "",
				List.of("contact-email", "contact-email"));
		assertThat(ResumeCheckScore.score(ignored, 2026)).isEqualTo(63);
	}
}
