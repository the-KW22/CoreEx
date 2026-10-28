package com.coreex.links;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.coreex.links.LinkParser.Occurrence;

class LinkParserTest {

	private static final UUID ID = UUID.fromString("0b6f1c3e-5d1a-4e57-9c1d-2f8a7b6c5d4e");

	private static List<Occurrence> parse(String markdown) {
		return LinkParser.parse(markdown);
	}

	@Test
	void findsAStoredLinkWithItsIdAndTitle() {
		var text = "See [[" + ID + "|My Note]] now";

		var found = parse(text);

		assertThat(found).containsExactly(new Occurrence(4, text.length() - 4, ID, "My Note"));
		assertThat(text.substring(found.get(0).start(), found.get(0).end())).isEqualTo("[[" + ID + "|My Note]]");
	}

	@Test
	void anIdWithoutATitleIsAStoredLinkWithEmptyText() {
		assertThat(parse("[[" + ID + "]]")).extracting(Occurrence::id, Occurrence::text).containsExactly(
				org.assertj.core.groups.Tuple.tuple(ID, ""));
	}

	@Test
	void theIdMayBeUpperCase() {
		var upper = ID.toString().toUpperCase();

		assertThat(parse("[[" + upper + "|T]]")).extracting(Occurrence::id).containsExactly(ID);
	}

	@Test
	void aHandTypedTitleHasNoIdAndIsTrimmed() {
		var found = parse("a [[  Exact Title ]] b");

		assertThat(found).hasSize(1);
		assertThat(found.get(0).id()).isNull();
		assertThat(found.get(0).text()).isEqualTo("Exact Title");
		assertThat("a [[  Exact Title ]] b".substring(found.get(0).start(), found.get(0).end()))
				.isEqualTo("[[  Exact Title ]]");
	}

	@Test
	void aTitleWithABarButNoIdIsStillOneTitle() {
		assertThat(parse("[[a|b]]")).extracting(Occurrence::id, Occurrence::text)
				.containsExactly(org.assertj.core.groups.Tuple.tuple(null, "a|b"));
	}

	@Test
	void findsSeveralLinksInOrder() {
		var found = parse("[[One]] and [[" + ID + "|Two]]\nthen [[Three]]");

		assertThat(found).extracting(Occurrence::text).containsExactly("One", "Two", "Three");
		assertThat(found).extracting(Occurrence::id).containsExactly(null, ID, null);
	}

	@Test
	void ignoresMalformedBrackets() {
		for (var text : new String[] { "[[open", "close]]", "[a]]", "[[a]", "[[]]", "[[   ]]", "[ [a] ]", "[[a\nb]]",
				"[[[x" }) {
			assertThat(parse(text)).as(text).isEmpty();
		}
	}

	@Test
	void nestedBracketsOnlyKeepTheInnerLink() {
		assertThat(parse("[[a [[b]] c]]")).extracting(Occurrence::text).containsExactly("b");
	}

	@Test
	void anExtraBracketAroundALinkStillFindsTheLink() {
		assertThat(parse("[[[x]]]")).extracting(Occurrence::text).containsExactly("x");
	}

	@Test
	void ignoresLinksInsideFencedCodeBlocks() {
		var text = "before [[A]]\n```java\n[[B]] and [[" + ID + "|C]]\n```\nafter [[D]]";

		assertThat(parse(text)).extracting(Occurrence::text).containsExactly("A", "D");
	}

	@Test
	void tildeFencesAndLongerFencesWork() {
		assertThat(parse("~~~\n[[A]]\n~~~\n[[B]]")).extracting(Occurrence::text).containsExactly("B");
		// A shorter fence inside does not close a longer one.
		assertThat(parse("````\n```\n[[A]]\n```\n````\n[[B]]")).extracting(Occurrence::text).containsExactly("B");
	}

	@Test
	void anUnclosedFenceHidesTheRestOfTheText() {
		assertThat(parse("[[A]]\n```\n[[B]]\n[[C]]")).extracting(Occurrence::text).containsExactly("A");
	}

	@Test
	void ignoresLinksInsideInlineCode() {
		assertThat(parse("use `[[A]]` but [[B]] and ``[[C]] ` [[D]]``")).extracting(Occurrence::text)
				.containsExactly("B");
	}

	@Test
	void anUnclosedBacktickDoesNotHideAnything() {
		assertThat(parse("a ` [[A]]")).extracting(Occurrence::text).containsExactly("A");
	}

	@Test
	void aLineOfUnmatchedBacktickRunsIsFast() {
		var line = new StringBuilder();
		for (var n = 1; n <= 1400; n++) {
			line.append("`".repeat(n)).append(' ');
		}
		line.append("[[A]]");

		var started = System.nanoTime();
		var found = parse(line.toString());

		assertThat(found).extracting(Occurrence::text).containsExactly("A");
		assertThat((System.nanoTime() - started) / 1_000_000).as("milliseconds").isLessThan(500);
	}

	@Test
	void positionsStayCorrectAfterCodeIsSkipped() {
		var text = "`x` [[A]]\n```\ny\n```\n[[B]]";

		for (var occurrence : parse(text)) {
			var raw = text.substring(occurrence.start(), occurrence.end());
			assertThat(raw).isEqualTo("[[" + occurrence.text() + "]]");
		}
	}

	@Test
	void emptyAndNullTextHaveNoLinks() {
		assertThat(parse("")).isEmpty();
		assertThat(parse(null)).isEmpty();
	}

}
