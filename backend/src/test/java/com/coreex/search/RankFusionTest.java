package com.coreex.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class RankFusionTest {

	private static final UUID A = UUID.fromString("00000000-0000-0000-0000-00000000000a");

	private static final UUID B = UUID.fromString("00000000-0000-0000-0000-00000000000b");

	private static final UUID C = UUID.fromString("00000000-0000-0000-0000-00000000000c");

	private static final UUID D = UUID.fromString("00000000-0000-0000-0000-00000000000d");

	@Test
	void anItemInBothListsRisesAboveOnesInOnlyOne() {
		// C scores in both lists; B and D tie (second place in one list each), and the first list wins a tie.
		assertThat(SearchService.fuse(List.of(A, B, C), List.of(C, D))).containsExactly(C, A, B, D);
	}

	@Test
	void anItemTopOfOneListBeatsAnItemLowInBoth() {
		assertThat(SearchService.fuse(List.of(A, B), List.of(C, A))).containsExactly(A, C, B);
	}

	@Test
	void whenScoresTieTheFirstListWinsAndNothingAppearsTwice() {
		assertThat(SearchService.fuse(List.of(A), List.of(B))).containsExactly(A, B);
		assertThat(SearchService.fuse(List.of(A, A), List.of())).containsExactly(A);
		assertThat(SearchService.fuse(List.of(), List.of())).isEmpty();
	}

}
