package com.coreex.knowledge;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class CandidateSplitterTest {

	@Test
	void eachBulletBecomesOneCandidateWithItsMarkerRemoved() {
		var text = "# Work\n\n- Led a team\n* Cut build time\n1. Shipped the billing API\n";
		assertThat(CandidateSplitter.split(text)).containsExactly("Led a team", "Cut build time", "Shipped the billing API");
	}

	@Test
	void plainSentencesOnTheirOwnLineAreCandidatesToo() {
		assertThat(CandidateSplitter.split("Mentored two juniors.\n\n  Ran the on-call rota  \n"))
				.containsExactly("Mentored two juniors.", "Ran the on-call rota");
	}

	@Test
	void headingsAndBlankLinesAreSkipped() {
		assertThat(CandidateSplitter.split("## Experience\n\n   \n### Skills\n")).isEmpty();
	}

	@Test
	void everyCandidateIsAnExactPieceOfTheSource() {
		var text = "- Led a team of five engineers\n- Cut build time by forty percent";
		List<String> candidates = CandidateSplitter.split(text);
		candidates.forEach(c -> assertThat(text).contains(c));
	}

}
