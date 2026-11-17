package com.coreex.career;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class QuotedEmailTest {

	@Test
	void quotedLinesStartingWithAngleBracketsAreRemoved() {
		assertThat(QuotedEmail.strip("Thanks, Tuesday works.\n> Can you do Tuesday?\n>> Earlier\n")).isEqualTo("Thanks, Tuesday works.");
	}

	@Test
	void anOnWroteLineAndEverythingAfterItIsRemoved() {
		assertThat(QuotedEmail.strip("Yes, I am free.\n\nOn Mon, 3 Nov 2026, Jane Doe wrote:\n> Are you free?\nOld text"))
				.isEqualTo("Yes, I am free.");
	}

	@Test
	void anOnWroteLineWrappedOverTwoLinesIsRemoved() {
		assertThat(QuotedEmail.strip("Yes, I am free.\n\nOn Mon, 3 Nov 2026 at 10:00, Jane Doe\n<jane@example.com> wrote:\nOld text"))
				.isEqualTo("Yes, I am free.");
	}

	@Test
	void anOriginalMessageMarkerAndEverythingAfterItIsRemoved() {
		assertThat(QuotedEmail.strip("Reply here.\n-----Original Message-----\nFrom: Jane\nold text")).isEqualTo("Reply here.");
	}

	@Test
	void anOutlookHeaderBlockAndEverythingAfterItIsRemoved() {
		assertThat(QuotedEmail.strip("New text.\n\nFrom: Jane <jane@example.com>\nSent: Monday 3 November 2026 10:00\nTo: me@example.com\n"
				+ "Subject: Interview\n\nold text")).isEqualTo("New text.");
	}

	@Test
	void aLongUnderscoreLineFollowedByHeadersAndEverythingAfterItIsRemoved() {
		assertThat(QuotedEmail.strip("New text.\n\n__________\nFrom: Jane\nSent: Monday\nTo: me@example.com\n\nold text"))
				.isEqualTo("New text.");
	}

	@Test
	void aMessageWithNothingQuotedIsReturnedUnchangedApartFromTheTrim() {
		var message = "  Line one.\n\nLine two has a > sign in it.\n  Indented line.\n";
		assertThat(QuotedEmail.strip(message)).isEqualTo("Line one.\n\nLine two has a > sign in it.\n  Indented line.");
	}

	@Test
	void aTopPostedReplyKeepsOnlyTheNewText() {
		assertThat(QuotedEmail.strip("Thanks, I can do Tuesday.\n\n> Can you do Tuesday at 10?\n> Let me know.")).isEqualTo("Thanks, I can do Tuesday.");
	}

	@Test
	void aGreaterThanSignInsideASentenceIsKept() {
		assertThat(QuotedEmail.strip("Our pay band is > 50k for this role.")).isEqualTo("Our pay band is > 50k for this role.");
	}

	@Test
	void aSentenceStartingWithOnIsKept() {
		assertThat(QuotedEmail.strip("On Monday I will call you.\n\nThanks")).isEqualTo("On Monday I will call you.\n\nThanks");
	}

	@Test
	void anInputThatIsOnlyQuotesReturnsEmpty() {
		assertThat(QuotedEmail.strip("> a\n>\n> b")).isEqualTo("");
		assertThat(QuotedEmail.strip("On Mon, Jane wrote:\n> a\n> b\n")).isEqualTo("");
		assertThat(QuotedEmail.strip("   ")).isEqualTo("");
	}

	@Test
	void windowsLineEndingsBecomeLineFeeds() {
		assertThat(QuotedEmail.strip("New line.\r\n\r\n> old\r\n")).isEqualTo("New line.");
		assertThat(QuotedEmail.strip("First.\r\nSecond.")).isEqualTo("First.\nSecond.");
	}

	@Test
	void threeOrMoreBlankLinesBecomeTwo() {
		assertThat(QuotedEmail.strip("a\n\n\n\n\nb")).isEqualTo("a\n\n\nb");
	}
}
