package com.coreex.notes;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MentionsTest {

	@Test
	void findsTheTitleIgnoringCaseAsWholeWords() {
		assertThat(Mentions.first("About ENERGY here", "Energy")).isEqualTo(6);
		assertThat(Mentions.first("Energy", "Energy")).isZero();
		assertThat(Mentions.first("Energy, and more", "Energy")).isZero();
	}

	@Test
	void aTitleInsideAWordIsNoMention() {
		assertThat(Mentions.first("Energetic and synergy", "energ")).isEqualTo(-1);
		assertThat(Mentions.first("A party", "art")).isEqualTo(-1);
	}

	@Test
	void skipsPlacesWhereALinkWouldBreakTheText() {
		assertThat(Mentions.first("`Energy` in code", "Energy")).isEqualTo(-1);
		assertThat(Mentions.first("```\nEnergy\n```", "Energy")).isEqualTo(-1);
		assertThat(Mentions.first("[[Energy]] typed", "Energy")).isEqualTo(-1);
		assertThat(Mentions.first("[[6a1f0b1c-0000-4000-8000-000000000000|Energy]]", "Energy")).isEqualTo(-1);
		assertThat(Mentions.first("[Energy](https://x.org)", "Energy")).isEqualTo(-1);
		assertThat(Mentions.first("![Energy](a.png)", "Energy")).isEqualTo(-1);
		assertThat(Mentions.first("See https://x.org/energy today", "energy")).isEqualTo(-1);
	}

	@Test
	void findsAProseMentionAfterOneItMustSkip() {
		var text = "`Energy` then Energy";
		assertThat(Mentions.first(text, "Energy")).isEqualTo(text.lastIndexOf("Energy"));
	}

	@Test
	void aTitleTooShortOrThatCannotSitInALinkHasNoMention() {
		assertThat(Mentions.first("an ai note", "ai")).isEqualTo(-1);
		assertThat(Mentions.first("a [b] c", "[b]")).isEqualTo(-1);
		assertThat(Mentions.first("x a|b y", "a|b")).isEqualTo(-1);
	}

}
